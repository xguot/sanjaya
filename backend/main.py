import crochet
crochet.setup()

from fastapi import FastAPI, BackgroundTasks, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import uuid
import subprocess
import os
import csv
import json
import zipfile
import httpx
import datetime
import sys
from typing import List, Optional
from scrapy.crawler import CrawlerRunner
from scrapy.utils.log import configure_logging
from scrapy.utils.project import get_project_settings
from scrapy.settings import Settings

app = FastAPI(title="Sanjaya API")

# Allow SvelteKit to talk to FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory job store
jobs = {}

# [ENGINEER CRITICAL] Robust Path Resolution
def get_resource_path(relative_path):
    """Get absolute path to resource, works for dev and for PyInstaller."""
    try:
        # PyInstaller creates a temp folder and stores path in _MEIPASS
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_path, relative_path)

BASE_DIR = get_resource_path("")

if BASE_DIR not in sys.path:
    sys.path.append(BASE_DIR)

# Import spider after sys.path update
from sanjaya.spiders.sanjaya import SanjayaSpider

DATA_DIR = os.path.join(BASE_DIR, "data")
if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)

class UrlListPayload(BaseModel):
    urls: List[str]

# [ENGINEER CRITICAL] Scrapy execution with Crochet
def get_sanjaya_settings(output_file: str):
    """Configures Scrapy settings for the bundled environment."""
    settings = Settings()
    # Explicitly point to the bundled settings and spiders
    settings.set('SPIDER_MODULES', ['sanjaya.spiders'])
    settings.set('NEWSPIDER_MODULE', 'sanjaya.spiders')
    settings.set('FEED_FORMAT', 'csv')
    settings.set('FEED_URI', output_file)
    settings.set('TWISTED_REACTOR', 'twisted.internet.asyncioreactor.AsyncioSelectorReactor')
    settings.set('DOWNLOAD_HANDLERS', {
        "http": "scrapy_playwright.handler.ScrapyPlaywrightDownloadHandler",
        "https": "scrapy_playwright.handler.ScrapyPlaywrightDownloadHandler",
    })
    settings.set('PLAYWRIGHT_LAUNCH_OPTIONS', {"headless": True}, priority='project')
    settings.set('LOG_LEVEL', 'INFO')
    settings.set('REQUEST_FINGERPRINTER_IMPLEMENTATION', '2.7')
    return settings

@crochet.run_in_reactor
def run_spider_in_reactor(urls_str: str, output_file: str):
    """Runs Scrapy spider inside the crochet-managed reactor thread."""
    settings = get_sanjaya_settings(output_file)
    runner = CrawlerRunner(settings)
    return runner.crawl(SanjayaSpider, start_urls=urls_str)

def run_scrapy_spider(job_id: str, start_urls: List[str]):
    """Orchestrates the Scrapy job and monitors completion."""
    jobs[job_id]["status"] = "processing"
    
    urls_str = ",".join(start_urls)
    output_file = os.path.join(DATA_DIR, f"{job_id}.csv")
    
    try:
        # Start the crawl in a background thread managed by crochet
        crawl_deferred = run_spider_in_reactor(urls_str, output_file)
        
        def update_job_status(success):
            if success and os.path.exists(output_file) and os.path.getsize(output_file) > 0:
                jobs[job_id]["status"] = "completed"
                jobs[job_id]["completed_at"] = datetime.datetime.now().isoformat()
            else:
                jobs[job_id]["status"] = "failed"
                jobs[job_id]["error"] = "Extraction failed or produced no results."

        # Register callbacks for the deferred
        crawl_deferred.addCallback(lambda _: update_job_status(True))
        crawl_deferred.addErrback(lambda e: update_job_status(False))

    except Exception as e:
        print(f"Scrapy Dispatch Exception: {e}")
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)

@app.on_event("startup")
async def startup_event():
    """Automate Playwright browser provisioning on first run without blocking."""
    import subprocess
    import sys
    from fastapi import BackgroundTasks
    
    def install_playwright():
        print("Verifying Playwright dependencies...")
        try:
            # Programmatically trigger the playwright install command
            subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=True)
            print("Playwright Chromium is ready.")
        except Exception as e:
            print(f"Auto-provisioning failed: {e}")

    # Use a thread or simple background execution if BackgroundTasks isn't available here
    import threading
    threading.Thread(target=install_playwright).start()

@app.get("/api/discovery/openalex")
async def discover_openalex(query: str = Query(..., min_length=1)):
    """Query OpenAlex for relevant papers."""
    url = f"https://api.openalex.org/works?search={query}&per_page=50&mailto=sanjaya-app@example.com"
    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            response = await client.get(url)
            if response.status_code != 200:
                print(f"OpenAlex API Error: {response.text}")
                raise HTTPException(status_code=response.status_code, detail=f"OpenAlex Error: {response.text}")
            
            data = response.json()
            results = []
            for work in data.get("results", []):
                primary_loc = work.get("primary_location") or {}
                authorships = work.get("authorships") or []
                
                results.append({
                    "id": work.get("id"),
                    "title": work.get("display_name"),
                    "doi": work.get("doi"),
                    "url": work.get("doi") or primary_loc.get("landing_page_url"),
                    "publication_year": work.get("publication_year"),
                    "authors": [
                        (auth.get("author") or {}).get("display_name") 
                        for auth in authorships if auth.get("author")
                    ][:3]
                })
            return {"count": data.get("meta", {}).get("count", 0), "results": results}
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            import traceback
            traceback.print_exc()
            return JSONResponse(
                status_code=500, 
                content={"detail": f"Discovery Engine Error: {str(e)}"}
            )

@app.post("/api/scrape/urls")
async def scrape_urls(payload: UrlListPayload, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    urls = [url.strip() for url in payload.urls if url.strip()]
    
    if not urls:
        raise HTTPException(status_code=400, detail="No URLs provided")
    
    jobs[job_id] = {
        "status": "queued", 
        "urls": urls, 
        "created_at": datetime.datetime.now().isoformat()
    }
    background_tasks.add_task(run_scrapy_spider, job_id, urls)
    return {"job_id": job_id, "status": "queued"}

@app.get("/api/jobs/{job_id}")
async def get_job_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job_response = {**job, "job_id": job_id}
    
    if job["status"] == "completed":
        csv_path = os.path.join(DATA_DIR, f"{job_id}.csv")
        preview = []
        if os.path.exists(csv_path):
            try:
                with open(csv_path, newline='', encoding='utf-8') as csvfile:
                    reader = csv.DictReader(csvfile)
                    for i, row in enumerate(reader):
                        if i >= 3:
                            break
                        preview.append(row)
            except Exception as e:
                print(f"Error reading preview: {e}")
        job_response["preview"] = preview
        
    return job_response

@app.get("/api/download/{job_id}")
async def download_file(job_id: str, format: str = "csv"):
    csv_path = os.path.join(DATA_DIR, f"{job_id}.csv")
    if not os.path.exists(csv_path):
        raise HTTPException(status_code=404, detail="Result file not found")

    if format == "csv":
        return FileResponse(csv_path, filename=f"sanjaya_{job_id}.csv", media_type="text/csv")
    
    elif format == "json":
        json_path = os.path.join(DATA_DIR, f"{job_id}.json")
        data = []
        with open(csv_path, newline='', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            data = [row for row in reader]
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return FileResponse(json_path, filename=f"sanjaya_{job_id}.json", media_type="application/json")
    
    elif format == "zip":
        zip_path = os.path.join(DATA_DIR, f"{job_id}.zip")
        manifest_path = os.path.join(DATA_DIR, f"{job_id}_manifest.txt")
        
        job = jobs.get(job_id, {})
        with open(manifest_path, 'w', encoding='utf-8') as f:
            f.write("Sanjaya Extraction Audit Log\n")
            f.write("============================\n")
            f.write(f"Timestamp: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Job ID: {job_id}\n")
            f.write(f"URL Count: {len(job.get('urls', []))}\n")
            f.write("\nURLs Processed:\n")
            for url in job.get("urls", []):
                f.write(f"- {url}\n")
        
        with zipfile.ZipFile(zip_path, 'w') as zipf:
            zipf.write(csv_path, arcname="data.csv")
            zipf.write(manifest_path, arcname="manifest.txt")
            
        return FileResponse(zip_path, filename=f"sanjaya_{job_id}.zip", media_type="application/zip")
    
    else:
        raise HTTPException(status_code=400, detail="Invalid format. Supported: csv, json, zip")

@app.get("/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.datetime.now().isoformat()}

if __name__ == "__main__":
    import uvicorn
    import argparse
    import multiprocessing
    
    # [ENGINEER CRITICAL] Required for PyInstaller + multiprocessing
    multiprocessing.freeze_support()
    
    parser = argparse.ArgumentParser(description="Run the Sanjaya API server.")
    parser.add_argument("--port", type=int, default=8844, help="Port to run the server on.")
    args = parser.parse_args()
    
    uvicorn.run(app, host="0.0.0.0", port=args.port)

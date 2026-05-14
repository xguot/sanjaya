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
from typing import List, Optional

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

import sys

# Ensure data directory exists
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# [BUNDLING] Fix for PyInstaller _MEIPASS
if getattr(sys, 'frozen', False):
    BASE_DIR = sys._MEIPASS

DATA_DIR = os.path.join(BASE_DIR, "data")
if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)

class UrlListPayload(BaseModel):
    urls: List[str]

def run_scrapy_spider(job_id: str, start_urls: List[str]):
    """Executes the Scrapy CLI command using the current python module."""
    jobs[job_id]["status"] = "processing"
    
    urls_str = ",".join(start_urls)
    output_file = os.path.join(DATA_DIR, f"{job_id}.csv")
    
    # Use sys.executable -m scrapy to ensure we use the bundled engine
    # In dev mode, sys.executable is the venv python.
    # In prod mode (PyInstaller), sys.executable is the bundled binary.
    cmd = [
        sys.executable, 
        "-m", "scrapy", 
        "crawl", "sanjaya", 
        "-a", f"start_urls={urls_str}", 
        "-o", output_file
    ]
    
    try:
        # Run subprocess with environment variables to ensure module discovery
        env = os.environ.copy()
        env["PYTHONPATH"] = BASE_DIR
        
        result = subprocess.run(cmd, cwd=BASE_DIR, capture_output=True, text=True, env=env)
        if result.returncode == 0:
            # Check if the output file exists and has content
            if os.path.exists(output_file) and os.path.getsize(output_file) > 0:
                jobs[job_id]["status"] = "completed"
                jobs[job_id]["completed_at"] = datetime.datetime.now().isoformat()
            else:
                jobs[job_id]["status"] = "failed"
                jobs[job_id]["error"] = "Extraction finished but no content was found. The target pages might be protected or have unsupported structures."
        else:
            print(f"Scrapy Error: {result.stderr}")
            jobs[job_id]["status"] = "failed"
            jobs[job_id]["error"] = result.stderr
    except Exception as e:
        print(f"Subprocess Exception: {e}")
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)

@app.get("/api/discovery/openalex")
async def discover_openalex(query: str = Query(..., min_length=1)):
    """Query OpenAlex for relevant papers."""
    # OpenAlex uses 'per_page' instead of 'limit'
    # Adding mailto is recommended for the 'polite' pool
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
                # Robustly handle nested Nones in the API response
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
            raise HTTPException(status_code=500, detail=f"Discovery failed: {str(e)}")

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
    
    # Ensure job_id is included in the response
    job_response = {**job, "job_id": job_id}
    
    # Add a preview if completed
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
        
        # Create manifest
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

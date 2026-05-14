# 👁️ Sanjaya Data Extractor

A professional, asynchronous web scraping and discovery pipeline designed for quantitative researchers. Sanjaya automates the retrieval of Mandarin and English text from academic journals, outputting structured datasets (.CSV, .JSON) ready for downstream NLP pipelines and statistical analysis.

## Architecture & Tools

Sanjaya utilizes a decoupled architecture to ensure non-blocking, massive-scale data extraction.

* **Frontend:** React (Vite), TypeScript, Tailwind CSS, `lucide-react`
* **Backend API:** FastAPI (Python)
* **Extraction Engine:** Scrapy integrated with `scrapy-playwright` (for automated headless JS rendering and dynamic site fallback)

## Supported Databases & APIs

* **Discovery Engine:** OpenAlex Academic Graph API
* **Targeted Extraction Sources:** BNU Developmental Psychology, CNKI (General), and direct URL/DOI ingestion.

---

## Local Development Setup

Because Sanjaya uses a decoupled architecture, you must run the backend and frontend in two separate terminal sessions.

### 1. Backend & Scrapy Worker (Terminal 1)
Initialize the Python environment and install the necessary scraping engines, including Chromium binaries for the Playwright fallback.

```bash
# Navigate to the backend directory
cd backend

# Initialize and activate the virtual environment
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies and Playwright binaries
pip install fastapi uvicorn scrapy scrapy-playwright pandas httpx
playwright install chromium

# Boot the FastAPI server
uvicorn main:app --reload
```

### 2. React Frontend (Terminal 2)
Initialize the Vite development server.

```bash
# Navigate to the frontend directory
cd frontend

# Install Node dependencies
npm install

# Start the Vite development server
npm run dev
```

## Usage Workflow
1. **Open http://localhost:5173** in your browser.

2. **Academic Graph Search:** Enter keywords (e.g., "cognitive behavioral therapy") to query the OpenAlex database and selectively queue discovered papers for extraction.

3. **Sniper Mode:** Toggle to "Target URLs" to paste specific DOIs or journal links directly into the engine.

4. **Extract & Export:** Initialize the Sanjaya engine and monitor the extraction log. Once finalized, download your structured artifacts as .CSV, .JSON, or a full .ZIP archive containing an automated audit log for research replicability.

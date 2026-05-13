# Sanjaya Data Extractor

Professional web scraping application for quantitative researchers to extract Mandarin and English text from academic journals.

## Architecture
- **Frontend**: SvelteKit (TypeScript + TailwindCSS)
- **Backend**: FastAPI (Python)
- **Scraper**: Scrapy (with Playwright fallback)

## Setup

### 1. Scraper Dependencies (Root)
Ensure you have the virtual environment set up and Playwright installed:
```bash
python3 -m venv venv
source venv/bin/activate
pip install scrapy scrapy-playwright pandas
playwright install chromium
```

### 2. Backend (FastAPI)
```bash
cd backend
pip install -r requirements.txt
python3 main.py
```

### 3. Frontend (SvelteKit)
```bash
cd frontend
npm install
npm run dev
```

## Usage
1. Open `http://localhost:5173` in your browser.
2. Paste target article or volume URLs into the textarea.
3. Click "Run Sanjaya".
4. Monitor progress and download the results in your preferred format (.CSV, .JSON, or .ZIP).

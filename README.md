# 👁️ Sanjaya
Academic extraction engine for quantitative researchers.

### Features
- **Discovery:** Integrated OpenAlex Academic Graph API.
- **Extraction:** Scrapy/Playwright for English & Mandarin journals.
- **Export:** Structured .CSV, .JSON, and .ZIP datasets.

### Setup & Dev

#### Terminal 1: Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```
*(Runs on http://localhost:8000)*

#### Terminal 2: Frontend
```bash
cd frontend
npm install
npm run dev
```
*(Runs on http://localhost:5173)*

### Deployment
Sanjaya is now a decoupled web application. Deploy the FastAPI backend to any Python host and the React frontend to any static site host (Vercel, Netlify, etc.).

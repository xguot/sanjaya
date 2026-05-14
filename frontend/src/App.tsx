/// <reference types="vite/client" />
import { useState, useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Eye, 
  Search, 
  Terminal, 
  Share, 
  Database,
  AlertCircle,
  FileText,
  Code,
  Archive,
  Play,
  Download,
  CheckCircle2,
  Loader2,
  Moon,
  Sun,
  BookOpen
} from 'lucide-react';

// [TYPES] Core data structures
interface Paper {
  id: string;
  title: string;
  url: string;
  doi?: string;
  publication_year?: number;
  authors: string[];
}

interface ExtractionJob {
  job_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  preview?: any[];
  error?: string;
}

enum View {
  TargetScraping = 'TargetScraping',
  Extraction = 'Extraction',
  Export = 'Export',
  Documentation = 'Documentation'
}

const RAW_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
const API_BASE = RAW_BASE.endsWith('/api') ? RAW_BASE : `${RAW_BASE.replace(/\/$/, '')}/api`;

export default function App() {
  const [currentView, setCurrentView] = useState<View>(View.TargetScraping);
  const [keyword, setKeyword] = useState('');
  const [discoveryResults, setDiscoveryResults] = useState<Paper[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [inputUrls, setInputUrls] = useState('');
  const [job, setJob] = useState<ExtractionJob | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchOpenAlex = async () => {
    if (!keyword.trim()) return;
    setIsSearching(true);
    setError(null);
    setDiscoveryResults([]);
    setSelectedUrls(new Set());
    
    try {
      const res = await fetch(`${API_BASE}/discovery/openalex?query=${encodeURIComponent(keyword)}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Connection to Backend Failed (Discovery)');
      }
      const data = await res.json();
      setDiscoveryResults(data.results);
      setSelectedUrls(new Set(data.results.map((r: Paper) => r.url)));
    } catch (e: any) {
      console.error('Discovery Fetch Error:', e);
      setError(e.message === 'Failed to fetch' ? 'Connection to Backend Failed (Engine Offline)' : e.message);
    } finally {
      setIsSearching(false);
    }
  };

  const startExtraction = async (targetUrls?: string[]) => {
    const urls = targetUrls || (currentView === View.TargetScraping 
      ? Array.from(selectedUrls) 
      : inputUrls.split('\n').map(u => u.trim()).filter(u => u));

    if (urls.length === 0) {
      setError("No valid target identifiers found.");
      return;
    }

    setInputUrls(urls.join('\n'));
    setIsExtracting(true);
    setError(null);
    setJob({ job_id: '', status: 'queued' });
    setCurrentView(View.Extraction);
    
    try {
      const res = await fetch(`${API_BASE}/scrape/urls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls })
      });
      if (!res.ok) throw new Error('Extraction initialization failed');
      const data = await res.json();
      setJob(data);
      setActiveJobId(data.job_id);
      pollStatus(data.job_id);
    } catch (e: any) {
      setError(e.message);
      setIsExtracting(false);
      setCurrentView(View.TargetScraping);
    }
  };

  const pollStatus = (id: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/jobs/${id}`);
        if (!res.ok) throw new Error('State synchronization failure');
        const data = await res.json();
        setJob(data);
        
        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(interval);
          setIsExtracting(false);
          if (data.status === 'completed') setCurrentView(View.Export);
        }
      } catch (e: any) {
        clearInterval(interval);
        setIsExtracting(false);
        setError(e.message);
      }
    }, 2000);
  };

  const toggleUrl = (url: string) => {
    const next = new Set(selectedUrls);
    if (next.has(url)) next.delete(url);
    else next.add(url);
    setSelectedUrls(next);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50 text-slate-800">
      <header className="h-16 flex-shrink-0 bg-white border-b border-slate-200 px-8 flex items-center justify-between z-30 transition-colors shadow-sm">
        <div className="flex items-center gap-3">
          <Eye className="text-sky-700" size={24} />
          <h1 className="text-2xl font-serif font-bold text-slate-800">Sanjaya</h1>
        </div>
        <div className="flex items-center gap-6">
          <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
            <button 
              onClick={() => setCurrentView(View.TargetScraping)}
              className={`${currentView !== View.Documentation ? 'text-sky-700' : 'text-slate-500 hover:text-slate-800'} transition-colors`}
            >
              Dashboard
            </button>
            <button 
              onClick={() => setCurrentView(View.Documentation)}
              className={`${currentView === View.Documentation ? 'text-sky-700' : 'text-slate-500 hover:text-slate-800'} transition-colors`}
            >
              Documentation
            </button>
          </nav>
          <div className="h-6 w-[1px] bg-slate-200 hidden md:block"></div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 flex-shrink-0 bg-slate-100 border-r border-slate-200 flex flex-col p-6 z-20 transition-colors shadow-sm">
          <div className="mb-8 border-b border-slate-200 pb-6">
            <h2 className="text-xl font-serif font-semibold text-slate-800">Control Panel</h2>
            <p className="text-xs font-mono text-slate-500 mt-1 uppercase tracking-tighter">System Engine</p>
          </div>

          <nav className="flex-1 space-y-1">
            <NavItem active={currentView === View.TargetScraping} icon={<Search size={20} />} label="Target Scraping" onClick={() => setCurrentView(View.TargetScraping)} />
            <NavItem active={currentView === View.Extraction} icon={<Terminal size={20} />} label="Extraction" onClick={() => setCurrentView(View.Extraction)} />
            <NavItem active={currentView === View.Export} icon={<Share size={20} />} label="Export" onClick={() => setCurrentView(View.Export)} />
          </nav>

          <button 
            onClick={() => startExtraction()}
            disabled={isExtracting}
            className="mt-auto w-full bg-sky-700 text-white font-mono text-xs py-3 rounded-sm hover:bg-sky-800 transition-colors uppercase tracking-wider font-semibold disabled:opacity-50"
          >
            {isExtracting ? 'Engine Active' : 'Initialize Sanjaya'}
          </button>
        </aside>

        <main className="flex-1 overflow-y-auto relative bg-slate-50 transition-colors">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="p-8 h-full"
            >
              {currentView === View.TargetScraping && (
                <DiscoveryView 
                  keyword={keyword}
                  setKeyword={setKeyword}
                  isSearching={isSearching}
                  isExtracting={isExtracting}
                  results={discoveryResults}
                  selectedUrls={selectedUrls}
                  onSearch={searchOpenAlex}
                  onToggle={toggleUrl}
                  onSelectAll={() => setSelectedUrls(new Set(discoveryResults.map(r => r.url)))}
                  onClear={() => setSelectedUrls(new Set())}
                  onExtract={() => startExtraction()}
                />
              )}
              {currentView === View.Extraction && (
                <ExtractionView 
                  inputUrls={inputUrls}
                  setInputUrls={setInputUrls}
                  job={job}
                  isExtracting={isExtracting}
                  onExecute={() => startExtraction()}
                />
              )}
              {currentView === View.Export && (
                <ExportView job={job} activeJobId={activeJobId} />
              )}
              {currentView === View.Documentation && (
                <DocumentationView />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      {error && (
        <div className="fixed bottom-6 right-6 bg-red-600 text-white px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3 z-50">
          <AlertCircle size={20} />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}
    </div>
  );
}

function NavItem({ active, icon, label, onClick }: { active: boolean, icon: ReactNode, label: string, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-all duration-200 border-l-4 ${
        active
          ? 'bg-sky-50 text-sky-700 border-sky-700 font-medium'
          : 'text-slate-500 border-transparent hover:bg-slate-200 hover:text-slate-800'
      }`}
    >
      {icon}
      <span className="text-sm font-mono tracking-tight">{label}</span>
    </button>
  );
}
// --- View Components ---

function DocumentationView() {
  return (
    <div className="max-w-4xl space-y-10 pb-20">
      <div>
        <h2 className="text-3xl font-serif font-bold text-slate-800 mb-2">Usage Guide</h2>
        <p className="text-slate-500">Fast tracking for Sanjaya extraction.</p>
      </div>

      <div className="grid gap-6">
        <DocSection icon={<Search />} title="1. Target Scraping">
          Search via OpenAlex (supports <strong>Mandarin/English</strong>). Select papers and click 'Extract' to begin.
        </DocSection>
        <DocSection icon={<Terminal />} title="2. Extraction Protocol">
          Monitor real-time logs. The engine uses <strong>Scrapy + Playwright</strong> to handle dynamic content automatically.
        </DocSection>
        <DocSection icon={<Share />} title="3. Export Artifacts">
          Download results as <strong>CSV</strong>, <strong>JSON</strong>, or <strong>ZIP</strong> (includes audit log manifest).
        </DocSection>
      </div>

      <div className="p-6 border border-slate-200 rounded-xl bg-white">
        <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
          <Code size={16} className="text-sky-700" /> Technical Stack
        </h4>
        <p className="text-xs text-slate-500 leading-relaxed">
          Powered by Python Scrapy for high-performance crawling and Playwright for Chromium-based dynamic site rendering.
        </p>
      </div>
    </div>
  );
}

function DocSection({ icon, title, children }: any) {
  return (
    <div className="flex gap-4 p-6 border border-slate-200 rounded-xl bg-white shadow-sm">
      <div className="text-sky-700">{icon}</div>
      <div>
        <h4 className="font-bold text-slate-800 mb-1">{title}</h4>
        <p className="text-sm text-slate-500 leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

function DiscoveryView({ keyword, setKeyword, isSearching, isExtracting, results, selectedUrls, onSearch, onToggle, onSelectAll, onClear, onExtract }: any) {
  return (
    <div className="max-w-5xl relative">
      <div className="mb-12">
        <h2 className="text-4xl font-serif font-bold text-slate-800 mb-4">Target Scraping</h2>
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input 
              type="text" 
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSearch()}
              placeholder="Search via OpenAlex (e.g., '抑郁', 'genomic sequencing')..." 
              className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-sky-700/10 focus:border-sky-700 outline-none transition-all font-mono text-slate-800 placeholder:text-slate-400"
            />
          </div>
          <button 
            onClick={onSearch}
            disabled={isSearching}
            className="px-8 bg-sky-700 text-white font-bold rounded-xl hover:bg-sky-800 transition-colors disabled:opacity-50"
          >
            {isSearching ? <Loader2 className="animate-spin" /> : 'Run Discovery'}
          </button>
        </div>
      </div>

      {results.length === 0 && !isSearching && (
        <div className="mt-20 flex flex-col items-center justify-center text-center space-y-8 animate-in fade-in zoom-in duration-500">
          <div className="w-20 h-20 bg-sky-50 rounded-full flex items-center justify-center text-sky-700 text-3xl shadow-inner border border-sky-100">
            🔭
          </div>
          <div className="max-w-md space-y-4">
            <h3 className="text-3xl font-serif font-bold text-slate-800">Ready for Discovery</h3>
            <p className="text-sm text-slate-500 leading-relaxed px-4">
              The engine is currently connected to the <strong>OpenAlex Global Graph</strong>. Enter keywords above to retrieve entities for extraction.
            </p>
            <div className="mx-8 p-6 bg-sky-50/50 rounded-2xl border border-dashed border-sky-200">
              <p className="text-[10px] text-sky-700 font-bold uppercase tracking-widest mb-2">Paper not in database?</p>
              <p className="text-xs text-slate-600 italic">
                Navigate to the <strong>Extraction</strong> tab and use <strong>Sniper Mode</strong> to paste the direct URL or DOI.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 items-center pt-8">
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em]">Stack Architecture</span>
            <div className="flex gap-4 items-center px-4 py-2 bg-white border border-slate-200 rounded-full shadow-sm">
              <span className="text-[11px] font-bold text-slate-600">OpenAlex</span>
              <div className="w-1 h-1 bg-slate-200 rounded-full"></div>
              <span className="text-[11px] font-bold text-slate-600">Scrapy</span>
              <div className="w-1 h-1 bg-slate-200 rounded-full"></div>
              <span className="text-[11px] font-bold text-slate-600">Playwright</span>
            </div>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24">
          <div className="flex justify-between items-end mb-6 pb-4 border-b border-slate-200">
            <div>
              <h3 className="text-xl font-serif font-bold text-slate-800">Discovered Literature</h3>
              <p className="text-xs font-mono text-slate-500 mt-1">Found {results.length} results</p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={onSelectAll} 
                className="px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors border border-sky-100"
              >
                Select All
              </button>
              <button 
                onClick={onClear} 
                className="px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-100"
              >
                Clear Selection
              </button>
            </div>
          </div>

          <div className="grid gap-3">
            {results.map((paper: Paper) => (
              <div 
                key={paper.url} 
                onClick={() => onToggle(paper.url)}
                className={`flex gap-4 p-4 border rounded-xl transition-all cursor-pointer ${
                  selectedUrls.has(paper.url) 
                    ? 'bg-sky-50 border-sky-700 shadow-md' 
                    : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                }`}
              >
                <div className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                  selectedUrls.has(paper.url) ? 'bg-sky-700 border-sky-700 text-white' : 'bg-white border-slate-200'
                }`}>
                  {selectedUrls.has(paper.url) && <CheckCircle2 size={14} />}
                </div>
                <div className="flex-1">
                  <h4 className="font-serif font-bold text-slate-800 leading-snug mb-1">{paper.title}</h4>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
                    <span>{paper.publication_year}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                    <span className="truncate max-w-xs">{paper.authors.join(', ')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {selectedUrls.size > 0 && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-8 duration-300">
              <button 
                onClick={onExtract}
                disabled={isExtracting}
                className="bg-sky-700 text-white px-8 py-4 rounded-full font-bold shadow-2xl hover:bg-sky-800 transition-all flex items-center gap-3 ring-4 ring-white disabled:opacity-70"
              >
                {isExtracting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Play size={18} fill="currentColor" />
                )}
                {isExtracting ? 'Initializing Engine...' : `Extract Selected Papers (${selectedUrls.size})`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExtractionView({ inputUrls, setInputUrls, job, isExtracting, onExecute }: any) {
  return (
    <div className="h-full flex flex-col max-w-6xl">
      <div className="mb-8">
        <h2 className="text-4xl font-serif font-bold text-slate-800 mb-2">Extraction Protocol</h2>
        <p className="text-sm text-slate-500">Configure target identifiers and monitor the extraction pipeline.</p>
      </div>

      <div className="flex-1 grid grid-cols-12 gap-8 overflow-hidden">
        <div className="col-span-5 flex flex-col gap-6">
          <div className="flex-1 flex flex-col border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-sm">
            <div className="px-6 py-3 border-b border-slate-200 bg-slate-100 flex justify-between items-center">
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold">Target Identifiers</span>
              <span className="text-[10px] font-mono text-slate-500">Bulk Mode</span>
            </div>
            <textarea 
              value={inputUrls}
              onChange={(e) => setInputUrls(e.target.value)}
              placeholder="Paste URLs or DOIs (one per line)..."
              className="flex-1 p-6 font-mono text-xs outline-none bg-white resize-none text-slate-800 placeholder:text-slate-400"
            />
            <div className="p-4 border-t border-slate-200 flex justify-between items-center bg-slate-50">
              <span className="text-[10px] font-mono text-slate-500">{(inputUrls || '').split('\n').filter((u: string) => u.trim()).length} Targets Loaded</span>
              <button 
                onClick={onExecute}
                disabled={isExtracting}
                className="px-6 py-2.5 bg-sky-700 text-white font-mono text-[10px] font-bold uppercase tracking-widest rounded-lg flex items-center gap-2 hover:bg-sky-800 transition-colors disabled:opacity-50"
              >
                {isExtracting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
                Run Sanjaya
              </button>
            </div>
          </div>
        </div>

        <div className="col-span-7 bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-2xl flex flex-col">
          <div className="px-5 py-3 border-b border-white/5 flex justify-between items-center">
             <div className="flex items-center gap-2">
                <Terminal size={14} className="text-sky-300" />
                <span className="text-[10px] font-mono text-sky-300 uppercase tracking-widest font-bold">Engine Kernel Log</span>
             </div>
             <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-white/10"></div>
                <div className="w-2 h-2 rounded-full bg-white/10"></div>
                <div className="w-2 h-2 rounded-full bg-white/10"></div>
             </div>
          </div>
          <div className="flex-1 p-6 font-mono text-[11px] overflow-y-auto space-y-2 bg-slate-900">
            {!job ? (
              <div className="text-white/20 italic">Awaiting target initialization...</div>
            ) : (
              <>
                <div className="text-white/40">[{new Date().toLocaleTimeString()}] System kernel initialized.</div>
                <div className="text-sky-300">[{new Date().toLocaleTimeString()}] Job ID: {job.job_id}</div>
                <div className="text-blue-300">[{new Date().toLocaleTimeString()}] Status: {job.status}</div>
                {job.status === 'processing' && (
                  <div className="text-slate-300 animate-pulse">[{new Date().toLocaleTimeString()}] Crawling remote academic servers...</div>
                )}
                {job.status === 'completed' && (
                  <div className="text-emerald-400">[{new Date().toLocaleTimeString()}] Extraction successfully finalized.</div>
                )}
                {job.status === 'failed' && (
                  <div className="text-red-400">[{new Date().toLocaleTimeString()}] Fatal: {job.error}</div>
                )}
              </>
            )}
            {isExtracting && <div className="text-sky-300 animate-pulse">_</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ExportView({ job, activeJobId }: any) {
  const preview = job?.preview || [];
  const isReady = job?.status === 'completed';
  const displayId = activeJobId || job?.job_id;

  return (
    <div className="h-full flex flex-col max-w-6xl">
      <div className="mb-10 flex items-center justify-between">
        <div>
          <h2 className="text-4xl font-serif font-bold text-slate-800 mb-2">Export Artifacts</h2>
          <p className="text-sm text-slate-500">Download structured data for downstream quantitative analysis.</p>
        </div>
        {displayId && (
           <div className="text-right">
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold">Session Reference</span>
              <p className="font-mono text-xs text-sky-700">{displayId}</p>
           </div>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-10">
        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <h3 className="text-lg font-serif font-semibold text-slate-800 flex items-center gap-3">
               <Database size={18} className="text-slate-400" />
               Dataset Preview
            </h3>
            <span className="text-[10px] font-mono text-slate-400 bg-white border border-slate-200 px-2 py-1 rounded">Sample Rows</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-100 text-[10px] font-mono text-slate-700 uppercase tracking-widest border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left border-r border-slate-200">Reference URL</th>
                  <th className="px-6 py-4 text-left border-r border-slate-200">Method</th>
                  <th className="px-6 py-4 text-left">Text Fragment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.length > 0 ? preview.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-[11px] font-mono text-sky-700 truncate max-w-[200px]">{row.url}</td>
                    <td className="px-6 py-4">
                      <span className="bg-slate-100 text-[10px] font-mono px-2 py-0.5 rounded text-slate-800">{row.extraction_method}</span>
                    </td>
                    <td className="px-6 py-4 text-[11px] text-slate-500 line-clamp-1">{row.content?.slice(0, 150)}...</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={3} className="px-6 py-12 text-center text-slate-300 italic font-serif">
                      {isReady ? "No data extracted. The target pages may have been unreachable or empty." : "Awaiting extraction finalization..."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ExportCard 
            icon={<FileText size={24} />} 
            title="Spreadsheet" 
            format=".CSV" 
            desc="Optimized for Excel and R statistical ingestion." 
            href={isReady && displayId ? `${API_BASE}/download/${displayId}?format=csv` : '#'}
          />
          <ExportCard 
            icon={<Code size={24} />} 
            title="Machine Readable" 
            format=".JSON" 
            desc="Structured data for NLP pipelines and API integration." 
            href={isReady && displayId ? `${API_BASE}/download/${displayId}?format=json` : '#'}
            recommended
          />
          <ExportCard 
            icon={<Archive size={24} />} 
            title="Full Archive" 
            format=".ZIP" 
            desc="Dataset + Automated Audit Log and Manifest." 
            href={isReady && displayId ? `${API_BASE}/download/${displayId}?format=zip` : '#'}
          />
        </div>
      </div>
    </div>
  );
}

function ExportCard({ icon, title, format, desc, href, recommended }: any) {
  const active = href !== '#';
  return (
    <a 
      href={href}
      download
      className={`relative p-8 border rounded-2xl flex flex-col h-full bg-white transition-all group ${
        !active ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:shadow-xl hover:border-sky-700 shadow-sm'
      } ${recommended ? 'ring-2 ring-sky-700 ring-offset-4 ring-offset-slate-50' : 'border-slate-200'}`}
    >
      {recommended && (
        <span className="absolute -top-3 left-8 px-2 py-1 bg-sky-700 text-white text-[8px] font-mono font-bold uppercase tracking-widest rounded shadow-lg">Recommended</span>
      )}
      <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-6 ${recommended ? 'bg-sky-700 text-white shadow-md' : 'bg-sky-50 text-sky-700'}`}>
        {icon}
      </div>
      <h4 className="text-xl font-serif font-bold text-slate-800 mb-1">{title}</h4>
      <p className="text-xs font-mono text-sky-700 mb-4">{format}</p>
      <p className="text-sm text-slate-500 mb-8 flex-1 leading-relaxed">{desc}</p>
      <div className={`w-full py-4 rounded-xl font-mono text-xs uppercase tracking-widest font-bold border transition-all flex items-center justify-center gap-3 ${
        recommended 
          ? 'bg-sky-700 text-white border-sky-700 hover:bg-sky-800' 
          : 'bg-white text-sky-700 border-sky-200 hover:bg-sky-50'
      }`}>
        <Download size={16} />
        Download Artifact
      </div>
    </a>
  );
}

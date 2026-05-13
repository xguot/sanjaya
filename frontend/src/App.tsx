import { useState, useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Eye, 
  UserCircle, 
  Settings, 
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
  ExternalLink,
  Loader2
} from 'lucide-react';

// [TYPES] Core data structures for academic entities and engine state
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
  Discovery = 'Discovery',
  Extraction = 'Extraction',
  Export = 'Export'
}

const API_BASE = 'http://localhost:8000/api';

export default function App() {
  const [currentView, setCurrentView] = useState<View>(View.Discovery);
  const [keyword, setKeyword] = useState('');
  const [discoveryResults, setDiscoveryResults] = useState<Paper[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [inputUrls, setInputUrls] = useState('');
  const [job, setJob] = useState<ExtractionJob | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // [DISCOVERY] Executes semantic search via OpenAlex API layer
  const searchOpenAlex = async () => {
    if (!keyword.trim()) return;
    setIsSearching(true);
    setError(null);
    setDiscoveryResults([]);
    setSelectedUrls(new Set());
    
    try {
      const res = await fetch(`${API_BASE}/discovery/openalex?query=${encodeURIComponent(keyword)}`);
      if (!res.ok) throw new Error('Discovery engine failure');
      const data = await res.json();
      setDiscoveryResults(data.results);
      setSelectedUrls(new Set(data.results.map((r: Paper) => r.url)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsSearching(false);
    }
  };

  // [ENGINE] Orchestrates Scrapy subprocess execution and job queuing
  const startExtraction = async (targetUrls?: string[]) => {
    const urls = targetUrls || (currentView === View.Discovery 
      ? Array.from(selectedUrls) 
      : inputUrls.split('\n').map(u => u.trim()).filter(u => u));

    if (urls.length === 0) {
      setError("No valid target identifiers found.");
      return;
    }

    setIsExtracting(true);
    setError(null);
    setJob({ job_id: '', status: 'queued' });
    
    try {
      const res = await fetch(`${API_BASE}/scrape/urls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls })
      });
      if (!res.ok) throw new Error('Extraction initialization failed');
      const data = await res.json();
      setJob(data);
      pollStatus(data.job_id);
    } catch (e: any) {
      setError(e.message);
      setIsExtracting(false);
    }
  };

  // [ROUTER] Handles long-polling for background task synchronization
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
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <header className="h-16 flex-shrink-0 bg-white border-b border-outline px-8 flex items-center justify-between z-30">
        <div className="flex items-center gap-3">
          <Eye className="text-secondary" size={24} />
          <h1 className="text-2xl font-serif font-bold text-primary">Sanjaya</h1>
        </div>
        <div className="flex items-center gap-4">
          <button className="p-2 rounded-full hover:bg-surface-low transition-colors text-on-surface-variant">
            <UserCircle size={24} />
          </button>
          <button className="p-2 rounded-full hover:bg-surface-low transition-colors text-on-surface-variant">
            <Settings size={24} />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 flex-shrink-0 bg-surface-low border-r border-outline flex flex-col p-6 z-20">
          <div className="mb-8 border-b border-outline pb-6">
            <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center text-white font-serif text-xl mb-4">S</div>
            <h2 className="text-xl font-serif font-semibold text-primary">Control Panel</h2>
            <p className="text-xs font-mono text-on-surface-variant mt-1">System Engine v1.0.4</p>
          </div>

          <nav className="flex-1 space-y-1">
            <NavItem active={currentView === View.Discovery} icon={<Search size={20} />} label="Discovery" onClick={() => setCurrentView(View.Discovery)} />
            <NavItem active={currentView === View.Extraction} icon={<Terminal size={20} />} label="Extraction" onClick={() => setCurrentView(View.Extraction)} />
            <NavItem active={currentView === View.Export} icon={<Share size={20} />} label="Export" onClick={() => setCurrentView(View.Export)} />
          </nav>

          <button 
            onClick={() => startExtraction()}
            disabled={isExtracting}
            className="mt-auto w-full bg-primary text-white font-mono text-xs py-3 rounded-sm hover:opacity-90 transition-opacity uppercase tracking-wider font-semibold disabled:opacity-50"
          >
            {isExtracting ? 'Engine Active' : 'Initialize Sanjaya'}
          </button>
        </aside>

        <main className="flex-1 overflow-y-auto relative bg-white">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="p-8 h-full"
            >
              {currentView === View.Discovery && (
                <DiscoveryView 
                  keyword={keyword}
                  setKeyword={setKeyword}
                  isSearching={isSearching}
                  results={discoveryResults}
                  selectedUrls={selectedUrls}
                  onSearch={searchOpenAlex}
                  onToggle={toggleUrl}
                  onSelectAll={() => setSelectedUrls(new Set(discoveryResults.map(r => r.url)))}
                  onClear={() => setSelectedUrls(new Set())}
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
                <ExportView job={job} />
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
          ? 'bg-accent/10 text-secondary border-secondary font-medium' 
          : 'text-on-surface-variant border-transparent hover:bg-surface-high hover:text-primary'
      }`}
    >
      {icon}
      <span className="text-sm font-mono tracking-tight">{label}</span>
    </button>
  );
}

// --- View Components ---

function DiscoveryView({ keyword, setKeyword, isSearching, results, selectedUrls, onSearch, onToggle, onSelectAll, onClear }: any) {
  return (
    <div className="max-w-5xl">
      <div className="mb-12">
        <h2 className="text-4xl font-serif font-bold text-primary mb-4">Academic Graph Search</h2>
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant" size={20} />
            <input 
              type="text" 
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSearch()}
              placeholder="Search via OpenAlex (e.g., 'cognitive neuroscience')..." 
              className="w-full pl-12 pr-4 py-4 bg-surface-low border border-outline rounded-xl focus:ring-4 focus:ring-secondary/10 focus:border-secondary outline-none transition-all font-mono"
            />
          </div>
          <button 
            onClick={onSearch}
            disabled={isSearching}
            className="px-8 bg-secondary text-white font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isSearching ? <Loader2 className="animate-spin" /> : 'Run Discovery'}
          </button>
        </div>
      </div>

      {results.length > 0 && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex justify-between items-end mb-6 pb-4 border-b border-outline">
            <div>
              <h3 className="text-xl font-serif font-bold text-primary">Discovered Literature</h3>
              <p className="text-xs font-mono text-on-surface-variant mt-1">Found {results.length} results</p>
            </div>
            <div className="flex gap-2">
              <button onClick={onSelectAll} className="px-3 py-1.5 border border-outline rounded text-[10px] font-mono uppercase bg-white hover:bg-surface-low">Select All</button>
              <button onClick={onClear} className="px-3 py-1.5 border border-outline rounded text-[10px] font-mono uppercase bg-white hover:bg-surface-low text-error">Clear</button>
            </div>
          </div>

          <div className="grid gap-3">
            {results.map((paper: Paper) => (
              <div 
                key={paper.url} 
                onClick={() => onToggle(paper.url)}
                className={`flex gap-4 p-4 border rounded-xl transition-all cursor-pointer ${
                  selectedUrls.has(paper.url) 
                    ? 'bg-secondary/5 border-secondary' 
                    : 'bg-white border-outline hover:border-slate-300'
                }`}
              >
                <div className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                  selectedUrls.has(paper.url) ? 'bg-secondary border-secondary text-white' : 'bg-white border-outline'
                }`}>
                  {selectedUrls.has(paper.url) && <CheckCircle2 size={14} />}
                </div>
                <div className="flex-1">
                  <h4 className="font-serif font-bold text-primary leading-snug mb-1">{paper.title}</h4>
                  <div className="flex items-center gap-3 text-[11px] text-on-surface-variant font-mono">
                    <span>{paper.publication_year}</span>
                    <span className="w-1 h-1 rounded-full bg-outline"></span>
                    <span className="truncate max-w-xs">{paper.authors.join(', ')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ExtractionView({ inputUrls, setInputUrls, job, isExtracting, onExecute }: any) {
  return (
    <div className="h-full flex flex-col max-w-6xl">
      <div className="mb-8">
        <h2 className="text-4xl font-serif font-bold text-primary mb-2">Extraction Protocol</h2>
        <p className="text-sm text-on-surface-variant">Configure target identifiers and monitor the extraction pipeline.</p>
      </div>

      <div className="flex-1 grid grid-cols-12 gap-8 overflow-hidden">
        <div className="col-span-5 flex flex-col gap-6">
          <div className="flex-1 flex flex-col border border-outline rounded-2xl bg-white overflow-hidden shadow-sm">
            <div className="px-6 py-3 border-b border-outline bg-surface-low flex justify-between items-center">
              <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-widest font-bold">Target Identifiers</span>
              <span className="text-[10px] font-mono text-on-surface-variant">Bulk Mode</span>
            </div>
            <textarea 
              value={inputUrls}
              onChange={(e) => setInputUrls(e.target.value)}
              placeholder="Paste URLs or DOIs (one per line)..."
              className="flex-1 p-6 font-mono text-xs outline-none bg-white resize-none"
            />
            <div className="p-4 border-t border-outline flex justify-between items-center bg-surface-low/50">
              <span className="text-[10px] font-mono text-on-surface-variant">{inputUrls.split('\n').filter(u => u.trim()).length} Targets Loaded</span>
              <button 
                onClick={onExecute}
                disabled={isExtracting}
                className="px-6 py-2.5 bg-slate-900 text-white font-mono text-[10px] font-bold uppercase tracking-widest rounded-lg flex items-center gap-2 hover:bg-black transition-colors disabled:opacity-50"
              >
                {isExtracting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
                Run Sanjaya
              </button>
            </div>
          </div>
        </div>

        <div className="col-span-7 bg-primary rounded-2xl border border-outline overflow-hidden shadow-2xl flex flex-col">
          <div className="px-5 py-3 border-b border-white/5 flex justify-between items-center bg-primary">
             <div className="flex items-center gap-2">
                <Terminal size={14} className="text-accent" />
                <span className="text-[10px] font-mono text-accent uppercase tracking-widest font-bold">Engine Kernel Log</span>
             </div>
             <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-white/10"></div>
                <div className="w-2 h-2 rounded-full bg-white/10"></div>
                <div className="w-2 h-2 rounded-full bg-white/10"></div>
             </div>
          </div>
          <div className="flex-1 p-6 font-mono text-[11px] overflow-y-auto space-y-2 bg-[#0c1322]">
            {!job ? (
              <div className="text-white/20 italic">Awaiting target initialization...</div>
            ) : (
              <>
                <div className="text-white/40">[{new Date().toLocaleTimeString()}] System kernel initialized.</div>
                <div className="text-accent">[{new Date().toLocaleTimeString()}] Job ID: {job.job_id}</div>
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
            {isExtracting && <div className="text-accent animate-pulse">_</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ExportView({ job }: any) {
  const preview = job?.preview || [];

  return (
    <div className="h-full flex flex-col max-w-6xl">
      <div className="mb-10 flex items-center justify-between">
        <div>
          <h2 className="text-4xl font-serif font-bold text-primary mb-2">Export Artifacts</h2>
          <p className="text-sm text-on-surface-variant">Download structured data for downstream quantitative analysis.</p>
        </div>
        {job?.job_id && (
           <div className="text-right">
              <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-widest font-bold">Session Reference</span>
              <p className="font-mono text-xs text-secondary">{job.job_id}</p>
           </div>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-10">
        <div className="border border-outline rounded-2xl overflow-hidden bg-white shadow-sm">
          <div className="px-6 py-4 bg-surface-low border-b border-outline flex justify-between items-center">
            <h3 className="text-lg font-serif font-semibold text-primary flex items-center gap-3">
               <Database size={18} className="text-on-surface-variant" />
               Dataset Preview
            </h3>
            <span className="text-[10px] font-mono text-on-surface-variant bg-white border border-outline px-2 py-1 rounded">Sample Rows</span>
          </div>
          <table className="w-full">
            <thead className="bg-slate-50 text-[10px] font-mono text-on-surface-variant uppercase tracking-widest border-b border-outline">
              <tr>
                <th className="px-6 py-4 text-left border-r border-outline">Reference URL</th>
                <th className="px-6 py-4 text-left border-r border-outline">Method</th>
                <th className="px-6 py-4 text-left">Text Fragment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline">
              {preview.length > 0 ? preview.map((row: any, i: number) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-[11px] font-mono text-secondary truncate max-w-[200px]">{row.url}</td>
                  <td className="px-6 py-4">
                    <span className="bg-slate-100 text-[10px] font-mono px-2 py-0.5 rounded text-primary">{row.extraction_method}</span>
                  </td>
                  <td className="px-6 py-4 text-[11px] text-on-surface-variant line-clamp-1">{row.content?.slice(0, 150)}...</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-slate-300 italic font-serif">No data preview available. Execute extraction to generate artifacts.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <ExportCard 
            icon={<FileText size={24} />} 
            title="Spreadsheet" 
            format=".CSV" 
            desc="Optimized for Excel and R statistical ingestion." 
            href={job?.job_id ? `${API_BASE}/download/${job.job_id}?format=csv` : '#'}
          />
          <ExportCard 
            icon={<Code size={24} />} 
            title="Machine Readable" 
            format=".JSON" 
            desc="Structured data for NLP pipelines and API integration." 
            href={job?.job_id ? `${API_BASE}/download/${job.job_id}?format=json` : '#'}
            recommended
          />
          <ExportCard 
            icon={<Archive size={24} />} 
            title="Full Archive" 
            format=".ZIP" 
            desc="Dataset + Automated Audit Log and Manifest." 
            href={job?.job_id ? `${API_BASE}/download/${job.job_id}?format=zip` : '#'}
          />
        </div>
      </div>
    </div>
  );
}

function ExportCard({ icon, title, format, desc, href, recommended }: any) {
  return (
    <a 
      href={href}
      download
      className={`relative p-8 border rounded-2xl flex flex-col h-full bg-white transition-all group ${
        href === '#' ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:shadow-xl hover:border-secondary shadow-sm'
      } ${recommended ? 'ring-2 ring-secondary ring-offset-4 ring-offset-background' : 'border-outline'}`}
    >
      {recommended && (
        <span className="absolute -top-3 left-8 px-2 py-1 bg-secondary text-white text-[8px] font-mono font-bold uppercase tracking-widest rounded shadow-lg">Recommended</span>
      )}
      <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-6 ${recommended ? 'bg-secondary text-white' : 'bg-blue-50 text-secondary'}`}>
        {icon}
      </div>
      <h4 className="text-xl font-serif font-bold text-primary mb-1">{title}</h4>
      <p className="text-xs font-mono text-secondary mb-4">{format}</p>
      <p className="text-sm text-on-surface-variant mb-8 flex-1 leading-relaxed">{desc}</p>
      <div className={`w-full py-4 rounded-xl font-mono text-xs uppercase tracking-widest font-bold border transition-all flex items-center justify-center gap-3 ${
        recommended 
          ? 'bg-secondary text-white border-secondary hover:bg-blue-700' 
          : 'bg-white text-secondary border-blue-200 hover:bg-blue-50'
      }`}>
        <Download size={16} />
        Download Artifact
      </div>
    </a>
  );
}

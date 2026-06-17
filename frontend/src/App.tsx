/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2025 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

import { useCallback, useState, useEffect } from 'react';
import client from '#/utils/apiClient';
import { ThemeProvider, useTheme } from '#/context/ThemeContext';
import { ToastProvider } from '#/context/ToastContext';
import { OcrPage } from '#/pages/OcrPage';
import { PdfPage } from '#/pages/PdfPage';
import { SystemPage } from '#/pages/SystemPage';
import { StatsPage } from '#/pages/StatsPage';
import { ExportPage } from '#/pages/ExportPage';
import {
  Activity,
  BarChart3,
  Brain,
  Clock,
  Cpu,
  Download,
  FileText,
  Globe,
  Loader2,
  Moon,
  ScanLine,
  Settings2,
  Shield,
  Sun,
  TrendingUp,
  UploadCloud,
  Zap,
} from 'lucide-react';
import type {OcrResult, PdfOcrResponse, HistoryResponse} from '#/types/api';
import { getHistory } from '#/utils/api/analysis';

type TabKey = 'ocr' | 'pdf' | 'insights' | 'stats' | 'system' | 'export';

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'ocr',      label: 'OCR',       icon: UploadCloud },
  { key: 'pdf',      label: 'PDF OCR',    icon: FileText },
  { key: 'insights', label: 'AI Insights',icon: Brain },
  { key: 'stats',    label: 'Analytics',   icon: BarChart3 },
  { key: 'system',   label: 'System',      icon: Settings2 },
  { key: 'export',   label: 'Export',      icon: Download },
];

const QUICK_STATS = [
  { label: 'Requests',   value: '1.2K',  icon: Zap,     color: 'text-violet-400', glow: 'glow-violet' },
  { label: 'OCR RPS',    value: '8.4',    icon: TrendingUp, color: 'text-emerald-400', glow: 'glow-emerald' },
  { label: 'GPU Load',   value: '62%',    icon: Cpu,     color: 'text-blue-400', glow: 'glow-blue' },
  { label: 'Uptime',     value: '99.9%',  icon: Activity, color: 'text-amber-400', glow: '' },
];

function Shell() {
  const [activeTab, setActiveTab] = useState<TabKey>('ocr');
  const { theme, toggleTheme } = useTheme();
  const [connected, setConnected] = useState(true);
  const [lastOcrResult, setLastOcrResult] = useState<OcrResult | null>(null);
  const [lastPdfOcrResult, setLastPdfOcrResult] = useState<PdfOcrResponse | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await client.get('/health');
        if (!cancelled) setConnected(true);
      } catch {
        if (!cancelled) setConnected(false);
      }
    })();
    // Trigger entrance animation
    setTimeout(() => setIsLoaded(true), 50);
    return () => { cancelled = true; };
  }, []);

  const isDark = theme === 'dark';

  return (
    <div className={`min-h-screen flex ${isDark ? 'bg-[#0b0f19] text-gray-200' : 'bg-[#f1f5f9] text-gray-900'}`}>

      {/* ── Sidebar ─────────────────────────────── */}
      <aside className={`w-16 lg:w-64 flex flex-col border-r transition-all duration-300 ${
        isDark ? 'border-slate-800/40 bg-[#080b13]' : 'border-gray-200 bg-white'
      }`}>

        {/* Logo */}
        <div className={`p-3 lg:p-4 flex items-center gap-3 border-b ${
          isDark ? 'border-slate-800/40' : 'border-gray-200'
        }`}>
          <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-600 flex items-center justify-center shrink-0 shadow-lg shadow-violet-500/30 ring-1 ring-white/10">
            <ScanLine className="h-[18px] w-[18px] text-white" strokeWidth={2.5} />
          </div>
          <div className="hidden lg:block overflow-hidden">
            <h1 className={`text-sm font-bold tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>Urdu OCR</h1>
            <p className={`text-[10px] font-medium ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>v2.0 · AI-Powered</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2.5 py-3 space-y-0.5">
          {TABS.map(({ key, label, icon: Icon }) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`w-full flex items-center gap-3 rounded-lg transition-all duration-200 relative group ${
                  isActive
                    ? isDark
                      ? 'bg-violet-500/10 text-violet-400'
                      : 'bg-violet-50 text-violet-600'
                    : isDark
                      ? 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100/70'
                }`}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-violet-500"
                    style={{ boxShadow: '0 0 8px rgba(139, 92, 246, 0.5)' }}
                  />
                )}
                {/* Icon container */}
                <div className={`relative shrink-0 p-2 rounded-lg transition-all duration-200 ${
                  isActive
                    ? isDark
                      ? 'bg-violet-500/15 text-violet-400'
                      : 'bg-violet-100/70 text-violet-600'
                    : ''
                }`}>
                  <Icon className="h-[16px] w-[16px] lg:h-4 lg:w-4" />
                  {/* Subtle glow on active */}
                  {isActive && (
                    <div className={`absolute inset-0 rounded-lg blur-sm ${
                      isDark ? 'bg-violet-500/20' : 'bg-violet-300/20'
                    } opacity-60`} />
                  )}
                </div>
                {/* Label */}
                <span className={`hidden lg:block text-sm font-medium tracking-tight`}>{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Divider */}
        <div className={`mx-3 border-t ${isDark ? 'border-slate-800/40' : 'border-gray-200'}`} />

        {/* Bottom section */}
        <div className="px-2.5 py-2 space-y-0.5">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className={`w-full flex items-center gap-3 rounded-lg px-2.5 py-2 transition-all duration-200 ${
              isDark ? 'text-slate-400 hover:text-white hover:bg-white/[0.04]' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100/70'
            }`}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <div className="shrink-0 p-2 rounded-lg">
              {isDark
                ? <Sun className="h-[16px] w-[16px] lg:h-4 lg:w-4" strokeWidth={2} />
                : <Moon className="h-[16px] w-[16px] lg:h-4 lg:w-4" strokeWidth={2} />
              }
            </div>
            <span className="hidden lg:block text-sm font-medium tracking-tight">
              {isDark ? 'Light Mode' : 'Dark Mode'}
            </span>
          </button>

          {/* Connection status */}
          <div className={`flex items-center gap-2 px-2.5 py-2 rounded-lg ${
            isDark ? 'text-slate-500' : 'text-gray-400'
          }`}>
            <div className="relative shrink-0">
              {connected ? (
                <>
                  <span className="inline-flex h-[6px] w-[6px] rounded-full bg-emerald-400/80" />
                  <span className="absolute inset-0 -m-[1px] inline-flex rounded-full bg-emerald-400/30 animate-ping" style={{ animationDuration: '3s' }} />
                </>
              ) : (
                <span className="inline-flex h-[6px] w-[6px] rounded-full bg-red-400/80" />
              )}
            </div>
            <span className={`hidden lg:block text-xs font-medium ${
              isDark ? 'text-slate-500' : 'text-gray-400'
            }`}>Connected</span>
          </div>
        </div>
      </aside>

      {/* ── Main Content ───────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">

        {/* Top bar */}
        <header className={`sticky top-0 z-30 border-b backdrop-blur-xl ${
          isDark ? 'border-slate-800/40 bg-[#0b0f19]/70' : 'border-gray-200/60 bg-white/70'
        }`}>
          <div className="px-6 lg:px-8 py-4 flex items-center justify-between">
            <div>
              <h2 className={`text-lg font-semibold tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {TABS.find(t => t.key === activeTab)?.label}
              </h2>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                {activeTab === 'ocr' && 'Upload an image to extract Urdu text'}
                {activeTab === 'pdf' && 'Process PDF documents for OCR'}
                {activeTab === 'insights' && 'AI-powered document analysis, summaries & history'}
                {activeTab === 'stats' && 'Real-time server performance metrics'}
                {activeTab === 'system' && 'Server health and configuration'}
                {activeTab === 'export' && 'Export extracted data in multiple formats'}
              </p>
            </div>

            {/* Quick stats pills */}
            <div className="hidden xl:flex items-center gap-3">
              {QUICK_STATS.map(({ label, value, icon: Icon, color }) => (
                <div key={label} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs ${
                  isDark ? 'bg-white/5' : 'bg-gray-100'
                }`}>
                  <Icon className={`h-3 w-3 ${color}`} />
                  <span className={`${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{label}:</span>
                  <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className={`flex-1 p-6 lg:p-8 overflow-auto ${isLoaded ? '' : 'opacity-0'}`}>
          {activeTab === 'ocr'  && <OcrPage onResult={setLastOcrResult} />}
          {activeTab === 'pdf'  && <PdfPage onPdfResult={setLastPdfOcrResult} />}
          {activeTab === 'insights' && <InsightsPage />}
          {activeTab === 'system' && <SystemPage />}
          {activeTab === 'stats' && <StatsPage />}
          {activeTab === 'export' && <ExportPage ocrResult={lastOcrResult} pdfOcrResult={lastPdfOcrResult} />}
        </div>

        {/* Footer */}
        <footer className={`border-t px-8 py-3 ${isDark ? 'border-slate-800/40' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <p className={`text-[11px] ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>
              End-to-End Urdu OCR WebApp · FastAPI Backend · React + TypeScript
            </p>
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center gap-1.5 text-[11px] ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>
                <Shield className="h-3 w-3" /> Secure
              </span>
              <span className={`inline-flex items-center gap-1.5 text-[11px] ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>
                <Globe className="h-3 w-3" /> FastAPI
              </span>
            </div>
          </div>
        </footer>
      </main>

      {/* ── Welcome Overlay (first load) ─────────── */}
      {!isLoaded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b0f19]">
          <div className="text-center animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-violet-500/30">
              <ScanLine className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-xl font-bold gradient-text">Urdu OCR</h2>
            <p className={`text-sm mt-1 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>Loading interface…</p>
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </ThemeProvider>
  );
}

/* ── AI Insights Page (new) ─────────────────────── */

function InsightsPage() {
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const isDark = true;

  useEffect(() => {
    getHistory(20).then((d) => { setHistory(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 text-violet-400 animate-spin" />
      </div>
    );
  }

  if (!history) {
    return (
      <div className="text-center py-16">
        <Brain className="h-12 w-12 text-slate-600 mx-auto mb-4" />
        <p className="text-sm text-slate-500">No insights data available yet. Run some OCR first.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-violet-500/10 bg-gradient-to-br from-violet-500/5 via-transparent to-purple-500/5 px-6 py-8 sm:px-10 sm:py-10 text-center">
        <Brain className="h-8 w-8 text-violet-400 mx-auto mb-3" />
        <h2 className="text-2xl font-bold tracking-tight mb-1">AI Insights Dashboard</h2>
        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
          AI-powered document analysis, processing history, and smart recommendations.
        </p>
      </div>

      {/* Stats Summary */}
      {history.stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatBox label="Total Operations" value={history.stats.total_operations.toLocaleString()} color="text-violet-400" />
          <StatBox label="Avg Confidence" value={history.stats.avg_confidence ? `${Math.round(history.stats.avg_confidence * 100)}%` : 'N/A'} color="text-emerald-400" />
          <StatBox label="Total Lines" value={history.stats.total_lines_extracted.toLocaleString()} color="text-blue-400" />
          <StatBox label="Avg Processing" value={`${Math.round(history.stats.avg_processing_time_ms)}ms`} color="text-amber-400" />
        </div>
      )}

      {/* Operation Breakdown */}
      {history.stats && history.stats.by_operation && Object.keys(history.stats.by_operation).length > 0 && (
        <div className="glass-card rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">Operations Breakdown</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.entries(history.stats.by_operation).map(([op, count]) => (
              <div key={op} className={`p-4 rounded-xl ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
                <p className={`text-[10px] uppercase tracking-wider font-medium mb-1 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>{op.replace(/_/g, ' ')}</p>
                <p className="text-2xl font-bold text-white">{count.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {history.entries.length > 0 && (
        <div className="glass-card rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">Recent Activity</h3>
          <div className="space-y-2">
            {history.entries.slice(0, 10).map((entry) => (
              <div key={entry.id} className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-colors ${isDark ? 'bg-white/[0.02] hover:bg-white/[0.04]' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <div className={`shrink-0 p-2 rounded-lg ${
                  entry.operation.includes('ocr') ? 'bg-violet-500/10' :
                  entry.operation.includes('pdf') ? 'bg-blue-500/10' : 'bg-slate-500/10'
                }`}>
                  <Clock className={`h-4 w-4 ${
                    entry.operation.includes('ocr') ? 'text-violet-400' :
                    entry.operation.includes('pdf') ? 'text-blue-400' : 'text-slate-400'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>{entry.filename}</p>
                  <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                    {entry.operation.replace(/_/g, ' ')} · {Math.round(entry.processing_time_ms)}ms · {entry.lines_detected} lines
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {entry.confidence_mean && (
                    <span className={`text-xs font-semibold ${
                      entry.confidence_mean >= 0.7 ? 'text-emerald-400' :
                      entry.confidence_mean >= 0.4 ? 'text-amber-400' : 'text-red-400'
                    }`}>{Math.round(entry.confidence_mean * 100)}%</span>
                  )}
                  <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>{formatTime(entry.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className={`glass-card rounded-2xl p-5`}>
      <p className="text-[10px] uppercase tracking-wider font-medium mb-2 text-slate-500">{label}</p>
      <p className={`text-2xl font-bold ${color} tracking-tight`}>{value}</p>
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

export default App;

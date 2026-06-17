/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2025 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

/**
 * App Shell — Tab-based navigation connecting all pages.
 *
 * Layout:
 *   Header (brand + tab bar + theme toggle + connection indicator)
 *   Content area (switches between page components via activeTab state)
 *   Footer
 */

import {useState, useEffect} from 'react';
import client from '#/utils/apiClient';
import {ThemeProvider} from '#/context/ThemeContext';
import {ToastProvider} from '#/context/ToastContext';
import {useTheme} from '#/context/ThemeContext';
import {OcrPage} from '#/pages/OcrPage';
import {PdfPage} from '#/pages/PdfPage';
import {SystemPage} from '#/pages/SystemPage';
import {StatsPage} from '#/pages/StatsPage';
import {ExportPage} from '#/pages/ExportPage';
import {ScanLine, FileText, Settings2, BarChart3, Download, Sun, Moon} from 'lucide-react';
import type { OcrResult, PdfOcrResponse } from '#/types/api';

/** Navigation tab definitions. */
const TABS = [
  {key: 'ocr', label: 'OCR', icon: ScanLine},
  {key: 'pdf', label: 'PDF', icon: FileText},
  {key: 'system', label: 'System', icon: Settings2},
  {key: 'stats', label: 'Stats', icon: BarChart3},
  {key: 'export', label: 'Export', icon: Download},
];

type TabKey = (typeof TABS)[number]['key'];

/** Theme toggle button using the existing ThemeContext. */
function ThemeToggle() {
  const {theme, toggleTheme} = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark'
        ? <Sun className="h-5 w-5 text-amber-400"/>
        : <Moon className="h-5 w-5 text-gray-600"/>
      }
    </button>
  );
}

/** Main shell component with tab navigation. */
function Shell() {
  const [activeTab, setActiveTab] = useState<TabKey>('ocr');
  const {theme} = useTheme();
  const [connected, setConnected] = useState(true);

  // Share last OCR result across tabs via module-level state
  const [lastOcrResult, setLastOcrResult] = useState<OcrResult | null>(null);
  const [lastPdfOcrResult, setLastPdfOcrResult] = useState<PdfOcrResponse | null>(null);

  // Health ping on mount via fetch (lightweight one-off check)
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
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className={`min-h-screen flex flex-col ${theme === 'dark' ? 'dark bg-[#0b0f19] text-gray-200' : 'bg-[#f8f9fc] text-gray-900'}`}>
      {/* ── Header ─────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 border-b border-gray-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          {/* Brand */}
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 shrink-0">
            <ScanLine className="h-5 w-5 text-violet-600"/>
            Urdu OCR{' '}
            <span
              className="text-xs font-normal text-violet-500 bg-violet-100 dark:bg-violet-900/30 dark:text-violet-400 rounded-full px-2 py-0.5">v2</span>
          </h1>

          {/* Tab bar — hidden on very small screens */}
          <nav className="flex gap-1 bg-gray-100 dark:bg-slate-800 rounded-xl p-1 overflow-x-auto flex-1 max-w-[600px]">
            {TABS.map(({key, label, icon: Icon}) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  activeTab === key
                    ? 'bg-white dark:bg-slate-700 shadow-sm text-violet-600 dark:text-violet-400'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0"/>
                {label}
              </button>
            ))}
          </nav>

          {/* Right controls */}
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`}
              title={connected ? 'Connected' : 'Offline'}
            />
            <ThemeToggle/>
          </div>
        </div>
      </header>

      {/* ── Content ────────────────────────────────────── */}
      <main className="flex-1 p-4 sm:p-6">
        {activeTab === 'ocr' && <OcrPage onResult={setLastOcrResult}/>}
        {activeTab === 'pdf'    && <PdfPage onPdfResult={setLastPdfOcrResult} />}
        {activeTab === 'system' && <SystemPage/>}
        {activeTab === 'stats' && <StatsPage/>}
        {activeTab === 'export' && <ExportPage ocrResult={lastOcrResult} pdfOcrResult={lastPdfOcrResult} />}
      </main>

      {/* ── Footer ─────────────────────────────────────── */}
      <footer className="border-t border-gray-200 dark:border-slate-800 py-3">
        <p className="text-center text-xs text-gray-400">
          End-to-End Urdu OCR WebApp &middot; FastAPI v2 Backend &middot; React + TypeScript + Tailwind CSS
        </p>
      </footer>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <Shell/>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;

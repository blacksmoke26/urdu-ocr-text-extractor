/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2025 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

/**
 * PDF Page — Upload PDFs for metadata extraction, page extraction, reconstruction, and full OCR.
 *
 * Tabs organize the four PDF capabilities: Info, Extract Pages, Reconstruct, and PDF OCR.
 * Each tab uses the appropriate v2 API endpoint via axios.
 */

import { useRef, useState } from 'react';
import { Clock, FileText, Scissors, Search, Square, Timer, UploadCloud, Eye, FileJson, ChevronDown, ChevronUp, SlidersHorizontal, Cpu, Zap, EyeOff, LayoutGrid, Wand2, Sparkles, Image as ImageIcon } from 'lucide-react';
import { cancelPdfOcr, pdfExtract, pdfInfo, pdfOcr } from '#/utils/api/pdf';
import { Dialog, DialogBody, DialogContent } from '#/components/ui/Dialog';
import { SelectAdvanced } from '#/components/ui/SelectAdvanced';
import { useToast } from '#/context/ToastContext';
import { formatBytes } from '#/utils/file';
import type {PdfExtractResponse, PdfInfo, PdfOcrPageResult, PdfOcrResponse} from '#/types/api';
import { PdfViewerModal } from '#/components/ui/PdfViewerModal';
import { useTheme } from '#/context/ThemeContext';

type PdfTab = 'preview' | 'info' | 'extract' | 'ocr';

const isDark = true;

export function PdfPage({ onPdfResult }: { onPdfResult?: (result: PdfOcrResponse) => void }) {
  const [tab, setTab] = useState<PdfTab>('info');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<PdfInfo | PdfExtractResponse | null>(null);
  const [pageRange, setPageRange] = useState({ from: 1, to: '' });
  // task_id is generated before the request so we can cancel even before response arrives
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  // Track how many pages have been processed so far during an active job
  const [pagesCompleted, setPagesCompleted] = useState(0);
  // Detailed progress state for PDF OCR / Extract
  const [elapsedMs, setElapsedMs] = useState(0);
  const processingStartTime = useRef<number | null>(null); // wall-clock start time
  const [lastPageTimeMs, setLastPageTimeMs] = useState(0);
  const [progressTotalPages, setProgressTotalPages] = useState(0);
  // Cached PDF total pages (from info endpoint) to pre-fill "To page"
  const [pdfTotalPages, setPdfTotalPages] = useState<number | null>(null);
  // Whether we should show progress (multi-page operation)
  const totalPagesRange = (() => {
    if (!pageRange.to) return pdfTotalPages! > 0 ? pdfTotalPages : 1;
    const from = pageRange.from || 1;
    const to = Number(pageRange.to);
    return Math.max(1, to - from + 1);
  })();

  // Image viewer state (extract tab thumbnails)
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerPage, setViewerPage] = useState<{ page_number: number; image_b64: string } | null>(null);

  // react-pdf modal viewer state
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false);

  // OCR-specific params
  const [confThreshold, setConfThreshold] = useState(0.2);
  const [imgSize, setImgSize] = useState(1280);
  const [textCleaning, setTextCleaning] = useState(true);

  // Advanced options state
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [useCache, setUseCache] = useState(true);
  const [device, setDevice] = useState<'cpu' | 'cuda'>('cuda');
  const [detType, setDetType] = useState<'yolo' | 'detr' | 'mllm'>('yolo');
  const [detConf, setDetConf] = useState(0.5);
  const [layoutAnalysis, setLayoutAnalysis] = useState(false);
  const [postProcessing, setPostProcessing] = useState(true);

  const { addToast } = useToast();
  const { theme } = useTheme();

  const handleFile = async (f: File) => {
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      addToast('Only PDF files are accepted.', 'error');
      return;
    }
    setFile(f);
    setResult(null);
    setPageRange((p) => ({ ...p, from: 1, to: '' }));
    setPdfTotalPages(null);

    // Auto-detect total pages in background so "To page" can pre-fill
    try {
      const info = await pdfInfo(f);
      setPdfTotalPages(info.total_pages);
      setPageRange((p) => ({ ...p, to: String(info.total_pages) }));
    } catch {
      // Silently ignore — user can still type a value manually
    }
  };

  /* ── Tab handlers ─────────────────────────────────────── */

  const onInfo = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const data = await pdfInfo(file);
      setResult(data);
      setPdfTotalPages(data.total_pages);
      addToast(`PDF info — ${data.total_pages} pages found.`, 'success');
    } catch (err: any) {
      addToast(err?.message || 'Failed to read PDF info.', 'error');
    } finally { setLoading(false); }
  };

  const onExtract = async () => {
    if (!file) return;
    // Generate task_id before request so Stop button can cancel
    const taskId = `pdf_extract_${Date.now()}`;
    setCurrentTaskId(taskId);
    setLoading(true); setProgress(0);
    setPagesCompleted(0);
    setElapsedMs(0);
    setLastPageTimeMs(0);
    setProgressTotalPages(0);
    setResult(null);

    // Record wall-clock start time for live display
    processingStartTime.current = Date.now();

    // Start live wall-clock ticker for elapsed time
    const tickInterval = setInterval(() => {
      if (processingStartTime.current) {
        setElapsedMs(Date.now() - processingStartTime.current);
      }
    }, 1000);

    // Connect to WebSocket for live progress events.
    // Always target the FastAPI backend directly — Vite's HTTP-only proxy
    // cannot forward WebSocket upgrade requests.
    let ws: WebSocket | null = null;
    try {
      const apiHost = import.meta.env.VITE_API_WS_HOST || '127.0.0.1:8000';
      ws = new WebSocket(`ws://${apiHost}/api/v2/ws/task/${taskId}`);

      ws.onopen = () => {
        console.log(`[WS] Connected to task ${taskId}`);
      };

      ws.onmessage = (event) => {
        try {
          // Handle both text and binary WebSocket frames
          let raw: string;
          if (event.data instanceof ArrayBuffer) {
            raw = new TextDecoder().decode(event.data);
          } else {
            raw = event.data;
          }
          const data = JSON.parse(raw);
          if (data.type === 'live_pdf' && data.data) {
            setPagesCompleted(data.data.pages_completed);
            if (data.data.total_pages > 0) setProgressTotalPages(data.data.total_pages);
            if (data.data.last_page_time_ms) setLastPageTimeMs(data.data.last_page_time_ms);
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onerror = () => {
        console.error(`[WS] WebSocket error for task ${taskId}`);
      };
    } catch {
      // WebSocket not available — proceed without live updates
    }

    try {
      const data = await pdfExtract(file, pageRange.from, pageRange.to ? Number(pageRange.to) : undefined, 300, taskId);
      // Clean up WebSocket on completion
      if (ws && ws.readyState === WebSocket.OPEN) ws.send('unsubscribe');
      clearInterval(tickInterval);
      // Check for partial results from cancellation
      if (data.status === 'cancelled') {
        setResult(data);
        setPagesCompleted(data.pages?.length ?? 0);
        addToast(`Stopped: ${data.message || 'Extraction interrupted.'}`, 'info');
      } else {
        setResult(data);
        setPagesCompleted(data.total_pages_extracted);
        setProgressTotalPages(data.total_pages_extracted);
        addToast(`Extracted ${data.total_pages_extracted} pages.`, 'success');
      }
    } catch (err: any) {
      if (err?.response?.data?.status === 'cancelled') {
        const partial = err.response.data;
        setResult(partial);
        setPagesCompleted(partial.pages.length);
        addToast(`Stopped: ${partial.message || 'Extraction interrupted.'}`, 'info');
      } else {
        addToast(err?.message || 'PDF extraction failed.', 'error');
      }
    } finally { clearInterval(tickInterval); setLoading(false); setCurrentTaskId(null); }
  };

  const onPdfOcr = async () => {
    if (!file) return;
    // Generate task_id before request so Stop button can cancel
    const taskId = `pdf_ocr_${Date.now()}`;
    setCurrentTaskId(taskId);
    setLoading(true);
    setProgress(0);
    setPagesCompleted(0);
    setElapsedMs(0);
    setLastPageTimeMs(0);
    setProgressTotalPages(0);
    setResult(null); // clear previous results

    // Record wall-clock start time for live display
    processingStartTime.current = Date.now();

    // Start live wall-clock ticker for elapsed time
    const tickInterval = setInterval(() => {
      if (processingStartTime.current) {
        setElapsedMs(Date.now() - processingStartTime.current);
      }
    }, 1000);

    // Connect to WebSocket for live progress events.
    // Always target the FastAPI backend directly — Vite's HTTP-only proxy
    // cannot forward WebSocket upgrade requests.
    let ws: WebSocket | null = null;
    try {
      const apiHost = import.meta.env.VITE_API_WS_HOST || '127.0.0.1:8000';
      ws = new WebSocket(`ws://${apiHost}/api/v2/ws/task/${taskId}`);

      ws.onmessage = (event) => {
        try {
          // Handle both text and binary WebSocket frames
          let raw: string;
          if (event.data instanceof ArrayBuffer) {
            raw = new TextDecoder().decode(event.data);
          } else {
            raw = event.data;
          }
          const data = JSON.parse(raw);
          if (data.type === 'live_pdf' && data.data) {
            setPagesCompleted(data.data.pages_completed);
            if (data.data.total_pages > 0) setProgressTotalPages(data.data.total_pages);
            if (data.data.last_page_time_ms) setLastPageTimeMs(data.data.last_page_time_ms);
          }
        } catch {
          // Ignore parse errors
        }
      };
    } catch {
      // WebSocket not available — proceed without live updates
    }

    try {
      const advancedOptions = {
        use_cache: useCache,
        device,
        det_type: detType,
        det_conf: detConf,
        layout_analysis: layoutAnalysis,
        post_processing: postProcessing ? 'default' : '',
      };
      const data = await pdfOcr(file, pageRange.from, pageRange.to ? Number(pageRange.to) : undefined, confThreshold, imgSize, String(textCleaning), undefined, taskId, advancedOptions);
      // Clean up WebSocket on completion
      if (ws && ws.readyState === WebSocket.OPEN) ws.send('unsubscribe');
      clearInterval(tickInterval);
      if (data.status === 'cancelled') {
        // Partial results from cancellation
        setResult(data);
        setPagesCompleted(data.pages?.length ?? 0);
        setCurrentTaskId(data.task_id || null);
        addToast(`Stopped: ${data.message || 'Process interrupted.'}`, 'info');
      } else {
        setResult(data);
        setPagesCompleted(data.pages?.length ?? 0);
        setProgressTotalPages(data.total_pages);
        setCurrentTaskId(data.task_id || null);
        addToast(`PDF OCR complete — ${data.total_text_lines} lines across ${data.total_pages} pages.`, 'success');
        onPdfResult?.(data);
      }
    } catch (err: any) {
      // Axios may still throw for cancelled connections
      if (err?.response?.data?.status === 'cancelled') {
        const partial = err.response.data;
        setResult(partial);
        setPagesCompleted(partial.pages.length);
        setCurrentTaskId(partial.task_id || null);
        addToast(`Stopped: ${partial.message || 'Process interrupted.'}`, 'info');
      } else {
        addToast(err?.message || 'PDF OCR failed.', 'error');
      }
    } finally {
      clearInterval(tickInterval);
      setLoading(false);
      setCurrentTaskId(null);
    }
  };

  const onStop = async () => {
    if (!currentTaskId) return;
    try {
      const res = await cancelPdfOcr(currentTaskId);
      if (res.status === 'cancelled') {
        addToast('Process stopped.', 'info');
      } else {
        addToast('Task already completed.', 'info');
      }
    } catch (err: any) {
      addToast(err?.message || 'Failed to stop process.', 'warning');
    } finally {
      setLoading(false);
      setCurrentTaskId(null);
    }
  };

  /* ── Progress Polling Helper ─────────────────────────────── */

  /** Format milliseconds into a human-readable string. */
  const formatMs = (ms: number): string => {
    if (!isFinite(ms)) return '—';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}m ${rem}s`;
  };

  /** Format seconds into ETA string. */
  const formatEta = (seconds: number): string => {
    if (!isFinite(seconds) || seconds <= 0) return '—';
    return `~${formatMs(seconds * 1000)} remaining`;
  };

  const tabs: { key: PdfTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'preview',  label: 'Preview',    icon: ImageIcon },
    { key: 'info',     label: 'Info',       icon: Search },
    { key: 'extract',  label: 'Extract',    icon: Scissors },
    { key: 'ocr',      label: 'PDF OCR',    icon: FileText },
  ];

  /* ── Render helpers ───────────────────────────────────── */

  const renderPdfInfo = (info: PdfInfo) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
      {[
        ['Filename', info.filename],
        ['Total Pages', String(info.total_pages)],
        ['Title', info.title ?? '—'],
        ['Author', info.author ?? '—'],
        ['Subject', info.subject ?? '—'],
        ['Creator', info.creator ?? '—'],
        ['Producer', info.producer ?? '—'],
        ['Page Size', info.page_size ? `${info.page_size[0]} × ${info.page_size[1]}` : '—'],
      ].map(([label, value]) => (
        <div key={label} className="flex justify-between items-center py-2.5 border-b border-slate-800/40">
          <span className={`text-xs font-medium uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>{label}</span>
          <span className={`text-sm truncate text-right max-w-[60%] font-medium ${isDark ? 'text-slate-200' : 'text-gray-900'}`}>{value}</span>
        </div>
      ))}
    </div>
  );

  const renderPdfExtract = (data: PdfExtractResponse) => {
    /** Convert image_b64 value to a valid data URL. */
    const toDataUrl = (value: string): string => {
      if (!value) return '';
      if (value.startsWith('data:image')) return value;
      if (/^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0) {
        const parts: string[] = [];
        for (let i = 0; i < value.length; i += 128) {
          const chunk = value.substring(i, i + 128);
          const bytes = new Uint8Array(chunk.length / 2);
          for (let j = 0; j < chunk.length; j += 2) {
            bytes[j / 2] = parseInt(chunk.substr(j, 2), 16);
          }
          parts.push(String.fromCharCode(...bytes));
        }
        const b64 = btoa(parts.join(''));
        return `data:image/png;base64,${b64}`;
      }
      return `data:image/png;base64,${value}`;
    };

    const openViewer = (page: { page_number: number; image_b64: string }) => {
      setViewerPage(page);
      setViewerOpen(true);
    };

    const tw = data.thumb_width || 200;
    const th = data.thumb_height || 282;

    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-500">{data.total_pages_extracted} pages extracted at {data.dpi} DPI.</p>

        {/* Grid of thumbnails — 4 per row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {data.pages.map((p, i) => {
            const thumbSrc = p.thumb_image_b64 ? toDataUrl(p.thumb_image_b64) : (p.image_b64 ? toDataUrl(p.image_b64) : '');
            if (!thumbSrc) {
              return (
                <div key={i} className="rounded-lg border border-gray-200 dark:border-slate-700 p-4 text-sm text-red-500 italic flex items-center justify-center h-30">
                  Page {p.page_number}: No image
                </div>
              );
            }
            return (
              <button
                key={i}
                onClick={() => openViewer({ page_number: p.page_number, image_b64: p.image_b64! })}
                className="group relative rounded-lg overflow-hidden border border-gray-200 dark:border-slate-700 hover:border-violet-400 dark:hover:border-violet-500 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <img
                  src={thumbSrc}
                  alt={`Page ${p.page_number}`}
                  className="w-full h-auto"
                  style={{ aspectRatio: `${tw} / ${th}` }}
                  loading="lazy"
                  onError={() => {
                    console.error(`Failed to load thumb page ${p.page_number}`);
                  }}
                />
                <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/60 to-transparent px-2 py-1">
                  <span className="text-xs text-white font-medium">Page {p.page_number}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Full-screen Image Viewer Modal */}
        <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
          <DialogContent
            size="full"
            position="center"
            showCloseButton={true}
            closeOnInteractOutside={false}
            className="p-0"
          >
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {viewerPage ? `Page ${viewerPage.page_number}` : ''}
                </h2>
              </div>
              <DialogBody className="flex-1 overflow-auto bg-black/90 flex items-center justify-center p-4">
                {viewerPage && viewerPage.image_b64 && (
                  <img
                    src={toDataUrl(viewerPage.image_b64)}
                    alt={`Full view of Page ${viewerPage.page_number}`}
                    className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
                  />
                )}
              </DialogBody>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  const renderPdfOcr = (data: any) => {
    const pages = data.pages ?? [];
    return (
      <div className="space-y-4">
        <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>{data.total_pages} pages · {data.total_text_lines} lines</p>
        {pages.map((pg: PdfOcrPageResult, i: number) => {
          const confMean = pg.confidence_stats?.mean ?? 0;
          return (
            <div key={i} className="glass-card rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h4 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Page {pg.page_number}</h4>
                <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${confMean >= 0.7 ? 'bg-emerald-500/10 text-emerald-400' : confMean >= 0.4 ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>{Math.round(confMean * 100)}% confidence · {pg.detected_lines} lines</span>
              </div>
              <div className={`rounded-xl px-4 py-3 border leading-loose ${isDark ? 'bg-white/[0.02] border-slate-700/60' : 'bg-gray-50 border-gray-200'}`}>
                <span className={`rtl text-right ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>{pg.full_text || <span className={`${isDark ? 'text-slate-600' : 'text-gray-400'} italic`}>No text.</span>}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ── Hero Section ─────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-blue-500/10 bg-gradient-to-br from-blue-500/5 via-transparent to-cyan-500/5">
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="relative px-6 py-8 sm:px-10 sm:py-12 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-500/20 bg-blue-500/10 text-blue-400 text-xs font-medium mb-4">
            <FileText className="h-3 w-3" /> PDF Processing Suite
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
            Extract Text from <span className="gradient-text">PDF Documents</span>
          </h2>
          <p className={`text-sm max-w-md mx-auto ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            Upload PDF files for metadata inspection, page extraction, or full OCR processing.
          </p>
        </div>
      </div>

      {/* ── Upload Zone ─────────────────────── */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileText className={`h-5 w-5 ${isDark ? 'text-slate-300' : 'text-gray-600'}`} />
          <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Upload PDF</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? 'bg-slate-700/50 text-slate-400' : 'bg-gray-100 text-gray-500'}`}>PDF Only</span>
        </div>

        <input
          type="file"
          accept=".pdf"
          className="hidden"
          id="pdf-input"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <label htmlFor="pdf-input" className={`block cursor-pointer border-2 border-dashed rounded-xl p-8 sm:p-12 text-center transition-all duration-300 ${
          file
            ? 'border-blue-500/40 bg-blue-500/5'
            : isDark
              ? 'border-slate-700/60 hover:border-blue-500/30 hover:bg-white/[0.02]'
              : 'border-gray-200 hover:border-blue-400/40 hover:bg-blue-50/30'
        }`}>
          {file ? (
            <div className="space-y-3">
              <div className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center ${isDark ? 'bg-white/5' : 'bg-gray-100'}`}>
                <FileText className="h-8 w-8 text-red-400" />
              </div>
              <div className={`inline-flex items-center gap-2 text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {file.name} · {formatBytes(file.size)}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center ${isDark ? 'bg-white/5' : 'bg-gray-100'}`}>
                <UploadCloud className={`h-8 w-8 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>Drop PDF here or click to select</p>
                <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>Maximum file size: 500MB</p>
              </div>
            </div>
          )}
        </label>
      </div>

      {/* ── Tabs + Controls ─────────────────── */}
      {file && (
        <>
          {/* Tab bar */}
          <div className={`flex gap-1 p-1 rounded-xl ${isDark ? 'bg-white/5 border border-slate-800/40' : 'bg-gray-100 border border-gray-200'}`}>
            {tabs.map(({ key, label, icon: TabIcon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  tab === key
                    ? isDark
                      ? 'bg-violet-500/20 text-violet-400 shadow-sm'
                      : 'bg-white text-violet-600 shadow-sm'
                    : isDark
                      ? 'text-slate-500 hover:text-slate-300'
                      : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <TabIcon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          {/* Page range */}
          {(tab === 'extract' || tab === 'ocr') && (
            <div className="glass-card rounded-2xl p-5">
              <div className={`text-xs font-medium uppercase tracking-wider mb-3 ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>Page Range</div>
              <div className="flex items-center gap-3 text-sm">
                <span className={isDark ? 'text-slate-400' : 'text-gray-600'}>From:</span>
                <input type="number" min={1} value={pageRange.from} onChange={(e) => setPageRange((p) => ({ ...p, from: Number(e.target.value) }))} className={`w-20 border rounded-lg px-3 py-2 text-sm ${isDark ? 'bg-slate-800/50 border-slate-700/60 text-white' : 'bg-white border-gray-200 text-gray-900'}`} />
                <span className={isDark ? 'text-slate-400' : 'text-gray-600'}>To:</span>
                <input type="number" min={1} value={pageRange.to || ''} onChange={(e) => setPageRange((p) => ({ ...p, to: e.target.value }))} placeholder="All" className={`w-20 border rounded-lg px-3 py-2 text-sm ${isDark ? 'bg-slate-800/50 border-slate-700/60 text-white' : 'bg-white border-gray-200 text-gray-900'}`} />
                <span className={`text-xs ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>Leave blank for all pages</span>
              </div>
            </div>
          )}

          {/* OCR options — Single merged panel */}
          {tab === 'ocr' && (
            <div className="space-y-3">
              <div
                className="glass-card rounded-2xl p-5"
                style={{ animation: 'float-up 0.4s ease-out both' }}
              >
                {/* Header row with title and collapse toggle */}
                <div className="flex items-center justify-between mb-4">
                  <span className={`text-xs font-medium uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                    OCR Settings
                  </span>
                  <button
                    onClick={() => setAdvancedOpen(!advancedOpen)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all duration-300 cursor-pointer ${
                      advancedOpen
                        ? isDark
                          ? 'border-violet-500/30 bg-violet-500/15 text-violet-400'
                          : 'border-violet-400/40 bg-violet-50 text-violet-600'
                        : isDark
                          ? 'border-slate-700/50 bg-white/[0.03] text-slate-500 hover:border-slate-600 hover:text-slate-300'
                          : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    }`}
                  >
                    <SlidersHorizontal className={`h-3 w-3 transition-transform duration-300 ${advancedOpen ? 'rotate-90' : ''}`} />
                    Advanced
                    <ChevronDown className={`h-3 w-3 transition-transform duration-300 ${advancedOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {/* Basic settings */}
                <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                  {/* Confidence Threshold */}
                  <div>
                    <label className={`block mb-1.5 text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                      Confidence
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step={0.1}
                        min={0}
                        max={1}
                        value={confThreshold}
                        onChange={(e) => setConfThreshold(Number(e.target.value))}
                        className={`w-24 border rounded-xl px-3 py-2 text-sm ${isDark ? 'bg-slate-900/60 border-slate-700/50 text-white' : 'bg-white border-gray-200 text-gray-900'} focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-none transition-all`}
                      />
                      <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>%</span>
                    </div>
                  </div>

                  {/* Image Size */}
                  <div>
                    <label className={`block mb-1.5 text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                      Image Size
                    </label>
                    <input
                      type="number"
                      value={imgSize}
                      onChange={(e) => setImgSize(Number(e.target.value))}
                      className={`w-24 border rounded-xl px-3 py-2 text-sm ${isDark ? 'bg-slate-900/60 border-slate-700/50 text-white' : 'bg-white border-gray-200 text-gray-900'} focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-none transition-all`}
                    />
                  </div>

                  {/* Divider */}
                  <div className={`w-px h-8 ${isDark ? 'bg-slate-700/50' : 'bg-gray-200'}`} />

                  {/* Text Cleaning Toggle */}
                  <label className="flex items-center gap-2.5 cursor-pointer group">
                    <div className={`relative w-10 h-5.5 rounded-full transition-all duration-300 ${textCleaning ? 'bg-violet-500 shadow-lg shadow-violet-500/40' : isDark ? 'bg-slate-700' : 'bg-gray-300'}`}>
                      <input type="checkbox" checked={textCleaning} onChange={() => setTextCleaning(!textCleaning)} className="sr-only peer" />
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300 ${textCleaning ? 'translate-x-4.5' : ''}`} />
                    </div>
                    <Wand2 className={`h-3.5 w-3.5 transition-colors ${textCleaning ? 'text-violet-400' : isDark ? 'text-slate-600 group-hover:text-slate-500' : 'text-gray-400'}`} />
                    <span className={`text-sm ${isDark ? 'text-slate-300 group-hover:text-slate-200' : 'text-gray-700'}`}>Text Cleaning</span>
                  </label>
                </div>

                {/* Advanced section — animated expand/collapse */}
                {advancedOpen && (
                  <div
                    className="mt-5 pt-5 border-t space-y-5"
                    style={{ animation: 'float-up 0.25s ease-out both' }}
                  >
                    {/* Model + Det Conf + Device row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {/* Model Type */}
                      <div>
                        <label className={`block mb-1.5 text-[11px] font-medium uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                          Model
                        </label>
                        <SelectAdvanced
                          value={detType}
                          onChange={(v) => setDetType(v as 'yolo' | 'detr' | 'mllm')}
                          placeholder="Select model"
                          triggerWidth="100%"
                          options={[
                            { value: 'yolo', label: 'YOLO' },
                            { value: 'detr', label: 'DETR' },
                            { value: 'mllm', label: 'MLLM' },
                          ]}
                        />
                      </div>

                      {/* Detection Confidence */}
                      <div>
                        <label className={`block mb-1.5 text-[11px] font-medium uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                          Det. Conf.
                        </label>
                        <input
                          type="number"
                          step={0.05}
                          min={0}
                          max={1}
                          value={detConf}
                          onChange={(e) => setDetConf(Number(e.target.value))}
                          className={`w-full border rounded-xl px-3 py-2 text-sm ${isDark ? 'bg-slate-900/60 border-slate-700/50 text-white' : 'bg-white border-gray-200 text-gray-900'} focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-none transition-all`}
                        />
                      </div>

                      {/* Device */}
                      <div>
                        <label className={`block mb-1.5 text-[11px] font-medium uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                          Device
                        </label>
                        <SelectAdvanced
                          value={device}
                          onChange={(v) => setDevice(v as 'cpu' | 'cuda')}
                          placeholder="Select device"
                          triggerWidth="100%"
                          options={[
                            { value: 'cuda', label: 'CUDA (GPU)' },
                            { value: 'cpu', label: 'CPU' },
                          ]}
                        />
                      </div>

                      {/* Divider between numeric + toggles columns */}
                      <div className={`hidden sm:block w-px self-stretch ${isDark ? 'bg-slate-700/50' : 'bg-gray-200'}`} />
                    </div>

                    {/* Feature Toggles */}
                    <div className="flex flex-wrap gap-x-6 gap-y-3">
                      {/* Cache Results */}
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <div className={`relative w-9 h-5 rounded-full transition-all duration-300 ${useCache ? 'bg-violet-500 shadow-md shadow-violet-500/40' : isDark ? 'bg-slate-700' : 'bg-gray-300'}`}>
                          <input type="checkbox" checked={useCache} onChange={() => setUseCache(!useCache)} className="sr-only peer" />
                          <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300 ${useCache ? 'translate-x-4' : ''}`} />
                        </div>
                        <Sparkles className={`h-3.5 w-3.5 transition-colors ${useCache ? 'text-violet-400' : isDark ? 'text-slate-600 group-hover:text-slate-500' : 'text-gray-400'}`} />
                        <span className={`text-sm ${isDark ? 'text-slate-300 group-hover:text-slate-200' : 'text-gray-700'}`}>Cache</span>
                      </label>

                      {/* Layout Analysis */}
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <div className={`relative w-9 h-5 rounded-full transition-all duration-300 ${layoutAnalysis ? 'bg-violet-500 shadow-md shadow-violet-500/40' : isDark ? 'bg-slate-700' : 'bg-gray-300'}`}>
                          <input type="checkbox" checked={layoutAnalysis} onChange={() => setLayoutAnalysis(!layoutAnalysis)} className="sr-only peer" />
                          <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300 ${layoutAnalysis ? 'translate-x-4' : ''}`} />
                        </div>
                        <LayoutGrid className={`h-3.5 w-3.5 transition-colors ${layoutAnalysis ? 'text-violet-400' : isDark ? 'text-slate-600 group-hover:text-slate-500' : 'text-gray-400'}`} />
                        <span className={`text-sm ${isDark ? 'text-slate-300 group-hover:text-slate-200' : 'text-gray-700'}`}>Layout</span>
                      </label>

                      {/* Post Processing */}
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <div className={`relative w-9 h-5 rounded-full transition-all duration-300 ${postProcessing ? 'bg-violet-500 shadow-md shadow-violet-500/40' : isDark ? 'bg-slate-700' : 'bg-gray-300'}`}>
                          <input type="checkbox" checked={postProcessing} onChange={() => setPostProcessing(!postProcessing)} className="sr-only peer" />
                          <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300 ${postProcessing ? 'translate-x-4' : ''}`} />
                        </div>
                        <Wand2 className={`h-3.5 w-3.5 transition-colors ${postProcessing ? 'text-violet-400' : isDark ? 'text-slate-600 group-hover:text-slate-500' : 'text-gray-400'}`} />
                        <span className={`text-sm ${isDark ? 'text-slate-300 group-hover:text-slate-200' : 'text-gray-700'}`}>Post Process</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => {
                  if (tab === 'info') onInfo();
                  else if (tab === 'extract') onExtract();
                  else onPdfOcr();
                }}
                disabled={!file || loading}
                className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  file && !loading
                    ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:scale-[1.02]'
                    : isDark ? 'bg-slate-800 text-slate-500' : 'bg-gray-200 text-gray-400'
                } disabled:cursor-not-allowed`}
              >
                {loading ? <><span className="animate-spin">⟳</span> Processing…</> : tab === 'info' ? 'Get Info' : tab === 'extract' ? 'Extract Pages' : 'Run OCR'}
              </button>

              {loading && (
                <button
                  onClick={onStop}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-all"
                >
                  <Square className="h-3.5 w-3.5" /> Stop
                </button>
              )}
            </div>

            {/* Progress */}
            {loading && (tab === 'ocr' || tab === 'extract') && (
              <div className={`p-4 rounded-xl ${isDark ? 'bg-white/[0.02]' : 'bg-gray-50'}`}
                style={{ animation: 'float-up 0.35s ease-out' }}
              >
                <div className={`h-2 rounded-full overflow-hidden mb-3 ${isDark ? 'bg-slate-800' : 'bg-gray-200'}`}>
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 via-purple-500 to-violet-500 transition-all duration-700 ease-out bg-[length:200%_100%] animate-[gradientShift_3s_ease_infinite]"
                    style={{ width: `${progressTotalPages > 1 ? Math.min(100, (pagesCompleted / progressTotalPages) * 100) : 0}%` }}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
                  <span className={isDark ? 'text-slate-400' : 'text-gray-500'}>Elapsed: {formatMs(elapsedMs)}</span>
                  {progressTotalPages > 1 && lastPageTimeMs > 0 && (
                    <span className={isDark ? 'text-slate-400' : 'text-gray-500'}>ETA: {formatEta(((progressTotalPages - pagesCompleted) * lastPageTimeMs) / 1000)}</span>
                  )}
                  <span className={isDark ? 'text-slate-300 font-medium' : 'text-gray-700 font-medium'}>
                    {progressTotalPages > 1 && pagesCompleted > 0
                      ? `Page ${Math.min(pagesCompleted + 1, progressTotalPages)} of ${progressTotalPages}`
                      : `${pagesCompleted} page${pagesCompleted >= 0 ? 's' : ''} done`}
                  </span>
                  {lastPageTimeMs > 0 && <span className={isDark ? 'text-slate-400' : 'text-gray-500'}>~{Math.round(lastPageTimeMs)}ms/page</span>}
                </div>
              </div>
            )}

            {progress > 0 && progress < 100 && (
              <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-gray-200'}`}>
                <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>

          {/* Result */}
          {tab === 'preview' && file && (
            <div className="glass-card rounded-2xl p-6 text-center space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/20 bg-violet-500/10 text-violet-400 text-xs font-medium mb-2">
                <ImageIcon className="h-3 w-3" /> PDF Preview
              </div>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                Click to preview the uploaded PDF before running OCR.
              </p>
              <button
                onClick={() => setPdfViewerOpen(true)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:scale-[1.02] transition-all"
              >
                <Eye className="h-4 w-4" /> Open PDF Viewer
              </button>
            </div>
          )}
          {result && tab !== 'preview' && (tab === 'info' ? renderPdfInfo(result as PdfInfo) : tab === 'extract' ? renderPdfExtract(result as PdfExtractResponse) : renderPdfOcr(result))}
        </>
      )}

      {/* react-pdf full-screen viewer modal */}
      <PdfViewerModal file={file} open={pdfViewerOpen} onOpenChange={setPdfViewerOpen} dark={theme === 'dark'} />
    </div>
  );
}

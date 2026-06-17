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

import {useRef, useState} from 'react';
import {Clock, FileText, Scissors, Search, Square, Timer} from 'lucide-react';
import {cancelPdfOcr, pdfExtract, pdfInfo, pdfOcr} from '#/utils/api/pdf';
import {Card} from '#/components/ui/Card';
import {Button} from '#/components/ui/Button';
import {Badge} from '#/components/ui/Badge';
import {ProgressBar} from '#/components/ui/ProgressBar';
import {Dialog, DialogBody, DialogContent} from '#/components/ui/Dialog';
import {useToast} from '#/context/ToastContext';
import type {PdfExtractResponse, PdfInfo, PdfOcrPageResult} from '#/types/api';

type PdfTab = 'info' | 'extract' | 'ocr';

export function PdfPage() {
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

  // Image viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerPage, setViewerPage] = useState<{ page_number: number; image_b64: string } | null>(null);

  // OCR-specific params
  const [confThreshold, setConfThreshold] = useState(0.2);
  const [imgSize, setImgSize] = useState(1280);
  const [textCleaning, setTextCleaning] = useState(true);

  const { addToast } = useToast();

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
      const data = await pdfOcr(file, pageRange.from, pageRange.to ? Number(pageRange.to) : undefined, confThreshold, imgSize, String(textCleaning), undefined, taskId);
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

  const tabs: { key: PdfTab; label: string; icon: React.ReactNode }[] = [
    { key: 'info', label: 'Info', icon: <Search className="h-4 w-4" /> },
    { key: 'extract', label: 'Extract Pages', icon: <Scissors className="h-4 w-4" /> },
    { key: 'ocr', label: 'PDF OCR', icon: <FileText className="h-4 w-4" /> },
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
        <div key={label} className="flex justify-between border-b border-gray-100 dark:border-slate-800 py-2">
          <span className="text-gray-500 font-medium">{label}</span>
          <span className="rtl text-right max-w-[60%] truncate text-gray-900 dark:text-gray-100">{value}</span>
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
        <p className="text-sm text-gray-500">{data.total_pages} pages · {data.total_text_lines} lines</p>
        {pages.map((pg: PdfOcrPageResult, i: number) => {
          const confMean = pg.confidence_stats?.mean ?? 0;
          return (
            <Card key={i} title={`Page ${pg.page_number}`} description={`${pg.detected_lines} lines · ${Math.round(confMean * 100)}% confidence`}>
              <div className="rtl text-right border rounded-lg px-4 py-3 bg-gray-50 dark:bg-slate-900/50 leading-loose" dir="rtl">
                {pg.full_text || <span className="text-gray-400 italic">No text.</span>}
              </div>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Upload Zone */}
      <Card title="Upload PDF" description="Drop a PDF or click to select. All operations are per-file.">
        <input
          type="file"
          accept=".pdf"
          className="hidden"
          id="pdf-input"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <label htmlFor="pdf-input" className="block cursor-pointer border-2 border-dashed rounded-xl p-8 text-center transition-colors hover:border-violet-400">
          {file ? (
            <div className="space-y-2">
              <FileText className="h-10 w-10 mx-auto text-violet-500" />
              <p className="text-sm font-medium">{file.name}</p>
              <Badge variant="info" label="PDF Selected" />
            </div>
          ) : (
            <div className="space-y-2">
              <FileText className="h-10 w-10 mx-auto text-gray-400 dark:text-gray-500" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Drop PDF here or click to select</p>
            </div>
          )}
        </label>
      </Card>

      {/* Tabs */}
      {file && (
        <>
          <div className="flex gap-1 border-b border-gray-200 dark:border-slate-700">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.key
                    ? 'border-violet-600 text-violet-600 dark:text-violet-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Page range (for extract + OCR) */}
          {(tab === 'extract' || tab === 'ocr') && (
            <Card>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">From page:</span>
                <input type="number" min={1} value={pageRange.from} onChange={(e) => setPageRange((p) => ({ ...p, from: Number(e.target.value) }))} className="w-20 border rounded-lg px-3 py-1.5 dark:bg-slate-800 dark:border-slate-700" />
                <span className="text-gray-500">To page:</span>
                <input type="number" min={1} value={pageRange.to || ''} onChange={(e) => setPageRange((p) => ({ ...p, to: e.target.value }))} placeholder="All" className="w-20 border rounded-lg px-3 py-1.5 dark:bg-slate-800 dark:border-slate-700" />
              </div>
            </Card>
          )}

          {/* OCR-specific options */}
          {tab === 'ocr' && (
            <Card>
              <div className="flex flex-wrap gap-4 text-sm">
                <div>
                  <label className="text-gray-500 block mb-1">Confidence Threshold</label>
                  <input type="number" step={0.1} min={0} max={1} value={confThreshold} onChange={(e) => setConfThreshold(Number(e.target.value))} className="w-24 border rounded-lg px-3 py-1.5 dark:bg-slate-800 dark:border-slate-700" />
                </div>
                <div>
                  <label className="text-gray-500 block mb-1">Image Size</label>
                  <input type="number" value={imgSize} onChange={(e) => setImgSize(Number(e.target.value))} className="w-24 border rounded-lg px-3 py-1.5 dark:bg-slate-800 dark:border-slate-700" />
                </div>
                <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer pt-5">
                  <input type="checkbox" checked={textCleaning} onChange={() => setTextCleaning(!textCleaning)} className="accent-violet-600" />
                  Text Cleaning
                </label>
              </div>
            </Card>
          )}

          {/* Action button */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Button onClick={() => {
                if (tab === 'info') onInfo();
                else if (tab === 'extract') onExtract();
                else onPdfOcr();
              }} disabled={!file || loading} loading={loading}>
                {loading ? 'Processing…' : tab === 'info' ? 'Get PDF Info' : tab === 'extract' ? 'Extract Pages' : 'Run OCR'}
              </Button>

              {/* Stop button — visible during any active processing */}
              {loading && (
                <Button
                  variant="destructive"
                  onClick={onStop}
                  className="flex items-center gap-1.5"
                >
                  <Square className="h-4 w-4" />
                  Stop
                </Button>
              )}
            </div>

            {/* Progress indicator */}
            {loading && (tab === 'ocr' || tab === 'extract') && (
              <div className="space-y-2">
                {/* Progress bar — only show real progress from backend, otherwise 0% */}
                <ProgressBar
                  value={progressTotalPages > 1 ? Math.min(100, (pagesCompleted / progressTotalPages) * 100) : 0}
                  label={`${pagesCompleted} / ${progressTotalPages > 1 ? progressTotalPages : pageRange.to || '?'} pages`}
                />

                {/* Detailed stats */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    Elapsed: {formatMs(elapsedMs)}
                  </span>
                  {progressTotalPages > 1 && lastPageTimeMs > 0 && (
                    <span className="flex items-center gap-1">
                      <Timer className="h-3.5 w-3.5" />
                      ETA: {formatEta(((progressTotalPages - pagesCompleted) * lastPageTimeMs) / 1000)}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    {progressTotalPages > 1 && pagesCompleted > 0
                      ? `Page ${Math.min(pagesCompleted + 1, progressTotalPages)} of ${progressTotalPages}`
                      : progressTotalPages > 1
                        ? `${pagesCompleted} page${pagesCompleted >= 0 ? 's' : ''} done`
                        : 'Waiting for data...'}
                  </span>
                  {lastPageTimeMs > 0 && (
                    <span className="flex items-center gap-1">
                      ~{Math.round(lastPageTimeMs)}ms/page
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Progress bar */}
            {progress > 0 && progress < 100 && (
              <ProgressBar value={progress} label="Upload progress" />
            )}
          </div>

          {/* Result */}
          {result && (tab === 'info' ? renderPdfInfo(result as PdfInfo) : tab === 'extract' ? renderPdfExtract(result as PdfExtractResponse) : renderPdfOcr(result))}
        </>
      )}
    </div>
  );
}

/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2025 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import { Upload, FileImage, Copy, CheckCircle2, AlertTriangle, Loader2, Settings2, Sparkles, Image as ImageIcon, ClipboardPaste } from 'lucide-react';
import { ocrSingle, ocrEnhanced } from '#/utils/api/ocr';
import type { OcrResult, OcrLine, ConfidenceStats } from '#/types/api';
import { useToast } from '#/context/ToastContext';
import { formatBytes, isImageFile } from '#/utils/file';
import type { UploadProgress } from '#/types/api';

const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/gif'];

interface OcrPageProps {
  onResult?: (result: OcrResult) => void;
}

export function OcrPage({ onResult }: OcrPageProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [enhanceOpen, setEnhanceOpen] = useState(false);
  const [autoContrast, setAutoContrast] = useState(false);
  const [sharpen, setSharpen] = useState(false);
  const [denoise, setDenoise] = useState(false);
  const [normBg, setNormBg] = useState(false);

  const { addToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const isDark = true;

  /* ── Clipboard paste handling ───────────────────────────── */

  /** Convert a clipboard Blob into a File, if it's an image. */
  const blobToFile = (blob: Blob): File | null => {
    const type = blob.type;
    if (!IMAGE_MIME.includes(type) && !type.startsWith('image/')) return null;
    const ext = type.split('/')[1] ?? 'png';
    const name = (file?.name ?? 'pasted-image').replace(/\.[^.]+$/, '') + `.${ext}`;
    return new File([blob], name, { type });
  };

  /** Handle an image pasted from the clipboard. */
  const handlePasteImage = useCallback((blob: Blob) => {
    const file = blobToFile(blob);
    if (!file) {
      addToast('Clipboard does not contain an image.', 'error');
      return;
    }
    setFile(file);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
    addToast('Image pasted from clipboard.', 'success');
  }, [addToast]);

  /** Global paste listener — works anywhere on the page. */
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      for (const item of e.clipboardData.items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) handlePasteImage(blob);
          return;
        }
      }
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [handlePasteImage]);

  /** Paste event on the drop zone itself (captures before global). */
  const onZonePaste = useCallback((e: React.ClipboardEvent) => {
    if (!e.clipboardData) return;
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (blob) handlePasteImage(blob);
        return;
      }
    }
  }, [handlePasteImage]);

  /* ── File handling ──────────────────────────────────────── */

  const handleFile = useCallback((f: File) => {
    if (!IMAGE_MIME.includes(f.type) && !isImageFile(f)) {
      addToast('Unsupported file type. Use JPG, PNG, WebP, BMP or GIF.', 'error');
      return;
    }
    setFile(f);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  }, [addToast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  /* ── OCR processing ─────────────────────────────────────── */

  const runOcr = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setProgress(0);
    setResult(null);
    try {
      let data: OcrResult;
      const useEnhance = autoContrast || sharpen || denoise || normBg;

      if (useEnhance) {
        const opts = { auto_contrast: autoContrast, sharpen, denoise, normalize_background: normBg };
        data = await ocrEnhanced(file, opts, setProgress);
      } else {
        data = await ocrSingle(file, undefined, setProgress);
      }

      setResult(data);
      addToast(`OCR complete — ${data.detected_lines} lines detected.`, 'success');
      onResult?.(data);
    } catch (err: any) {
      addToast(err?.message || 'OCR failed.', 'error');
    } finally {
      setLoading(false);
    }
  }, [file, autoContrast, sharpen, denoise, normBg, addToast]);

  /* ── Clipboard / Export helpers ─────────────────────────── */

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    addToast('Text copied to clipboard.', 'info');
  };

  const downloadTxt = () => {
    if (!result) return;
    const blob = new Blob([result.full_text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${file?.name ?? 'ocr'}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* ── Render helpers ─────────────────────────────────────── */

  const confidenceColor = (c: number) => {
    if (c >= 0.7) return 'text-emerald-400';
    if (c >= 0.4) return 'text-amber-400';
    return 'text-red-400';
  };

  const confidenceBg = (c: number) => {
    if (c >= 0.7) return 'bg-emerald-500/20 text-emerald-400';
    if (c >= 0.4) return 'bg-amber-500/20 text-amber-400';
    return 'bg-red-500/20 text-red-400';
  };

  const statsBars = (stats: ConfidenceStats) => [
    { label: 'Mean', value: stats.mean, color: 'from-violet-500 to-purple-500' },
    { label: 'Median', value: stats.median, color: 'from-blue-500 to-cyan-500' },
    { label: 'Min', value: stats.min, color: 'from-red-400 to-rose-500' },
    { label: 'Max', value: stats.max, color: 'from-emerald-400 to-green-500' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* ── Hero Section ─────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-violet-500/10 bg-gradient-to-br from-violet-500/5 via-transparent to-purple-500/5">
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="relative px-6 py-8 sm:px-10 sm:py-12 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-500/20 bg-violet-500/10 text-violet-400 text-xs font-medium mb-4">
            <Sparkles className="h-3 w-3" /> AI-Powered Urdu OCR
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
            Extract Urdu Text from <span className="gradient-text">Images</span>
          </h2>
          <p className={`text-sm max-w-md mx-auto ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            Upload any image with Urdu text and get instant, accurate text extraction powered by advanced OCR models.
          </p>
          <p className={`text-xs mt-2 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>Tip: You can also <span className="inline-flex items-center gap-1"><ClipboardPaste className="h-3 w-3"/> paste an image directly (Ctrl+V)</span></p>
        </div>
      </div>

      {/* ── Upload Zone ─────────────────────────────── */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <ImageIcon className={`h-5 w-5 ${isDark ? 'text-slate-300' : 'text-gray-600'}`} />
          <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Upload Image</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? 'bg-slate-700/50 text-slate-400' : 'bg-gray-100 text-gray-500'}`}>JPG, PNG, WebP, BMP, GIF</span>
        </div>

        <div
          className={`relative border-2 border-dashed rounded-xl p-8 sm:p-12 text-center transition-all duration-300 cursor-pointer ${
            preview
              ? 'border-violet-500/40 bg-violet-500/5'
              : isDark
                ? 'border-slate-700/60 hover:border-violet-500/30 hover:bg-white/[0.02]'
                : 'border-gray-200 hover:border-violet-400/40 hover:bg-violet-50/30'
          }`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          onPasteCapture={onZonePaste}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.bmp,.gif"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />

          {preview ? (
            <div className="space-y-4">
              <div className="relative inline-block max-h-72 rounded-xl overflow-hidden border border-slate-700/50">
                <img src={preview} alt="Preview" className="max-h-72 mx-auto object-contain" />
              </div>
              <div className={`inline-flex items-center gap-2 text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                {file?.name} · {formatBytes(file?.size ?? 0)}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center ${isDark ? 'bg-white/5' : 'bg-gray-100'}`}>
                <Upload className={`h-8 w-8 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>Drag & drop or click to select</p>
                <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>Maximum file size: 20MB</p>
              </div>
            </div>
          )}
        </div>

        {/* Enhancement options */}
        <div className="mt-4">
          <button
            onClick={() => setEnhanceOpen(!enhanceOpen)}
            className={`flex items-center gap-2 text-sm font-medium cursor-pointer transition-colors ${isDark ? 'text-slate-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <Settings2 className="h-4 w-4" /> Enhancement Options
            <span className={`text-xs px-1.5 py-0.5 rounded ${isDark ? 'bg-slate-700/50 text-slate-400' : 'bg-gray-100 text-gray-500'}`}>
              {autoContrast || sharpen || denoise || normBg ? 'Active' : 'Off'}
            </span>
          </button>

          {enhanceOpen && (
            <div className={`mt-3 p-4 rounded-xl ${isDark ? 'bg-white/[0.02]' : 'bg-gray-50'}`}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  ['Auto Contrast', autoContrast] as const,
                  ['Sharpen', sharpen] as const,
                  ['Denoise', denoise] as const,
                  ['Normalize BG', normBg] as const,
                ].map(([label, val]) => {
                  const setters: Record<string, () => void> = {
                    'Auto Contrast': () => setAutoContrast(!autoContrast),
                    Sharpen: () => setSharpen(!sharpen),
                    Denoise: () => setDenoise(!denoise),
                    'Normalize BG': () => setNormBg(!normBg),
                  };
                  return (
                    <label key={label} className="flex items-center gap-2 text-sm cursor-pointer group">
                      <div className={`relative w-9 h-5 rounded-full transition-colors ${val ? 'bg-violet-500' : isDark ? 'bg-slate-700' : 'bg-gray-300'}`}>
                        <input type="checkbox" checked={val} onChange={setters[label]} className="sr-only peer" />
                        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${val ? 'translate-x-4' : ''}`} />
                      </div>
                      <span className={`${isDark ? 'text-slate-300 group-hover:text-white' : 'text-gray-600 group-hover:text-gray-900'} transition-colors`}>{label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={runOcr}
            disabled={!file || loading}
            className={`relative inline-flex items-center justify-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold transition-all duration-300 ${
              file && !loading
                ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:scale-[1.02]'
                : isDark ? 'bg-slate-800 text-slate-500' : 'bg-gray-200 text-gray-400'
            } disabled:cursor-not-allowed`}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Extract Text
              </>
            )}
          </button>

          {progress > 0 && progress < 100 && (
            <div className="flex-1 max-w-[200px]">
              <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-gray-200'}`}>
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Results Section ─────────────────────────── */}
      {result && (
        <>
          {/* Status bar */}
          <div className={`inline-flex items-center gap-3 px-4 py-2 rounded-xl ${isDark ? 'bg-white/[0.03]' : 'bg-gray-100'}`}>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${
              result.status === 'success' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
            }`}>
              {result.status === 'success' ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {result.status.toUpperCase()}
            </span>
            <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>{result.task_id}</span>
            <span className={`w-1 h-1 rounded-full ${isDark ? 'bg-slate-700' : 'bg-gray-300'}`} />
            <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{result.detected_lines} lines</span>
            <span className={`w-1 h-1 rounded-full ${isDark ? 'bg-slate-700' : 'bg-gray-300'}`} />
            <span className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>{Math.round(result.processing_time_ms)}ms</span>
          </div>

          {/* Annotated Image */}
          {result.annotated_image_b64 && (
            <div className="glass-card rounded-2xl p-6">
              <h3 className={`font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>Detected Lines</h3>
              <div className="rounded-xl overflow-hidden border border-slate-700/50">
                <img src={`data:image/png;base64,${result.annotated_image_b64}`} alt="Annotated" className="max-h-[500px] mx-auto w-full object-contain" />
              </div>
            </div>
          )}

          {/* Full Text */}
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Extracted Urdu Text</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyToClipboard(result.full_text)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isDark ? 'bg-white/5 hover:bg-white/10 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                  }`}
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                </button>
                <button
                  onClick={downloadTxt}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isDark ? 'bg-white/5 hover:bg-white/10 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                  }`}
                >
                  Download .txt
                </button>
              </div>
            </div>
            <div className={`rounded-xl px-5 py-4 border leading-loose text-base ${
              isDark ? 'bg-white/[0.02] border-slate-700/60' : 'bg-gray-50 border-gray-200'
            }`}>
              <p className={`rtl text-right ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>
                {result.full_text || <span className={`${isDark ? 'text-slate-600' : 'text-gray-400'} italic`}>No text detected.</span>}
              </p>
            </div>
          </div>

          {/* Per-line table */}
          <div className="glass-card rounded-2xl p-6">
            <h3 className={`font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>Per-Line Results <span className={`font-normal text-sm ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>({result.lines.length})</span></h3>
            <div className="overflow-x-auto rounded-xl border border-slate-700/40">
              <table className="w-full text-sm">
                <thead>
                  <tr className={isDark ? 'bg-white/[0.03]' : 'bg-gray-50'}>
                    <th className={`py-3 px-4 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>#</th>
                    <th className={`py-3 px-4 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Text (Urdu)</th>
                    <th className={`py-3 px-4 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {result.lines.map((line, i) => (
                    <tr key={i} className={`border-t transition-colors ${isDark ? 'border-slate-800/50 hover:bg-white/[0.02]' : 'border-gray-100 hover:bg-gray-50'}`}>
                      <td className={`py-3 px-4 font-mono text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>{i + 1}</td>
                      <td className="py-3 px-4 rtl text-right" dir="rtl"><span className={`${isDark ? 'text-slate-200' : 'text-gray-800'}`}>{line.text}</span></td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${confidenceBg(line.confidence)}`}>
                          {Math.round(line.confidence * 100)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Confidence Stats */}
          <div className="glass-card rounded-2xl p-6">
            <h3 className={`font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>Confidence Statistics</h3>
            <div className="space-y-3">
              {statsBars(result.confidence_stats).map(({ label, value, color }) => (
                <div key={label}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className={`font-medium ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>{label}</span>
                    <span className={`font-semibold ${confidenceColor(value)}`}>{Math.round(value * 100)}%</span>
                  </div>
                  <div className={`h-2.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-800/80' : 'bg-gray-100'}`}>
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700`}
                      style={{ width: `${Math.round(value * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Loading state */}
      {loading && !progress && (
        <div className={`flex items-center gap-3 p-4 rounded-xl ${isDark ? 'bg-violet-500/5 border border-violet-500/10' : 'bg-violet-50 border border-violet-200'}`}>
          <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
          <span className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>Processing image… This may take a moment.</span>
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && file && (
        <div className={`text-center py-12 rounded-2xl border border-dashed ${isDark ? 'border-slate-800 bg-white/[0.01]' : 'border-gray-200 bg-gray-50/50'}`}>
          <Sparkles className={`h-8 w-8 mx-auto mb-3 ${isDark ? 'text-slate-600' : 'text-gray-400'}`} />
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Click "Extract Text" to process your image.</p>
        </div>
      )}
    </div>
  );
}

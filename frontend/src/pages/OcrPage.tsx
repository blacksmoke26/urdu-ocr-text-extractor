/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2025 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

/**
 * OCR Page — Upload images for Urdu text extraction.
 *
 * Supports single-image upload with drag & drop, annotated image preview,
 * per-line results table, confidence stats, and export actions.
 *
 * @author Junaid Atari <mj.atari@gmail.com>
 */

import { useCallback, useRef, useState } from 'react';
import { Upload, FileImage, Copy, CheckCircle2, AlertTriangle, Loader2, Settings2 } from 'lucide-react';
import { ocrSingle, ocrEnhanced } from '#/utils/api/ocr';
import type { OcrResult, OcrLine, ConfidenceStats, EnhanceOptions } from '#/types/api';
import { Card } from '#/components/ui/Card';
import { Button } from '#/components/ui/Button';
import { Badge } from '#/components/ui/Badge';
import { ProgressBar } from '#/components/ui/ProgressBar';
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

  // Enhancement toggles
  const [autoContrast, setAutoContrast] = useState(false);
  const [sharpen, setSharpen] = useState(false);
  const [denoise, setDenoise] = useState(false);
  const [normBg, setNormBg] = useState(false);

  const { addToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

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
        const opts: EnhanceOptions = { auto_contrast: autoContrast, sharpen, denoise, normalize_background: normBg };
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
    if (c >= 0.7) return 'text-emerald-600 dark:text-emerald-400';
    if (c >= 0.4) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  const statsBars = (stats: ConfidenceStats) => [
    { label: 'Mean', value: stats.mean, color: 'bg-violet-500' },
    { label: 'Median', value: stats.median, color: 'bg-blue-500' },
    { label: 'Min', value: stats.min, color: 'bg-red-400' },
    { label: 'Max', value: stats.max, color: 'bg-emerald-500' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ── Upload Zone ───────────────────────────────────── */}
      <Card title="Upload Image" description="Drop an image or click to select. Supports JPG, PNG, WebP, BMP, GIF.">
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
            preview ? 'border-violet-300 dark:border-violet-600' : 'border-gray-200 dark:border-slate-700 hover:border-violet-400'
          }`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.bmp,.gif"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />

          {preview ? (
            <div className="space-y-3">
              <img src={preview} alt="Preview" className="max-h-64 mx-auto rounded-lg object-contain" />
              <p className="text-xs text-gray-500">{file?.name} · {formatBytes(file?.size ?? 0)}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="h-10 w-10 mx-auto text-gray-400 dark:text-gray-500" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Drag & drop or click to select</p>
            </div>
          )}
        </div>

        {/* Enhancement options */}
        <details className="mt-4" open={enhanceOpen}>
          <summary
            onClick={() => setEnhanceOpen(!enhanceOpen)}
            className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300 cursor-pointer"
          >
            <Settings2 className="h-4 w-4" /> Enhancement Options
          </summary>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([
              ['Auto Contrast', autoContrast, setAutoContrast],
              ['Sharpen', sharpen, setSharpen],
              ['Denoise', denoise, setDenoise],
              ['Normalize BG', normBg, setNormBg],
            ] as const).map(([label, val, set]) => (
              <label key={label} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input type="checkbox" checked={val} onChange={() => set(!val)} className="accent-violet-600" />
                {label}
              </label>
            ))}
          </div>
        </details>

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={runOcr} disabled={!file || loading} loading={loading}>
            {loading ? 'Processing…' : 'Extract Text'}
          </Button>
          {progress > 0 && progress < 100 && (
            <ProgressBar value={progress} label="Upload progress" />
          )}
        </div>
      </Card>

      {/* ── Results Section ────────────────────────────────── */}
      {result && (
        <>
          {/* Status line */}
          <div className="flex items-center gap-3">
            <Badge variant={result.status === 'success' ? 'success' : 'error'} label={result.status.toUpperCase()} />
            <span className="text-sm text-gray-500">{result.task_id}</span>
            <span className="text-sm text-gray-500">· {result.detected_lines} lines</span>
            <span className="text-sm text-gray-500">· {Math.round(result.processing_time_ms)}ms</span>
          </div>

          {/* Annotated Image */}
          {result.annotated_image_b64 && (
            <Card title="Detected Lines">
              <img src={`data:image/png;base64,${result.annotated_image_b64}`} alt="Annotated" className="rounded-lg max-h-96 mx-auto object-contain" />
            </Card>
          )}

          {/* Full Text */}
          <Card title="Extracted Urdu Text" description="Click copy to clipboard or download as .txt.">
            <div className="flex justify-end gap-2 mb-2">
              <Button variant="secondary" onClick={() => copyToClipboard(result.full_text)}>
                <Copy className="h-4 w-4 mr-1" /> Copy
              </Button>
              <Button variant="ghost" onClick={downloadTxt}>Download .txt</Button>
            </div>
            <div className="rtl text-right border rounded-lg px-4 py-3 bg-gray-50 dark:bg-slate-900/50 dark:border-slate-700/60 leading-loose text-base">
              {result.full_text || <span className="text-gray-400 italic">No text detected.</span>}
            </div>
          </Card>

          {/* Per-line table */}
          <Card title={`Per-Line Results (${result.lines.length})`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-gray-400 border-b dark:border-slate-700">
                    <th className="py-2 pr-4">#</th>
                    <th className="py-2 pr-4">Text (Urdu)</th>
                    <th className="py-2 pr-4">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {result.lines.map((line, i) => (
                    <tr key={i} className="border-b border-gray-100 dark:border-slate-800 last:border-0">
                      <td className="py-2 pr-4 text-gray-400">{i + 1}</td>
                      <td className="py-2 pr-4 rtl text-right" dir="rtl">{line.text}</td>
                      <td className={`py-2 pr-4 font-medium ${confidenceColor(line.confidence)}`}>
                        {Math.round(line.confidence * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Confidence Stats */}
          <Card title="Confidence Statistics">
            <div className="space-y-2">
              {statsBars(result.confidence_stats).map(({ label, value, color }) => (
                <div key={label}>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{label}</span>
                    <span>{Math.round(value * 100)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
                    <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.round(value * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {/* Loading overlay */}
      {loading && !progress && (
        <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-medium">Processing image…</span>
        </div>
      )}

      {/* No-result state */}
      {!result && !loading && file && (
        <p className="text-center text-sm text-gray-400 mt-8">Upload an image and click "Extract Text" to begin.</p>
      )}
    </div>
  );
}

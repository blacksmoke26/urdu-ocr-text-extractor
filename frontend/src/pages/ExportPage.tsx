/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2025 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

/**
 * Export Page — Format results from OCR output (image + PDF).
 *
 * Displays available export formats as interactive cards with mini-charts,
 * confidence stats bar visualization, and download actions.
 * Inspired by the GitHub Design System card layout.
 */

import { useCallback, useRef, useState } from 'react';
import { FileJson, FileText, Table2, FileSpreadsheet, FileCode2, Download, CheckCircle2, BookOpen } from 'lucide-react';
import type { OcrResult, PdfOcrResponse, ExportFormat } from '#/types/api';
import { Card } from '#/components/ui/Card';
import {
  exportJson,
  exportTxt,
  exportCsv,
  exportDocx,
  exportSearchablePdf,
  exportPdfJson,
  exportPdfTxt,
  exportPdfCsv,
  exportPdfDocx,
  downloadBase64File,
  downloadTextFile,
} from '#/utils/api/export';

// ─── Export format definitions ──────────────────────────────

type FormatDef = {
  key: ExportFormat;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  lightBg: string;
  darkBg: string;
  darkBorder: string;
};

const FORMAT_DEFS: FormatDef[] = [
  {
    key: 'json',
    label: 'JSON',
    description: 'Structured data with lines, confidence & bbox metadata.',
    icon: FileJson,
    color: 'text-violet-500',
    lightBg: 'bg-violet-50',
    darkBg: 'dark:bg-violet-950/30',
    darkBorder: 'dark:border-violet-800/50',
  },
  {
    key: 'txt',
    label: 'Plain Text',
    description: 'Clean extracted text, ready for copy or download.',
    icon: FileText,
    color: 'text-emerald-500',
    lightBg: 'bg-emerald-50',
    darkBg: 'dark:bg-emerald-950/30',
    darkBorder: 'dark:border-emerald-800/50',
  },
  {
    key: 'csv',
    label: 'CSV',
    description: 'Tabular export with per-line bounding box coordinates.',
    icon: Table2,
    color: 'text-blue-500',
    lightBg: 'bg-blue-50',
    darkBg: 'dark:bg-blue-950/30',
    darkBorder: 'dark:border-blue-800/50',
  },
  {
    key: 'docx',
    label: 'Word (.docx)',
    description: 'Rich document with formatted text and metadata.',
    icon: FileSpreadsheet,
    color: 'text-sky-500',
    lightBg: 'bg-sky-50',
    darkBg: 'dark:bg-sky-950/30',
    darkBorder: 'dark:border-sky-800/50',
  },
  {
    key: 'pdf',
    label: 'Searchable PDF',
    description: 'Image-based PDF with invisible text layer for search.',
    icon: FileCode2,
    color: 'text-rose-500',
    lightBg: 'bg-rose-50',
    darkBg: 'dark:bg-rose-950/30',
    darkBorder: 'dark:border-rose-800/50',
  },
];

// ─── Mini bar chart component ───────────────────────────────

function MiniBarChart({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-[3px] h-8">
      {values.map((v, i) => (
        <div
          key={i}
          className={`w-[6px] rounded-sm ${color} opacity-70`}
          style={{ height: `${(v / max) * 100}%` }}
        />
      ))}
    </div>
  );
}

// ─── Confidence mini sparkline (for OcrResult lines) ────────

function ConfidenceSparkline({ lines }: { lines: OcrResult['lines'] }) {
  const values = lines.map((l) => Math.round(l.confidence * 100));
  if (values.length === 0) return <div className="h-8 flex items-center"><span className="text-xs text-gray-400">No data</span></div>;

  // Sample to max 30 bars for compactness
  const sampled = values.length > 30 ? values.filter((_, i) => i % Math.ceil(values.length / 30) === 0).slice(0, 30) : values;

  return (
    <div className="space-y-1">
      <MiniBarChart values={sampled} color="bg-violet-500" />
      <div className="flex gap-[2px] h-6 mt-[-4px]">
        {sampled.map((v, i) => (
          <div
            key={i}
            className={`w-[4px] rounded-[1px] ${v >= 70 ? 'bg-emerald-500' : v >= 40 ? 'bg-amber-500' : 'bg-red-500'} opacity-60`}
            style={{ height: `${(v / 100) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Stat pill component ────────────────────────────────────

function StatPill({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-900/40 border border-gray-100 dark:border-slate-700/60">
      <span className={color}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-gray-400 leading-none">{label}</p>
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate leading-tight mt-0.5">{value}</p>
      </div>
    </div>
  );
}

// ─── Aggregated stats helper (works for both types) ─────────

interface AggStats {
  detectedLines: number;
  avgConfidence: number;
  totalPages: number;
  charCount: number;
  allText: string;
  lines: { text: string; confidence: number }[];
}

function computeAggStats(
  ocrResult: OcrResult | null,
  pdfOcrResult: PdfOcrResponse | null,
): AggStats {
  if (ocrResult) {
    const cs = ocrResult.confidence_stats;
    return {
      detectedLines: ocrResult.detected_lines,
      avgConfidence: Math.round(cs.mean * 100),
      totalPages: 1,
      charCount: ocrResult.full_text.length,
      allText: ocrResult.full_text,
      lines: ocrResult.lines.map((l) => ({ text: l.text, confidence: Math.round(l.confidence * 100) })),
    };
  }
  if (pdfOcrResult) {
    const pages = pdfOcrResult.pages ?? [];
    const allTexts: string[] = [];
    const lines: { text: string; confidence: number }[] = [];
    let totalConf = 0;
    let confCount = 0;
    for (const page of pages) {
      const pt = page.full_text ?? '';
      if (pt) allTexts.push(pt);
      for (const line of page.lines ?? []) {
        lines.push({ text: line.text, confidence: Math.round(line.confidence * 100) });
        totalConf += line.confidence;
        confCount += 1;
      }
    }
    return {
      detectedLines: pdfOcrResult.total_text_lines ?? lines.length,
      avgConfidence: confCount > 0 ? Math.round((totalConf / confCount) * 100) : 0,
      totalPages: pdfOcrResult.total_pages ?? pages.length,
      charCount: allTexts.join('\n').length,
      allText: allTexts.join('\n'),
      lines,
    };
  }
  return { detectedLines: 0, avgConfidence: 0, totalPages: 0, charCount: 0, allText: '', lines: [] };
}

// ─── Main Export Page ───────────────────────────────────────

interface ExportPageProps {
  ocrResult: OcrResult | null;
  pdfOcrResult: PdfOcrResponse | null;
}

export function ExportPage({ ocrResult, pdfOcrResult }: ExportPageProps) {
  const [activeFormat, setActiveFormat] = useState<ExportFormat | null>(null);
  const [busyFormats, setBusyFormats] = useState<Set<ExportFormat>>(new Set());
  const lastOcrRef = useRef<OcrResult | null>(null);
  const lastPdfRef = useRef<PdfOcrResponse | null>(null);

  const isPdfSource = !!pdfOcrResult;
  const sourceFilename = (ocrResult?.filename ?? pdfOcrResult?.filename ?? 'document') as string;

  /* ── Actions ─────────────────────────────────────── */

  const handleExport = useCallback(async (format: ExportFormat) => {
    if (!ocrResult && !pdfOcrResult) return;
    setActiveFormat(format);

    if (ocrResult) lastOcrRef.current = ocrResult;
    if (pdfOcrResult) lastPdfRef.current = pdfOcrResult;

    setBusyFormats((prev) => new Set(prev).add(format));

    try {
      if (pdfOcrResult) {
        // PDF-specific exports
        switch (format) {
          case 'json': {
            const res = await exportPdfJson(pdfOcrResult);
            downloadTextFile(res.data, `${sourceFilename}.pdf.json`);
            break;
          }
          case 'txt': {
            const res = await exportPdfTxt(pdfOcrResult);
            downloadTextFile(res.data, `${sourceFilename}.pdf.txt`);
            break;
          }
          case 'csv': {
            const res = await exportPdfCsv(pdfOcrResult);
            downloadTextFile(res.data, `${sourceFilename}.pdf.csv`);
            break;
          }
          case 'docx': {
            const res = await exportPdfDocx(pdfOcrResult);
            downloadBase64File(res.data_b64, `${sourceFilename}.pdf.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            break;
          }
          case 'pdf': {
            // PDF exports don't use searchable-pdf for multi-page; just skip
            alert('For PDF OCR results, use JSON, TXT, CSV, or DOCX format.');
            break;
          }
        }

        setTimeout(() => setActiveFormat(null), 1500);
      } else if (ocrResult) {
        // Image-specific exports
        switch (format) {
          case 'json': {
            const res = await exportJson(ocrResult);
            downloadTextFile(res.data, `${sourceFilename}.json`);
            break;
          }
          case 'txt': {
            const res = await exportTxt(ocrResult);
            downloadTextFile(res.data, `${sourceFilename}.txt`);
            break;
          }
          case 'csv': {
            const res = await exportCsv(ocrResult);
            downloadTextFile(res.data, `${sourceFilename}.csv`);
            break;
          }
          case 'docx': {
            const res = await exportDocx(ocrResult);
            downloadBase64File(res.data_b64, `${sourceFilename}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            break;
          }
          case 'pdf': {
            const res = await exportSearchablePdf(ocrResult);
            downloadBase64File(res.data_b64, `${sourceFilename}.pdf`, 'application/pdf');
            break;
          }
        }

        setTimeout(() => setActiveFormat(null), 1500);
      }
    } catch {
      // Keep activeFormat to show ring; user can retry
    } finally {
      setBusyFormats((prev) => {
        const next = new Set(prev);
        next.delete(format);
        return next;
      });
    }
  }, [ocrResult, pdfOcrResult, sourceFilename]);

  /* ── Stats ─────────────────────────────────────── */

  const stats = computeAggStats(ocrResult, pdfOcrResult);

  // Confidence distribution buckets for histogram chart
  const bucketSize = 10;
  const buckets: { label: string; count: number; color: string }[] = [];
  for (let start = 0; start < 100; start += bucketSize) {
    const end = start + bucketSize - 1;
    const count = stats.lines.filter((l) => l.confidence >= start && l.confidence <= end).length;
    let color: string;
    if (start >= 70) color = 'bg-emerald-500';
    else if (start >= 40) color = 'bg-amber-500';
    else color = 'bg-red-500';
    buckets.push({ label: `${start}-${end}`, count, color });
  }
  const maxBucket = Math.max(...buckets.map((b) => b.count), 1);

  /* ── No result state ─────────────────────────────────── */

  if (!ocrResult && !pdfOcrResult) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <Card title="Export Results" description="Run an OCR scan first. Export options appear after processing."><div className="text-xs text-gray-400">Go to the OCR tab for image files, or the PDF tab for PDF documents, then return here to export.</div></Card>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {FORMAT_DEFS.map(({ key, label, icon: Icon, color }) => (
            <div
              key={key}
              className="rounded-xl border-2 border-dashed border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/20 p-4 flex flex-col items-center justify-center gap-3 min-h-[140px] text-gray-400 hover:border-violet-300 dark:hover:border-violet-700 transition-colors"
            >
              <Icon className="h-8 w-8 opacity-40" />
              <span className="text-xs font-medium">{label}</span>
            </div>
          ))}
        </div>

        {/* Placeholder card layout matching reference image */}
        <Card title="Export Preview">
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Download className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm font-medium">No OCR result to export</p>
            <p className="text-xs mt-1 max-w-xs text-center text-gray-500">Upload an image or PDF and run OCR from the corresponding tab, then come back here to choose your format.</p>
          </div>
        </Card>
      </div>
    );
  }

  /* ── Active result state ─────────────────────────────── */

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ── Source badge + Header Stats Row ───────────────────────────── */}

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          {isPdfSource ? (
            <>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">PDF OCR Complete</span>
              <BadgeLight label={`${stats.totalPages} pages`} color="bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300" />
            </>
          ) : (
            <>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">OCR Complete</span>
              <BadgeLight label="Image" color="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" />
            </>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatPill icon={<FileText className="h-4 w-4" />} label="Lines" value={stats.detectedLines} color="text-violet-500" />
          <StatPill icon={<CheckCircle2 className="h-4 w-4" />} label="Avg Confidence" value={`${stats.avgConfidence}%`} color="text-emerald-500" />
          <StatPill icon={isPdfSource ? <BookOpen className="h-4 w-4" /> : <Download className="h-4 w-4" />} label={isPdfSource ? "Pages" : "Characters"} value={isPdfSource ? stats.totalPages : stats.charCount} color="text-blue-500" />
          {isPdfSource && (
            <StatPill icon={<FileText className="h-4 w-4" />} label="Total Text Lines" value={pdfOcrResult?.total_text_lines ?? '—'} color="text-amber-500" />
          )}
        </div>
      </Card>

      {/* ── Confidence Distribution Chart (bar chart) ─────────────── */}

      <Card title="Confidence Distribution" description="Histogram of per-line confidence scores across all detected text.">
        <div className="flex items-end gap-1 h-32 mt-2 px-1">
          {buckets.map((b) => (
            <div key={b.label} className="flex flex-col items-center flex-1 min-w-0 group relative">
              {/* Tooltip */}
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-gray-900 dark:bg-slate-700 text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                {b.label}: {b.count} lines
              </div>
              <div
                className={`w-full rounded-t-sm ${b.color} opacity-80 hover:opacity-100 transition-opacity cursor-default`}
                style={{ height: `${(b.count / maxBucket) * 100}%`, minHeight: b.count > 0 ? '4px' : '0' }}
              />
              <span className="text-[9px] text-gray-400 mt-1 truncate">{b.label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Confidence Sparkline (mini chart per-line) — shown only when line count is large enough to need a summary ───────────── */}

      {stats.lines.length > 10 && (
        <Card title="Per-Line Confidence" description="Color-coded confidence for each detected line. Green ≥ 70%, Amber ≥ 40%, Red < 40%.">
          {stats.lines.length > 0 ? (
            <ConfidenceSparkline lines={stats.lines as any} />
          ) : (
            <div className="h-16 flex items-center justify-center"><span className="text-sm text-gray-400 italic">No line data available.</span></div>
          )}
        </Card>
      )}

      {/* ── Per-Line Summary Chart (horizontal bars) ───────────── */}

      <Card title="Per-Line Confidence Detail" description={isPdfSource ? `First 15 lines of ${stats.totalPages} pages shown.` : 'First 15 lines shown. Confidence bars with color-coded thresholds.'}>
        <div className="space-y-2 mt-2">
          {stats.lines.slice(0, 15).map((line, i) => {
            const pct = line.confidence;
            const barColor = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';
            return (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-6 shrink-0 text-right">{i + 1}</span>
                <div className="flex-1 h-[18px] rounded bg-gray-100 dark:bg-slate-700/60 overflow-hidden relative">
                  <div
                    className={`h-full ${barColor} rounded transition-all duration-300`}
                    style={{ width: `${pct}%` }}
                  />
                  {/* Truncated text overlay */}
                  <span className="absolute inset-y-0 right-2 flex items-center text-[10px] text-white/80 rtl:right-auto rtl:left-2 truncate px-1" dir="rtl">
                    {line.text.slice(0, 30)}{line.text.length > 30 ? '…' : ''}
                  </span>
                </div>
                <span className={`text-xs font-medium w-10 shrink-0 text-right ${
                  pct >= 70 ? 'text-emerald-600 dark:text-emerald-400' : pct >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Export Format Cards ───────────────────────────── */}

      <Card title="Choose Format" description={isPdfSource ? 'Select an export format for your PDF OCR result.' : 'Select an export format to download your OCR result.'}>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {FORMAT_DEFS.map(({ key, label, description, icon: Icon, color }) => (
            <button
              key={key}
              onClick={() => handleExport(key)}
              disabled={!ocrResult && !pdfOcrResult || busyFormats.has(key)}
              className={`group relative rounded-xl border-2 border-gray-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/50 p-4 flex flex-col items-center gap-2 text-left transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none`}
            >
              {/* Icon circle */}
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color.replace('text-', 'bg-')} bg-opacity-10 dark:bg-opacity-20 group-hover:scale-110 transition-transform`}>
                <Icon className={`h-6 w-6 ${color}`} />
              </div>

              {/* Label */}
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{label}</span>
              <span className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug text-center line-clamp-2">{description}</span>

              {/* Busy / Done indicator */}
              {busyFormats.has(key) && (
                <div className="absolute top-2 right-2">
                  <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {activeFormat === key && !busyFormats.has(key) && (
                <div className="absolute top-2 right-2 text-emerald-500">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              )}

              {/* Active ring */}
              {activeFormat === key && (
                <div className="absolute inset-0 rounded-xl border-2 border-violet-500 pointer-events-none" />
              )}
            </button>
          ))}
        </div>
      </Card>

      {/* ── Full Text Quick View ───────────────────────────── */}

      <Card title={isPdfSource ? "Extracted Text Preview (PDF)" : "Extracted Text Preview"}>
        <div className="rtl text-right border rounded-lg px-4 py-3 bg-gray-50 dark:bg-slate-900/50 dark:border-slate-700/60 leading-loose text-base max-h-48 overflow-y-auto" dir="rtl">
          {stats.allText || <span className="text-gray-400 italic">No text detected.</span>}
        </div>
      </Card>
    </div>
  );
}

// ─── Small badge helper ──────────────────────────────────────

function BadgeLight({ label, color }: { label: string; color: string }) {
  return (
    <span className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${color}`}>
      {label}
    </span>
  );
}

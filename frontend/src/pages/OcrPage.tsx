/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2025 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import {
  Upload, FileImage, Copy, CheckCircle2, AlertTriangle, Loader2, Settings2, Sparkles, Image as ImageIcon,
  ClipboardPaste, Brain, BookOpen, Mic, Hash, Info, X, SlidersHorizontal, ChevronDown, ChevronUp,
  Grid3X3, Trash2, ZoomIn, RotateCw, Minus, Plus, Layers, Wand2, Sun, Moon, Eye, FileText,
  Maximize2, Type,
} from 'lucide-react';
import { ocrSingle, ocrEnhanced, ocrBatch } from '#/utils/api/ocr';
import type { OcrResult, OcrLine, ConfidenceStats, BatchOcrResponse } from '#/types/api';
import { useToast } from '#/context/ToastContext';
import { formatBytes, isImageFile } from '#/utils/file';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from '#/components/ui/Dialog';

const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/gif'];

// ─── Enhancement presets ────────────────────────────────────────

interface Enhancements {
  toggles: Record<string, boolean>;
  sliders: Record<string, number | null>;
}

const defaultEnhancements: Enhancements = {
  toggles: { autoContrast: false, sharpen: false, denoise: false, normBg: false, saturate: false, blurRemoval: false },
  sliders: { brightness: null, contrast: null, gamma: null, edgeEnhance: null },
};

const toggleDefs = [
  { key: 'autoContrast', label: 'Auto Contrast', icon: Sun, desc: 'Adjust brightness/contrast' },
  { key: 'sharpen', label: 'Sharpen', icon: ZoomIn, desc: 'Enhance edge clarity' },
  { key: 'denoise', label: 'Denoise', icon: Wand2, desc: 'Reduce image noise' },
  { key: 'normBg', label: 'Normalize BG', icon: Layers, desc: 'Uniform background' },
  { key: 'saturate', label: 'Saturation', icon: Eye, desc: 'Boost color intensity' },
  { key: 'blurRemoval', label: 'Deblur', icon: RotateCw, desc: 'Reduce motion blur' },
];

const sliderDefs = [
  { key: 'brightness', label: 'Brightness', min: -100, max: 100, step: 5, unit: '' },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100, step: 5, unit: '' },
  { key: 'gamma', label: 'Gamma', min: 20, max: 200, step: 10, unit: '' },
  { key: 'edgeEnhance', label: 'Edge Enhance', min: 0, max: 100, step: 5, unit: '' },
];

// ─── Per-file result type ───────────────────────────────────────

interface FileResult {
  file: File;
  preview: string;
  ocrResult: OcrResult | null;
  status: 'pending' | 'processing' | 'done' | 'error';
  errorMsg?: string;
}

// ─── CSS filter computation for realtime preview ────────────────

function computeCssFilters(e: Enhancements): string {
  const parts: string[] = [];
  if (e.sliders.brightness != null) parts.push(`brightness(${1 + e.sliders.brightness / 100})`);
  if (e.sliders.contrast != null) parts.push(`contrast(${1 + e.sliders.contrast / 100})`);
  if (e.toggles.saturate) parts.push('saturate(1.5)');
  if (e.sliders.gamma != null) parts.push(`gamma(${e.sliders.gamma / 100})`); // CSS doesn't have gamma, approximate with brightness curve
  if (e.toggles.sharpen) parts.push('contrast(1.1)'); // Approximation
  return parts.length ? parts.join(' ') : 'none';
}

function computeEnhanceOptions(e: Enhancements): NonNullable<Parameters<typeof ocrEnhanced>[1]> | undefined {
  const opts: Record<string, any> = {};
  if (e.toggles.autoContrast) opts.auto_contrast = true;
  if (e.toggles.sharpen) opts.sharpen = true;
  if (e.toggles.denoise) opts.denoise = true;
  if (e.toggles.normBg) opts.normalize_background = true;
  if (e.sliders.brightness != null) opts.brightness = e.sliders.brightness;
  if (e.sliders.contrast != null) opts.contrast = e.sliders.contrast;
  return Object.keys(opts).length > 0 ? opts as NonNullable<Parameters<typeof ocrEnhanced>[1]> : undefined;
}

// ─── Animated processing overlay component ──────────────────────

function ProcessingOverlay({ progress, filesCount, currentFile }: { progress: number; filesCount: number; currentFile: number }) {
  const circumference = 2 * Math.PI * 54; // r=54
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const particles = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => ({
      id: i,
      left: `${10 + (i * 73) % 80}%`,
      top: `${60 + (i * 37) % 30}%`,
      duration: `${2.5 + (i % 4) * 0.5}s`,
      delay: `${(i * 0.3) % 3}s`,
    })), []);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-violet-500/10 bg-gradient-to-br from-violet-500/[0.06] via-transparent to-purple-500/[0.04]">
      {/* Floating particles */}
      <div className="particles-container">
        {particles.map(p => (
          <div key={p.id} className="particle" style={{ '--left-pos': p.left, '--top-pos': p.top, '--drift-duration': p.duration, '--drift-delay': p.delay } as React.CSSProperties} />
        ))}
      </div>

      {/* Content */}
      <div className="relative flex flex-col items-center justify-center py-10 gap-5">
        {/* SVG Processing Ring */}
        <div className="processing-ring relative" style={{ width: 120, height: 120 }}>
          {/* Background track */}
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(139,92,246,0.1)" strokeWidth="4" />
          </svg>
          {/* Animated gradient stroke */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 120 120">
            <defs>
              <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#8b5cf6" />
                <stop offset="50%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>
            <circle
              cx="60" cy="60" r="54" fill="none" stroke="url(#ringGrad)" strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-[stroke-dashoffset] duration-300 ease-out"
            />
          </svg>
          {/* Center content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {progress > 0 ? (
              <>
                <span className="text-xl font-bold text-white">{Math.round(progress)}%</span>
                {filesCount > 1 && (
                  <span className="text-[10px] text-slate-400 mt-0.5">image {currentFile + 1}/{filesCount}</span>
                )}
              </>
            ) : (
              <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
            )}
          </div>
        </div>

        {/* Status text */}
        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-slate-200">
            {filesCount > 1 ? `Processing image ${currentFile + 1} of ${filesCount}` : 'Processing image…'}
          </p>
          <p className="text-xs text-slate-500 animate-pulse">Analyzing text regions and extracting content</p>
        </div>

        {/* Progress bar (below ring) */}
        {progress > 0 && (
          <div className="w-full max-w-xs h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 via-blue-500 to-emerald-500 transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main OcrPage component ─────────────────────────────────────

interface OcrPageProps {
  onResult?: (result: OcrResult) => void;
}

export function OcrPage({ onResult }: OcrPageProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [results, setResults] = useState<OcrResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [enhanceOpen, setEnhanceOpen] = useState(false);
  const [slidersOpen, setSlidersOpen] = useState(false);
  const [enhancements, setEnhancements] = useState<Enhancements>(defaultEnhancements);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [activeResultTab, setActiveResultTab] = useState(0);
  const [previewFilter, setPreviewFilter] = useState('none');

  // Horizontal card / modal state
  const [expandedCardIdx, setExpandedCardIdx] = useState<number | null>(null);

  const { addToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const activeEnhanceOptions = computeEnhanceOptions(enhancements);
  const hasActiveToggles = toggleDefs.some(t => enhancements.toggles[t.key]);
  const hasActiveSliders = sliderDefs.some(s => enhancements.sliders[s.key] != null);

  /* ── Paste handling ─────────────────────────────── */

  const blobToFile = (blob: Blob): File | null => {
    const type = blob.type;
    if (!type.startsWith('image/')) return null;
    const ext = type.split('/')[1] ?? 'png';
    return new File([blob], `pasted-image-${Date.now()}.${ext}`, { type });
  };

  const addFile = useCallback((f: File) => {
    if (!IMAGE_MIME.includes(f.type) && !isImageFile(f)) {
      addToast('Unsupported file type. Use JPG, PNG, WebP, BMP or GIF.', 'error');
      return false;
    }
    setFiles(prev => {
      if (prev.find(p => p.name === f.name && p.size === f.size)) return prev; // dedup
      return [...prev, f];
    });
    const reader = new FileReader();
    reader.onload = () => setPreviews(prev => [...prev, reader.result as string]);
    reader.readAsDataURL(f);
    return true;
  }, [addToast]);

  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      for (const item of e.clipboardData.items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob && addFile(blob)) addToast('Image pasted from clipboard.', 'success');
          return;
        }
      }
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [addFile, addToast]);

  const onZonePaste = useCallback((e: React.ClipboardEvent) => {
    if (!e.clipboardData) return;
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (blob && addFile(blob)) addToast('Image pasted.', 'success');
        return;
      }
    }
  }, [addFile, addToast]);

  /* ── File handling ──────────────────────────────── */

  const handleFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    Array.from(fileList).forEach(f => addFile(f));
  }, [addFile]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  /* ── Remove file from selection ─────────────────── */

  const removeFile = useCallback((idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
    setPreviews(prev => prev.filter((_, i) => i !== idx));
  }, []);

  /* ── OCR processing ─────────────────────────────── */

  const runOcr = useCallback(async () => {
    if (files.length === 0) return;
    setLoading(true);
    setProgress(0);
    setCurrentFileIndex(0);
    setActiveResultTab(0);
    setResults([]);
    setInsightsOpen(false);

    try {
      let finalResults: OcrResult[] = [];

      if (files.length > 1) {
        // Multi-image processing
        const useEnhance = hasActiveToggles || hasActiveSliders;

        if (!useEnhance && files.length >= 2) {
          // Use batch endpoint for efficiency
          try {
            const batchResponse: BatchOcrResponse = await ocrBatch(files, undefined, (pct) => setProgress(pct));
            finalResults = batchResponse.results;
            setResults(finalResults);
            addToast(`OCR complete — ${batchResponse.completed} of ${batchResponse.total_files} images processed.`, 'success');
          } catch (err: any) {
            // Fallback: process individually
            for (let i = 0; i < files.length; i++) {
              setCurrentFileIndex(i);
              const result = await ocrSingle(files[i], undefined, (pct) => setProgress(pct));
              finalResults.push(result);
              setResults([...finalResults]);
            }
          }
        } else {
          // Process each with enhancements individually
          for (let i = 0; i < files.length; i++) {
            setCurrentFileIndex(i);
            const fileProgress = (i / files.length) * 100;
            setProgress(fileProgress);

            const result = await ocrEnhanced(files[i], activeEnhanceOptions, (pct) =>
              setProgress(fileProgress + (pct / files.length))
            );
            finalResults.push(result);
            setResults([...finalResults]);
          }
        }
      } else {
        // Single image
        const useEnhance = hasActiveToggles || hasActiveSliders;

        if (useEnhance) {
          const data = await ocrEnhanced(files[0], activeEnhanceOptions, setProgress);
          finalResults = [data];
        } else {
          const data = await ocrSingle(files[0], undefined, setProgress);
          finalResults = [data];
        }
      }

      // Callback for parent
      if (finalResults.length === 1 && finalResults[0]) {
        onResult?.(finalResults[0]);
      } else if (finalResults.length > 0) {
        onResult?.(finalResults[0]); // callback with first result
      }

      const successCount = finalResults.filter(r => r.status === 'success').length;
      addToast(`${successCount}/${files.length} image${files.length > 1 ? 's' : ''} processed successfully.`, 'success');

      // Ensure results are always set before showing (catch-all for single-image case)
      setResults(finalResults);

    } catch (err: any) {
      addToast(err?.message || 'OCR failed.', 'error');
      // Set results with error via cast since errorMsg isn't on OcrResult
      setResults(files.map(f => ({ task_id: '', filename: f.name, file_type: f.type, status: 'error' as const, detected_lines: 0, full_text: '', lines: [], confidence_stats: { mean: 0, min: 0, max: 0, median: 0 }, processing_time_ms: 0, message: err?.message })));
    } finally {
      setLoading(false);
      setCurrentFileIndex(0);
    }
  }, [files, hasActiveToggles, hasActiveSliders, activeEnhanceOptions, addToast, onResult]);

  /* ── Export helpers ─────────────────────────────── */

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    addToast('Text copied to clipboard.', 'info');
  };

  const downloadTxt = (result: OcrResult) => {
    const blob = new Blob([result.full_text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${result.filename ?? 'ocr'}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const confidenceColor = (c: number) => c >= 0.7 ? 'text-emerald-400' : c >= 0.4 ? 'text-amber-400' : 'text-red-400';
  const confidenceBg = (c: number) => c >= 0.7 ? 'bg-emerald-500/20 text-emerald-400' : c >= 0.4 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400';

  const statsBars = (stats: ConfidenceStats) => [
    { label: 'Mean', value: stats.mean, color: 'from-violet-500 to-purple-500' },
    { label: 'Median', value: stats.median, color: 'from-blue-500 to-cyan-500' },
    { label: 'Min', value: stats.min, color: 'from-red-400 to-rose-500' },
    { label: 'Max', value: stats.max, color: 'from-emerald-400 to-green-500' },
  ];

  /* ── Enhancement helpers ────────────────────────── */

  const toggleEnhance = (key: string) => setEnhancements(prev => ({
    ...prev, toggles: { ...prev.toggles, [key]: !prev.toggles[key] }
  }));

  const setSliderValue = (key: string, value: number | null) => setEnhancements(prev => ({
    ...prev, sliders: { ...prev.sliders, [key]: value }
  }));

  const resetEnhancements = () => setEnhancements(defaultEnhancements);

  const activeCount = toggleDefs.filter(t => enhancements.toggles[t.key]).length +
    sliderDefs.filter(s => enhancements.sliders[s.key] != null).length;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-8">

      {/* ── Hero Section ─────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-violet-500/10 bg-gradient-to-br from-violet-500/[0.07] via-transparent to-purple-500/[0.04]">
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="relative px-6 py-8 sm:px-10 sm:py-12 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-500/20 bg-violet-500/10 text-violet-400 text-xs font-medium mb-4 animate-fade-in">
            <Sparkles className="h-3 w-3" /> AI-Powered Urdu OCR
          </div>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-2">
            Extract Urdu Text from <span className="gradient-text">Images</span>
          </h2>
          <p className="text-sm max-w-md mx-auto text-slate-400">
            Upload one or more images with Urdu text and get instant, accurate text extraction powered by advanced OCR models.
          </p>
          <p className="text-xs mt-2 text-slate-500">
            Tip: You can also <span className="inline-flex items-center gap-1"><ClipboardPaste className="h-3 w-3"/> paste an image directly (Ctrl+V)</span>
          </p>
        </div>
      </div>

      {/* ── Upload Zone ──────────────────────────── */}
      <div className="glass-card rounded-2xl p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-slate-300" />
            <h3 className="font-semibold text-white">Upload Images</h3>
            {files.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 font-medium">
                {files.length} file{files.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          {files.length > 0 && (
            <button onClick={() => { setFiles([]); setPreviews([]); }} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-400 transition-colors cursor-pointer">
              <Trash2 className="h-3.5 w-3.5" /> Clear All
            </button>
          )}
        </div>

        {/* Drop zone */}
        <div
          className={`relative border-2 border-dashed rounded-xl p-6 sm:p-10 text-center transition-all duration-300 cursor-pointer ${
            files.length > 0
              ? 'border-violet-500/40 bg-violet-500/[0.03]'
              : 'border-slate-700/60 hover:border-violet-500/30 hover:bg-white/[0.02]'
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
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          {files.length > 0 ? (
            <div className="space-y-4">
              {/* Thumbnail grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-h-80 overflow-y-auto p-2">
                {previews.map((preview, idx) => (
                  <div key={idx} className="thumb-card relative group rounded-xl overflow-hidden border border-slate-700/50 bg-white/[0.02]">
                    <img src={preview} alt={`Preview ${idx + 1}`} className="w-full h-32 object-cover" style={{ filter: previewFilter }} />
                    {/* Remove button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    {/* File info overlay */}
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                      <p className="text-[10px] text-white truncate">{files[idx]?.name}</p>
                      <p className="text-[9px] text-slate-300">{formatBytes(files[idx]?.size ?? 0)}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Active files summary */}
              <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                <span className="text-slate-400">
                  Total: {formatBytes(files.reduce((sum, f) => sum + (f?.size ?? 0), 0))}
                </span>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-medium">{files.length} image{files.length > 1 ? 's' : ''} ready</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center bg-white/5">
                <Upload className="h-8 w-8 text-slate-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-300">Drag & drop images or click to select</p>
                <p className="text-xs mt-1 text-slate-500">Supports JPG, PNG, WebP, BMP, GIF · Max 20MB each · Multiple files allowed</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Enhancement Options ─────────────────── */}
        <div className="mt-4">
          <button
            onClick={() => setEnhanceOpen(!enhanceOpen)}
            className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Enhancement Options
            {activeCount > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 font-medium">{activeCount} active</span>
            )}
            {enhanceOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {enhanceOpen && (
            <div className="mt-3 space-y-4 animate-fade-in">
              {/* Toggle row */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-slate-700/30">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-slate-500 uppercase tracking-wider font-medium">Quick Toggles</span>
                  {(hasActiveToggles || hasActiveSliders) && (
                    <button onClick={resetEnhancements} className="text-xs text-violet-400 hover:text-violet-300 transition-colors cursor-pointer">Reset All</button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {toggleDefs.map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      onClick={() => toggleEnhance(key)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        enhancements.toggles[key]
                          ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                          : 'bg-white/[0.03] text-slate-400 border border-slate-700/30 hover:bg-white/[0.06] hover:text-slate-300'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sliders (expandable) */}
              {slidersOpen && (
                <div className="p-4 rounded-xl bg-white/[0.02] border border-slate-700/30 animate-fade-in">
                  <span className="text-xs text-slate-500 uppercase tracking-wider font-medium block mb-3">Fine Tuning</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {sliderDefs.map(({ key, label, min, max, step }) => {
                      const val = enhancements.sliders[key];
                      return (
                        <div key={key} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs text-slate-400">{label}</label>
                            <span className={`text-xs font-mono ${val != null ? 'text-violet-400' : 'text-slate-600'}`}>
                              {val != null ? (val > 0 ? `+${val}` : val) : 'Off'}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={min} max={max} step={step}
                            value={val ?? (min + max) / 2}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setSliderValue(key, v >= min && v <= max ? v : null);
                              if (v >= min && v <= max) setPreviewFilter(computeCssFilters({ ...enhancements, sliders: { ...enhancements.sliders, [key]: v } }));
                            }}
                            className="enhancement-slider"
                          />
                          <div className="flex justify-between text-[9px] text-slate-600">
                            <span>{min}</span><span>{max}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Preview filter toggle */}
              {previews.length > 0 && (hasActiveToggles || hasActiveSliders) && (
                <div className="flex items-center gap-2 text-xs">
                  <Eye className="h-3.5 w-3.5 text-slate-500" />
                  <span className="text-slate-400">Live preview:</span>
                  {previewFilter !== 'none' ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">On</span>
                  ) : (
                    <button onClick={() => setPreviewFilter(computeCssFilters(enhancements))} className="px-2 py-0.5 rounded bg-slate-700 text-slate-400 cursor-pointer hover:bg-slate-600 hover:text-white transition-colors">Apply</button>
                  )}
                  {previewFilter !== 'none' && (
                    <button onClick={() => setPreviewFilter('none')} className="text-violet-400 hover:text-violet-300 cursor-pointer">Reset</button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Action buttons ─────────────────────── */}
        <div className="mt-5 flex items-center gap-3 flex-wrap">
          <button
            onClick={runOcr}
            disabled={files.length === 0 || loading}
            className={`relative inline-flex items-center justify-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold transition-all duration-300 ${
              files.length > 0 && !loading
                ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:scale-[1.02] active:scale-[0.98]'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            } disabled:cursor-not-allowed`}
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
            ) : (
              <><Sparkles className="h-4 w-4" /> Extract Text{files.length > 1 ? ` (${files.length})` : ''}</>
            )}
          </button>

          {progress > 0 && progress < 100 && (
            <div className="flex-1 max-w-[200px]">
              <div className="h-2 rounded-full overflow-hidden bg-slate-800/50">
                <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* Toggle sliders button */}
          {enhanceOpen && (
            <button
              onClick={() => setSlidersOpen(!slidersOpen)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                slidersOpen ? 'bg-violet-500/15 text-violet-400 border border-violet-500/20' : 'bg-white/[0.03] text-slate-400 hover:text-slate-300 border border-slate-700/30'
              }`}
            >
              <Minus className="h-3 w-3" /> Fine Tuning
            </button>
          )}
        </div>
      </div>

      {/* ── Loading / Processing State ─────────── */}
      {loading && (
        <ProcessingOverlay progress={progress} filesCount={files.length} currentFile={currentFileIndex} />
      )}

      {/* ── Results Section ──────────────────────── */}
      {results.length > 0 && !loading && (
        <div className="space-y-6 animate-fade-in">

          {/* Status bar for active tab */}
          {results[activeResultTab]?.status === 'success' && (
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-xl bg-white/[0.03] border border-slate-700/30 animate-card-float stagger-1">
              <span className="text-xs text-slate-500">{results[activeResultTab]?.task_id}</span>
              <span className="w-1 h-1 rounded-full bg-slate-700" />
              <span className="text-xs text-slate-400">{results[activeResultTab]?.detected_lines} lines</span>
              <span className="w-1 h-1 rounded-full bg-slate-700" />
              <span className="text-xs font-medium text-slate-300">{Math.round(results[activeResultTab]?.processing_time_ms ?? 0)}ms</span>
            </div>
          )}

          {/* ── Result Cards (Vertical Grid) ─────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 animate-card-float stagger-2">
            {results.map((result, idx) => {
              const isSuccess = result.status === 'success';
              const isExpanded = expandedCardIdx === idx;
              // Short preview text (first ~120 chars)
              const previewText = (result.full_text || '').slice(0, 120);
              const linesCount = (result as any)?.lines?.length ?? 0;
              const meanConf = result.confidence_stats?.mean ?? 0;

              return (
                <div key={idx} className={`rounded-xl bg-white/[0.02] border transition-all duration-200 ${
                  activeResultTab === idx ? 'border-violet-500/30' : 'border-slate-700/50'
                }`}>
                  {/* Card header: image thumbnail + status */}
                  <div className="flex items-start gap-3 p-4 pb-2">
                    {/* Thumbnail image — clickable to expand */}
                    <button
                      onClick={() => setExpandedCardIdx(isExpanded ? null : idx)}
                      className="relative shrink-0 w-[64px] h-[64px] rounded-lg overflow-hidden border border-slate-700/50 bg-black/20 hover:border-violet-500/50 transition-colors group cursor-pointer"
                    >
                      {/* Use annotated image if available, otherwise preview */}
                      {(result as any).annotated_image_b64 ? (
                        <img
                          src={`data:image/png;base64,${(result as any).annotated_image_b64}`}
                          alt="Thumbnail"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          style={{ imageRendering: 'auto' }}
                        />
                      ) : previews[idx] ? (
                        <img
                          src={previews[idx]}
                          alt="Thumbnail"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      ) : null}
                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Maximize2 className="h-4 w-4 text-white" />
                      </div>
                    </button>

                    {/* File info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        {isSuccess ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                        )}
                        <p className="text-xs font-medium text-white truncate">{result.filename ?? `Page ${idx + 1}`}</p>
                      </div>

                      {/* Confidence */}
                      {isSuccess && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold ${confidenceBg(meanConf)}`}>
                          {Math.round(meanConf * 100)}% confidence
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Text preview */}
                  <div className="px-4 space-y-2 pb-3">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase tracking-wider font-medium">
                      <Type className="h-3 w-3" />
                      Text Preview
                    </div>
                    <div className="rounded-lg p-4 bg-white/[0.02] border border-slate-700/40">
                      {isSuccess ? (
                        <p className="rtl urdu-font text-right leading-relaxed text-sm text-slate-300" dir="rtl" style={{lineHeight:'2.2'}}>
                          <span className="line-clamp-[5]">{previewText || (
                            <span className="text-slate-600 italic">No text detected.</span>
                          )}</span>
                          {(result.full_text || '').length > 120 && (
                            <span className="text-slate-500 ml-1">...</span>
                          )}
                        </p>
                      ) : (
                        <p className="text-xs text-red-400">
                          {(result as any)?.message || 'Processing failed.'}
                        </p>
                      )}
                    </div>

                    {/* Meta */}
                    <div className="flex items-center gap-3 text-[10px] text-slate-500 pt-1 px-4 pb-2">
                      {isSuccess && (
                        <>
                          <span>{linesCount} lines</span>
                          <span>·</span>
                          <span>{Math.round(result.processing_time_ms ?? 0)}ms</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expand button — narrower, centered */}
                  {isSuccess && (
                    <div className="flex justify-center px-4 pb-3">
                      <button
                        onClick={() => setExpandedCardIdx(isExpanded ? null : idx)}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-white/[0.03] hover:bg-violet-500/15 hover:text-violet-400 text-slate-500 border border-slate-700/30 transition-all cursor-pointer"
                      >
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        {isExpanded ? 'Collapse' : 'Expand'} Details
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Expanded Modal for Active Tab ───── */}
          {expandedCardIdx !== null && results[expandedCardIdx] && (
            <Dialog open={expandedCardIdx !== null} onOpenChange={(open) => !open && setExpandedCardIdx(null)}>
              <DialogContent size="xl" className="max-w-4xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {results[expandedCardIdx]?.status === 'success' ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-red-400" />
                    )}
                    {results[expandedCardIdx]?.filename ?? `Page ${expandedCardIdx + 1}`}
                  </DialogTitle>
                </DialogHeader>

                <DialogBody className="max-h-[70vh]">
                  {results[expandedCardIdx]?.status === 'success' ? (
                    <div className="space-y-6">
                      {/* Image + Text side by side */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Full annotated image */}
                        {(results[expandedCardIdx] as any).annotated_image_b64 && (
                          <div>
                            <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-1.5">
                              <ImageIcon className="h-4 w-4" />
                              Detected Lines
                            </h4>
                            <div className="rounded-xl overflow-hidden border border-slate-700/50 bg-slate-800/40">
                              <img
                                src={`data:image/png;base64,${(results[expandedCardIdx] as any).annotated_image_b64}`}
                                alt="Annotated"
                                className="w-full object-contain max-h-[400px]"
                              />
                            </div>
                          </div>
                        )}

                        {/* Extracted text */}
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-semibold text-white flex items-center gap-1.5">
                              <Type className="h-4 w-4" />
                              Extracted Text
                            </h4>
                            <button
                              onClick={() => copyToClipboard(results[expandedCardIdx]?.full_text ?? '')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-300 transition-all cursor-pointer"
                            >
                              <Copy className="h-3 w-3" />
                              Copy
                            </button>
                          </div>
                          <div className="rounded-xl px-4 py-3 border leading-loose bg-slate-800/50 border-slate-700/60 max-h-[300px] overflow-y-auto">
                            <p className="rtl urdu-font text-right leading-relaxed text-base" dir="rtl" style={{lineHeight:'2.4', color:'#e2e8f0'}}>
                              {results[expandedCardIdx]?.full_text || (
                                <span className="text-slate-600 italic">No text detected.</span>
                              )}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Per-line results */}
                      {(results[expandedCardIdx] as any)?.lines?.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-white mb-3">
                            Per-Line Results{' '}
                            <span className="font-normal text-sm text-slate-500">
                              ({(results[expandedCardIdx] as any).lines.length})
                            </span>
                          </h4>
                          <div className="rounded-xl border border-slate-700/40 max-h-[300px] overflow-y-auto">
                            <table className="w-full text-sm">
                              <thead className="sticky top-0 z-10">
                                <tr className="bg-white/[0.03]">
                                  <th className="py-2 px-4 text-left text-xs font-medium uppercase tracking-wider text-slate-400">#</th>
                                  <th className="py-2 px-4 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Text (Urdu)</th>
                                  <th className="py-2 px-4 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Confidence</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(results[expandedCardIdx] as any).lines.map((line: OcrLine, i: number) => (
                                  <tr key={i} className="border-t border-slate-800/50 hover:bg-white/[0.02] transition-colors">
                                    <td className="py-2 px-4 font-mono text-xs text-slate-500">{i + 1}</td>
                                    <td className="py-2 px-4 rtl urdu-font text-right" dir="rtl"><span className="text-slate-200" style={{lineHeight:'2'}}>{line.text}</span></td>
                                    <td className="py-2 px-4">
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
                      )}

                      {/* Confidence stats */}
                      <div>
                        <h4 className="text-sm font-semibold text-white mb-3">Confidence Statistics</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {statsBars(results[expandedCardIdx]?.confidence_stats ?? { mean: 0, min: 0, max: 0, median: 0 }).map(({ label, value, color }) => (
                            <div key={label} className="rounded-xl px-3 py-2.5 bg-white/[0.02] border border-slate-700/40">
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-slate-400">{label}</span>
                                <span className={`font-semibold ${confidenceColor(value)}`}>{Math.round(value * 100)}%</span>
                              </div>
                              <div className="h-1.5 rounded-full overflow-hidden bg-slate-800/80">
                                <div className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700`} style={{ width: `${Math.round(value * 100)}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-red-400" />
                      <h3 className="font-semibold text-red-400 mb-1">Processing Failed</h3>
                      <p className="text-sm text-slate-400">{(results[expandedCardIdx] as any)?.message || 'An unexpected error occurred.'}</p>
                    </div>
                  )}
                </DialogBody>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}

      {/* ── Empty state ──────────────────────────── */}
      {!results.length && !loading && files.length > 0 && (
        <div className="text-center py-12 rounded-2xl border border-dashed border-slate-800 bg-white/[0.01] animate-fade-in">
          <Sparkles className="h-8 w-8 mx-auto mb-3 text-slate-600" />
          <p className="text-sm text-slate-400">Click "Extract Text" to process your image{files.length > 1 ? 's' : ''}.</p>
        </div>
      )}

      {/* ── Initial empty state ──────────────────── */}
      {!results.length && !loading && files.length === 0 && (
        <div className="text-center py-16 rounded-2xl border border-dashed border-slate-800 bg-white/[0.01]">
          <div className="w-20 h-20 rounded-2xl mx-auto flex items-center justify-center bg-white/5 mb-4">
            <ImageIcon className="h-10 w-10 text-slate-600" />
          </div>
          <p className="text-sm text-slate-500 mb-1">No images uploaded yet</p>
          <p className="text-xs text-slate-600">Upload or paste an image to get started</p>
        </div>
      )}
    </div>
  );
}

/* ── AI Insights Sub-component ─────────────────────────────── */

function AiInsightsPanel({ result }: { result: OcrResult }) {
  const ai = (result as any).ai_analysis as DocumentAnalysis | undefined;
  const summary = (result as any).summary as SummaryResult | undefined;
  const tableDet = (result as any).table_detection as TableDetection | undefined;

  if (!ai) return null;

  const langCodeToLabel: Record<string, string> = {
    ur: 'Urdu', ar: 'Arabic', en: 'English', fa: 'Persian', mixed: 'Mixed', unknown: 'Unknown',
  };

  const docTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    receipt: Hash,
    letter: BookOpen,
    book_page: BookOpen,
    form: Info,
    handwritten: Mic,
    table_document: FileImage,
    unknown: Info,
  };

  return (
    <div className="glass-card rounded-2xl p-6 space-y-5 animate-card-float">
      <div className="flex items-center gap-2 mb-1">
        <Brain className="h-5 w-5 text-violet-400" />
        <h3 className="text-lg font-semibold text-white">AI Document Insights</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <InsightCard title="Detected Language" iconColor="text-violet-400" bgColor="bg-violet-500/10">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-400 font-semibold text-sm">
            {langCodeToLabel[ai.language.primary] || ai.language.primary}
            <span className="text-xs opacity-70">({Math.round(ai.language.confidence * 100)}%)</span>
          </span>
          {ai.language.languages.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {ai.language.languages.slice(1).map(l => (
                <span key={l.code} className="text-xs px-2 py-0.5 rounded bg-slate-700/50 text-slate-400">
                  {l.label} ({Math.round(l.proportion * 100)}%)
                </span>
              ))}
            </div>
          )}
        </InsightCard>

        <InsightCard title="Document Type" iconColor="text-emerald-400" bgColor="bg-emerald-500/10">
          {(() => {
            const Icon = docTypeIcons[ai.document_type.primary] || Info;
            return (
              <>
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 font-semibold text-sm">
                  <Icon className="h-4 w-4" />
                  {ai.document_type.primary.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                  <span className="text-xs opacity-70">({Math.round(ai.document_type.confidence * 100)}%)</span>
                </span>
              </>
            );
          })()}
        </InsightCard>
      </div>

      {ai.content && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatPill label="Words" value={ai.content.word_count.toLocaleString()} />
          <StatPill label="Sentences" value={ai.content.sentence_count.toLocaleString()} />
          <StatPill label="Avg Word Length" value={`${ai.content.avg_word_length} chars`} />
          <StatPill label="Uniqueness" value={`${Math.round(ai.content.uniqueness_ratio * 100)}%`} />
        </div>
      )}

      {summary && summary.summary && (
        <InsightCard title="AI Summary" iconColor="text-blue-400" bgColor="bg-blue-500/10">
          {summary.title && <p className="font-semibold text-sm text-white mb-1">{summary.title}</p>}
          <p className="text-sm leading-relaxed text-slate-300">{summary.summary}</p>
          {summary.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {summary.keywords.slice(0, 6).map((kw: any, i: number) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded font-medium bg-blue-500/10 text-blue-400">
                  {kw.word}
                </span>
              ))}
            </div>
          )}
        </InsightCard>
      )}

      {tableDet && tableDet.is_table && (
        <div className="rounded-xl p-4 border bg-amber-500/5 border-amber-500/20">
          <div className="flex items-center gap-2 mb-2">
            <FileImage className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold text-amber-400">Table Detected</span>
          </div>
          <p className="text-xs text-slate-400">Structure: {tableDet.tables[0]?.rows} rows × {tableDet.tables[0]?.cols} columns</p>
        </div>
      )}
    </div>
  );
}

function InsightCard({ title, iconColor, bgColor, children }: {
  title: string; iconColor?: string; bgColor?: string; children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl p-4 ${bgColor || 'bg-white/5'} border border-slate-700/40`}>
      <p className={`text-[10px] uppercase tracking-wider font-medium mb-2 ${iconColor || 'text-slate-400'}`}>{title}</p>
      {children}
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center p-3 rounded-xl bg-white/5">
      <p className="text-[10px] uppercase tracking-wider font-medium mb-1 text-slate-500">{label}</p>
      <p className="text-lg font-bold text-white tracking-tight">{value}</p>
    </div>
  );
}

/* ── Types ───────────────────────────────────── */

interface DocumentAnalysis {
  language: { primary: string; confidence: number; languages: Array<{ code: string; label: string; proportion: number }>; };
  document_type: { primary: string; confidence: number; scores: Record<string, number>; };
  content?: { word_count: number; sentence_count: number; avg_word_length: number; uniqueness_ratio: number; };
}

interface SummaryResult {
  summary: string; title: string; keywords: Array<{ word: string }>;
  confidence: number; method: string;
}

interface TableDetection {
  is_table: boolean;
  tables: Array<{ rows: number; cols: number; cells: string[][] }>;
}

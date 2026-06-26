/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2025 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import { Fragment } from 'react';
import {
  AlertTriangle,
  BookOpen,
  BookText,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Copy,
  Eraser,
  Eye,
  FileImage,
  Hash,
  Image as ImageIcon,
  Info,
  Layers,
  Loader2,
  Maximize2,
  Mic,
  Minus,
  RotateCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Type,
  Upload,
  Wand2,
  X,
  ZoomIn,
  Download,
} from 'lucide-react';
import {clearCache as ocrClearCache, ocrBatch, ocrEnhanced, ocrSingle} from '#/utils/api/ocr';
import {spellCheck} from '#/utils/api/spell';
import {Switch} from '#/components/ui/Switch';
import type {BatchOcrResponse, ConfidenceStats, OcrLine, OcrResult, SpellCorrection} from '#/types/api';
import {useToast} from '#/context/ToastContext';
import {useTheme} from '#/context/ThemeContext';
import {Badge} from '#/components/ui/Badge';
import {formatBytes, isImageFile} from '#/utils/file';
import {Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle} from '#/components/ui/Dialog';

const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/gif'];

// ─── Spell Check Settings ────────────────────────────────────────

interface SpellSettings {
  enabled: boolean;
  mode: 'char' | 'distance' | 'hybrid';
  maxDistance: number;
  useWordFreq: boolean;
}

const defaultSpellSettings: SpellSettings = {
  enabled: false,
  mode: 'hybrid',
  maxDistance: 2,
  useWordFreq: true,
};

const spellModes = [
  { value: 'char', label: 'Character Map' },
  { value: 'distance', label: 'Dictionary (Levenshtein)' },
  { value: 'hybrid', label: 'Hybrid (Best Quality)' },
] as const;

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
  const { theme } = useTheme();
  const isDark = theme === 'dark';
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

  // ─── Spell Check Settings State ─────────────────────────────
  const [spellOpen, setSpellOpen] = useState(false);
  const [spellSettings, setSpellSettings] = useState<SpellSettings>(defaultSpellSettings);
  const [spellCorrections, setSpellCorrections] = useState<readonly SpellCorrection[]>([]);
  const [spellPreviewText, setSpellPreviewText] = useState('');
  const [spellPreviewLoading, setSpellPreviewLoading] = useState(false);

  // ─── Preview corrections for OCR result lines ──────────────
  const [correctionHighlights, setCorrectionHighlights] = useState<Record<string, SpellCorrection[]>>({});

  // Horizontal card / modal state
  const [expandedCardIdx, setExpandedCardIdx] = useState<number | null>(null);

  // ─── Cache Control State ───────────────────────────────
  const [bypassCache, setBypassCache] = useState(false);
  const [cacheClearedKey, setCacheClearedKey] = useState(0); // bust stale cache entries

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
        const file = blobToFile(blob!);
        if (file && addFile(file)) addToast('Image pasted.', 'success');
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

  /* ── Preview spell correction ─────────────────────────── */

  const runSpellPreview = useCallback(async (text: string) => {
    if (!spellSettings.enabled || !text.trim()) return;
    setSpellPreviewLoading(true);
    try {
      const res = await spellCheck(text, spellSettings.mode);
      setSpellPreviewText(res.corrected);
      setSpellCorrections(res.words_corrected.filter(w => w.from !== w.to));
    } catch {
      // Silently fail
    } finally {
      setSpellPreviewLoading(false);
    }
  }, [spellSettings.enabled, spellSettings.mode]);

  /* ── Build correction highlights from current spell corrections ─────── */

  const buildCorrectionHighlights = useCallback((text: string, corrections: readonly SpellCorrection[]): Record<string, SpellCorrection[]> => {
    if (!corrections?.length || !text) return {};
    const map: Record<string, SpellCorrection[]> = {};
    corrections.forEach(c => {
      if (c.from === c.to) return;
      const idx = text.indexOf(c.from);
      if (idx !== -1) map[idx.toString()] = [c];
    });
    return map;
  }, []);

  /* ── Remove file from selection ─────────────────── */

  const removeFile = useCallback((idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
    setPreviews(prev => prev.filter((_, i) => i !== idx));
  }, []);

  /* ── Blob to File conversion ─────────────────── */

  /* ── OCR processing ─────────────────────────────── */

  // Build spell check params to pass through the API layer
  const spellApiParams = useMemo(() => {
    if (!spellSettings.enabled) return undefined;
    return {
      autocorrect: true,
      autocorrect_mode: spellSettings.mode,
      spell_check_max_distance: spellSettings.maxDistance,
      spell_check_use_word_freq: spellSettings.useWordFreq,
    };
  }, [spellSettings]);

  /* ── Cache clear handler ─────────────────────────── */

  const handleClearCache = useCallback(async () => {
    try {
      await ocrClearCache();
      setCacheClearedKey(prev => prev + 1);
      addToast('OCR cache cleared.', 'success');
    } catch (err: any) {
      addToast(err?.message || 'Failed to clear cache.', 'error');
    }
  }, [addToast]);

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
        const ocrParams = bypassCache ? { ...spellApiParams, use_cache: false } : spellApiParams;

        if (!useEnhance && files.length >= 2) {
          // Use batch endpoint for efficiency
          try {
            const batchResponse: BatchOcrResponse = await ocrBatch(files, ocrParams, (pct) => setProgress(pct));
            finalResults = batchResponse.results;
            setResults(finalResults);
            addToast(`OCR complete — ${batchResponse.completed} of ${batchResponse.total_files} images processed.`, 'success');
          } catch (err: any) {
            // Fallback: process individually
            for (let i = 0; i < files.length; i++) {
              setCurrentFileIndex(i);
              const result = await ocrSingle(files[i], ocrParams, (pct) => setProgress(pct));
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
          const ocrParams = bypassCache ? { ...spellApiParams, use_cache: false } : spellApiParams;
          const data = await ocrSingle(files[0], ocrParams ?? undefined, setProgress);
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
  }, [files, hasActiveToggles, hasActiveSliders, activeEnhanceOptions, spellApiParams, bypassCache, addToast, onResult]);

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

      {/* ── Upload Zone + Controls (single card) ───────── */}
      <div className="glass-card rounded-2xl p-6 animate-fade-in">
        {/* ── Drop zone ─────────────────────────── */}
        <div
          className={`relative border-2 border-dashed rounded-xl p-6 sm:p-10 text-center transition-all duration-300 cursor-pointer mb-5 ${
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

        {/* File count + clear button */}
        {files.length > 0 && (
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-slate-300" />
              <h3 className="font-semibold text-white">Upload Images</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 font-medium">
                {files.length} file{files.length > 1 ? 's' : ''}
              </span>
            </div>
            <button onClick={() => { setFiles([]); setPreviews([]); }} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-400 transition-colors cursor-pointer">
              <Trash2 className="h-3.5 w-3.5" /> Clear All
            </button>
          </div>
        )}

        {/* ── Controls Panel ─────────────────────── */}
        <div className="rounded-2xl border border-slate-700/40 bg-white/[0.01] overflow-hidden">
          {/* Top row: spell + enhancements (collapsible) */}
          <div className="border-b border-slate-700/40">
            {/* Spell Check section */}
            <button
              onClick={() => setSpellOpen(!spellOpen)}
              className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/[0.02] transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-slate-500" />
                Spell Check
              </span>
              {spellOpen ? <ChevronUp className="h-3.5 w-3.5 text-slate-500" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />}
            </button>
            {spellOpen && (
              <div className="px-5 pb-4 pt-1 animate-fade-in space-y-3">
                {<span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Mode</span>}
                <div className="flex flex-wrap gap-2">
                  {spellModes.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setSpellSettings(prev => ({ ...prev, mode: value }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                        spellSettings.mode === value
                          ? 'bg-violet-500/20 text-violet-400 border-violet-500/30'
                          : 'bg-white/[0.03] text-slate-400 border-slate-700/30 hover:bg-white/[0.06] hover:text-slate-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Enhancement Options section */}
          <div className="border-b border-slate-700/40">
            <button
              onClick={() => setEnhanceOpen(!enhanceOpen)}
              className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/[0.02] transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-slate-500" />
                Enhancement Options
                {activeCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-400 font-semibold">{activeCount} active</span>
                )}
              </span>
              {enhanceOpen ? <ChevronUp className="h-3.5 w-3.5 text-slate-500" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />}
            </button>

            {enhanceOpen && (
              <div className="px-5 pb-4 animate-fade-in space-y-4">
                {/* Quick Toggles */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Quick Toggles</span>
                    {(hasActiveToggles || hasActiveSliders) && (
                      <button onClick={resetEnhancements} className="text-[10px] text-violet-400 hover:text-violet-300 cursor-pointer">Reset All</button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {toggleDefs.map(({ key, label, icon: Icon }) => (
                      <button
                        key={key}
                        onClick={() => toggleEnhance(key)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all border ${
                          enhancements.toggles[key]
                            ? 'bg-violet-500/20 text-violet-400 border-violet-500/30'
                            : 'bg-white/[0.03] text-slate-400 border-transparent hover:bg-white/[0.06] hover:text-slate-300'
                        }`}
                      >
                        <Icon className="h-3 w-3" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fine Tuning */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Fine Tuning</span>
                    <button
                      onClick={() => setSlidersOpen(!slidersOpen)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer ${
                        slidersOpen ? 'bg-violet-500/15 text-violet-400' : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {slidersOpen ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronUp className="h-2.5 w-2.5" />}
                      {slidersOpen ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {slidersOpen && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-white/[0.02]">
                      {sliderDefs.map(({ key, label, min, max, step }) => {
                        const val = enhancements.sliders[key];
                        return (
                          <div key={key} className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-slate-400">{label}</span>
                              <span className={`text-[11px] font-mono ${val != null ? 'text-violet-400' : 'text-slate-600'}`}>
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
                              className="enhancement-slider w-full"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Live preview */}
                {previews.length > 0 && (hasActiveToggles || hasActiveSliders) && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <Eye className="h-3 w-3 text-slate-500" />
                    Live preview:
                    {previewFilter !== 'none' ? (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">On</span>
                    ) : (
                      <button onClick={() => setPreviewFilter(computeCssFilters(enhancements))} className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 cursor-pointer hover:bg-slate-600" disabled={loading}>Apply</button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom row: action buttons + cache */}
          <div className="px-5 py-4 flex items-center justify-between gap-4">
            {/* Left: primary action + bypass toggle */}
            <div className="flex items-center gap-3 flex-wrap">
              {<button
                onClick={runOcr}
                disabled={files.length === 0 || loading}
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold transition-all duration-300 ${
                  files.length > 0 && !loading
                    ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-500/15 hover:shadow-violet-500/25'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                } disabled:cursor-not-allowed`}
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
                ) : (
                  <><Sparkles className="h-4 w-4" /> Extract Text{files.length > 1 ? ` (${files.length})` : ''}</>
                )}
              </button>}

              {/* Spacer for progress bar */}
              {progress > 0 && progress < 100 && (
                <div className="flex-1 min-w-[120px] max-w-[200px]">
                  <div className="h-1.5 rounded-full overflow-hidden bg-slate-800/50">
                    <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}
            </div>

            {/* Right: utility controls */}
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {<Switch
                checked={bypassCache}
                onCheckedChange={setBypassCache}
                size="sm"
                color="primary"
                label={<span className="text-slate-400">Bypass cache</span>}
                containerClassName="gap-1.5"
              />}

              {results.length > 0 && results[activeResultTab] && ((results[activeResultTab] as any).ai_analysis || (results[activeResultTab] as any).summary) && (
                <button
                  onClick={() => setInsightsOpen(!insightsOpen)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    insightsOpen ? 'bg-violet-500/15 text-violet-400 border border-violet-500/20' : 'bg-white/[0.03] text-slate-400 hover:text-slate-300 border border-slate-700/30'
                  }`}
                >
                  <Brain className="h-3 w-3" /> AI Insights
                  {insightsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
              )}

              <button
                onClick={handleClearCache}
                disabled={loading}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  'bg-white/[0.03] text-slate-400 hover:text-red-400 border border-slate-700/30 hover:border-red-500/30 hover:bg-red-500/5'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <Eraser className="h-3 w-3" /> Clear Cache
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Loading / Processing State ─────────── */}
      {loading && (
        <ProcessingOverlay progress={progress} filesCount={files.length} currentFile={currentFileIndex} />
      )}

      {/* ── AI Insights Panel ───────────────────── */}
      {insightsOpen && results[activeResultTab] && ((results[activeResultTab] as any).ai_analysis || (results[activeResultTab] as any).summary) && (
        <AiInsightsPanel result={results[activeResultTab]} />
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
                <div key={idx} className={`rounded-xl border transition-all duration-200 ${
                  isDark
                    ? 'bg-white/[0.02] ' + (activeResultTab === idx ? 'border-violet-500/30' : 'border-slate-700/50')
                    : 'bg-white shadow-sm border-gray-200 ' + (activeResultTab === idx ? 'border-violet-500/30' : '')
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
                        <p className={`text-xs font-medium ${isDark ? 'text-white' : 'text-gray-900'} truncate`}>{result.filename ?? `Page ${idx + 1}`}</p>
                      </div>

                      {/* Confidence + corrections */}
                      {isSuccess && (
                        <span className="inline-flex items-center gap-1.5 flex-wrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold ${confidenceBg(meanConf)}`}>
                            {Math.round(meanConf * 100)}% confidence
                          </span>
                          {!!(result as any).corrections_count && (result as any).corrections_count > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                              <BookText className="h-3 w-3" />
                              {(result as any).corrections_count} correction{((result as any).corrections_count > 1 ? 's' : '')}
                            </span>
                          )}
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
                    <div className={`rounded-lg p-4 border ${
                      isDark ? 'bg-white/[0.02] border-slate-700/40' : 'bg-gray-50 border-gray-200'
                    }`}>
                      {isSuccess ? (
                        <p className={`rtl urdu-font text-right leading-relaxed text-sm ${
                          isDark ? 'text-slate-300' : 'text-gray-700'
                        }`} dir="rtl" style={{lineHeight:'2.2'}}>
                          <span className="line-clamp-[5]">{previewText || (
                            <span className={`${isDark ? 'text-slate-600' : 'text-gray-500'} italic`}>No text detected.</span>
                          )}</span>
                          {(result.full_text || '').length > 120 && (
                            <span className={`text-slate-500 ml-1`}>...</span>
                          )}
                        </p>
                      ) : (
                        <p className="text-xs text-red-400">
                          {(result as any)?.message || 'Processing failed.'}
                        </p>
                      )}
                    </div>

                    {/* Meta */}
                    <div className={`flex items-center gap-3 text-[10px] ${isDark ? 'text-slate-500' : 'text-gray-500'} pt-1 px-4 pb-2`}>
                      {isSuccess && (
                        <>
                          <span>{linesCount} lines</span>
                          <span>·</span>
                          <span>{Math.round(result.processing_time_ms ?? 0)}ms</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  {isSuccess && (
                    <div className="flex justify-center gap-2 px-4 pb-3">
                      <button
                        onClick={() => setExpandedCardIdx(isExpanded ? null : idx)}
                        className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium ${
                          isDark ? 'bg-white/[0.03] hover:bg-violet-500/15 hover:text-violet-400 text-slate-500 border border-slate-700/30' : 'bg-gray-100 hover:bg-violet-50 hover:text-violet-600 text-gray-700 border-gray-200'
                        } transition-all cursor-pointer`}
                      >
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        {isExpanded ? 'Collapse' : 'Expand'} Details
                      </button>
                      <button
                        onClick={() => downloadTxt(result)}
                        className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium ${
                          isDark ? 'bg-white/[0.03] hover:bg-blue-500/15 hover:text-blue-400 text-slate-500 border border-slate-700/30' : 'bg-gray-100 hover:bg-blue-50 hover:text-blue-600 text-gray-700 border-gray-200'
                        } transition-all cursor-pointer`}
                      >
                        <Download className="h-3 w-3" /> Download .txt
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
              <DialogContent size="xl" className="max-w-6xl">
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

                <DialogBody className="max-h-[85vh]">
                  {results[expandedCardIdx]?.status === 'success' ? (
                    <div className="space-y-6">
                      {/* Image + Text side by side */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Full annotated image */}
                        {(results[expandedCardIdx] as any).annotated_image_b64 && (
                          <div>
                            <h4 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'} mb-3 flex items-center gap-1.5`}>
                              <ImageIcon className="h-4 w-4" />
                              Detected Lines
                            </h4>
                            <div className={`rounded-xl overflow-hidden border ${isDark ? 'border-slate-700/50 bg-slate-800/40' : 'border-slate-300 bg-gray-100/80'}`}>
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
                            <h4 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'} flex items-center gap-1.5`}>
                              <Type className="h-4 w-4" />
                              Extracted Text
                            </h4>
                            <button
                              onClick={() => copyToClipboard(results[expandedCardIdx]?.full_text ?? '')}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium ${
                                isDark ? 'bg-white/5 hover:bg-white/10 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-slate-700'
                              } transition-all cursor-pointer`}
                            >
                              <Copy className="h-3 w-3" />
                              Copy
                            </button>
                          </div>
                          <div className={`rounded-xl px-4 py-3 border leading-loose ${
                            isDark ? 'bg-slate-800/50 border-slate-700/60' : 'bg-gray-100/80 border-slate-300'
                          } max-h-[400px] h-[400px] overflow-y-auto`}>
                            <p className="rtl urdu-font text-right leading-relaxed text-base" dir="rtl" style={{lineHeight:'2.4', color: isDark ? '#e2e8f0' : '#1e293b'}}>
                              {(() => {
                                const raw = results[expandedCardIdx]?.full_text || 'No text detected.';
                                if (!correctionHighlights || Object.keys(correctionHighlights).length === 0) return raw;
                                const segments = Object.entries(correctionHighlights).sort(([a], [b]) => Number(a) - Number(b));
                                let lastIdx = 0;
                                return raw.split('').map((ch, i) => {
                                  if (i >= lastIdx) {
                                    const match = segments.find(([posStr]) => i === Number(posStr));
                                    if (match) {
                                      const [pos, corrections] = match;
                                      const replacementSpan = corrections.map((c, j) => (
                                        <span key={`${pos}-${j}`} className="line-through text-red-400 bg-red-500/15 px-0.5 rounded cursor-help" title={c.reason || 'Spelling issue'}>
                                          {c.from}
                                        </span>
                                      ));
                                      lastIdx = Number(pos) + corrections[0].from.length;
                                      return <span key={i} className="inline-block">{replacementSpan}</span>;
                                    }
                                  }
                                  return <span key={i} className={`inline-block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{ch}</span>;
                                });
                              })()}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Per-line results */}
                      {(results[expandedCardIdx] as any)?.lines?.length > 0 && (
                        <div>
                          <h4 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'} mb-3`}>
                            Per-Line Results{' '}
                            <span className={`font-normal text-sm ${isDark ? 'text-slate-500' : 'text-slate-600'}`}>
                              ({(results[expandedCardIdx] as any).lines.length})
                            </span>
                          </h4>
                          <div className={`rounded-xl border ${isDark ? 'border-slate-700/40' : 'border-slate-300'} max-h-[300px] overflow-y-auto`}>
                            <table className="w-full text-sm border-collapse">
                              <thead className="sticky top-0 z-10">
                              <tr className={`${isDark ? 'bg-[#0f1320]/95 backdrop-blur-sm' : 'bg-gray-100/80'} ${isDark ? '' : 'backdrop-blur-sm'}`}>
                                <th className={`py-2 px-4 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-slate-400 border-b border-slate-700/40' : 'text-slate-600 border-b border-slate-300'}`}>#</th>
                                <th className={`py-2 px-4 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-slate-400 border-b border-slate-700/40' : 'text-slate-600 border-b border-slate-300'}`}>Text (Urdu)</th>
                                <th className={`py-2 px-4 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-slate-400 border-b border-slate-700/40' : 'text-slate-600 border-b border-slate-300'}`}>Confidence</th>
                              </tr>
                              </thead>
                              <tbody>
                              {(results[expandedCardIdx] as any).lines.map((line: OcrLine, i: number) => (
                                <tr key={i} className={`${isDark ? 'border-t border-slate-800/50 hover:bg-white/[0.02]' : 'border-t border-slate-200 hover:bg-gray-50'} transition-colors`}>
                                  <td className={`py-2 px-4 font-mono text-xs align-top ${isDark ? 'text-slate-500' : 'text-slate-600'}`}>{i + 1}</td>
                                  <td className="py-2 px-4 rtl urdu-font text-right whitespace-pre-wrap break-words max-w-prose" dir="rtl"><span className={`${isDark ? 'text-slate-200' : 'text-slate-900'} leading-[2]`}>{line.text}</span></td>
                                  <td className="py-2 px-4">
                                    <div className="flex items-center mt-2">
                                      <Badge variant={confidenceBg(line.confidence).includes('emerald') ? 'success' : confidenceBg(line.confidence).includes('amber') ? 'warning' : 'error'} label={`${Math.round(line.confidence * 100)}%`} />
                                    </div>
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
                        <h4 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'} mb-3`}>Confidence Statistics</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {statsBars(results[expandedCardIdx]?.confidence_stats ?? { mean: 0, min: 0, max: 0, median: 0 }).map(({ label, value, color }) => (
                            <div key={label} className={`rounded-xl px-3 py-2.5 ${
                              isDark ? 'bg-white/[0.02] border border-slate-700/40' : 'bg-gray-100/80 border border-slate-300'
                            }`}>
                              <div className="flex justify-between text-xs mb-1">
                                <span className={`${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{label}</span>
                                <span className={`font-semibold ${confidenceColor(value)}`}>{Math.round(value * 100)}%</span>
                              </div>
                              <div className={`h-1.5 rounded-full overflow-hidden ${
                                isDark ? 'bg-slate-800/80' : 'bg-gray-200'
                              }`}>
                                <div className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700`} style={{ width: `${Math.round(value * 100)}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Cache stats */}
                      {((results[expandedCardIdx] as any).cache_stats && ((results[expandedCardIdx] as any).cache_stats.hits > 0 || (results[expandedCardIdx] as any).cache_stats.misses > 0)) && (
                        <div>
                          <h4 className="text-sm font-semibold text-white mb-3">Cache Performance</h4>
                          <div className="grid grid-cols-3 gap-3">
                            {(() => {
                              const cs = (results[expandedCardIdx] as any).cache_stats;
                              return cs ? (
                                <>
                                  <div className="rounded-xl px-3 py-2.5 bg-emerald-500/5 border border-emerald-500/20">
                                    <div className="text-xs text-slate-400 mb-1">Hits</div>
                                    <div className="text-lg font-bold text-emerald-400">{cs.hits}</div>
                                  </div>
                                  <div className="rounded-xl px-3 py-2.5 bg-red-500/5 border border-red-500/20">
                                    <div className="text-xs text-slate-400 mb-1">Misses</div>
                                    <div className="text-lg font-bold text-red-400">{cs.misses}</div>
                                  </div>
                                  <div className="rounded-xl px-3 py-2.5 bg-blue-500/5 border border-blue-500/20">
                                    <div className="text-xs text-slate-400 mb-1">Cache Entries</div>
                                    <div className="text-lg font-bold text-blue-400">{cs.entries}</div>
                                  </div>
                                </>
                              ) : null;
                            })()}
                          </div>
                        </div>
                      )}
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

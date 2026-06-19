/**
 * Comprehensive TypeScript definitions for the Urdu OCR v2 API.
 * Covers all response shapes, request parameters, and real-time data structures.
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2026 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

// ─── OCR Types ────────────────────────────────────────────────────────

/** Per-line OCR detection result with confidence and bounding box. */
export interface OcrLine {
  text: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
}

/** Aggregate confidence statistics across all detected lines. */
export interface ConfidenceStats {
  mean: number;
  min: number;
  max: number;
  median: number;
}

/** Cache hit/miss metrics from the server. */
export interface CacheStats {
  hits: number;
  misses: number;
  entries: number;
}

/** Single image OCR result payload. */
export interface OcrResult {
  task_id: string;
  filename: string;
  file_type: string;
  status: 'success' | 'error';
  detected_lines: number;
  full_text: string;
  lines: OcrLine[];
  annotated_image_b64?: string;
  processing_time_ms: number;
  confidence_stats: ConfidenceStats;
  message?: string;
  cache_stats?: CacheStats | null;
}

/** Batch OCR response containing multiple file results. */
export interface BatchOcrResponse {
  task_id: string;
  total_files: number;
  completed: number;
  failed: number;
  processing_time_ms: number;
  cache_stats?: CacheStats | null;
  results: OcrResult[];
}

/** Parameters for the single-image OCR endpoint. */
export interface SingleOcrParams {
  conf_threshold?: number;
  img_size?: number;
  text_cleaning?: boolean | string;
  autocorrect?: boolean;
  autocorrect_mode?: 'char' | 'distance' | 'hybrid';
  spell_check_max_distance?: number;
  spell_check_use_word_freq?: boolean;
}

/** Advanced OCR options for PDF and image OCR endpoints. */
export interface PdfOcrOptions extends SingleOcrParams {
  use_cache?: boolean;
  device?: 'cpu' | 'cuda';
  det_type?: 'yolo' | 'detr' | 'mllm';
  det_conf?: number;
  mllm_model?: string;
  layout_analysis?: boolean;
  post_processing?: string;
  preprocess_options?: EnhanceOptions;
}

/** Urdu spell-check correction info returned by the API. */
export interface SpellCorrection {
  from: string;
  to: string;
  pos: number;
  reason?: string;
}

/** Response shape for the /spell/check endpoint. */
export interface SpellCheckResponse {
  original: string;
  corrected: string;
  corrections_applied: number;
  mode: 'char' | 'distance' | 'hybrid';
  characters_corrected: SpellCorrection[];
  words_corrected: SpellCorrection[];
}

/** Dictionary stats from /spell/info. */
export interface SpellInfoResponse {
  spell_checker: {
    enabled: boolean;
    mode: string;
    max_distance: number;
    use_word_freq: boolean;
  };
  dictionary: {
    words_count: number;
    bigrams_count: number;
    trigrams_count: number;
    total_unique_tokens: number;
  };
}

/** Parameters for batch OCR uploads. */
export interface BatchOcrParams extends SingleOcrParams {
  use_cache?: boolean;
}

/** Image enhancement preprocessing options. */
export interface EnhanceOptions {
  auto_contrast?: boolean;
  sharpen?: boolean;
  denoise?: boolean;
  normalize_background?: boolean;
  brightness?: number | null;
  contrast?: number | null;
}

// ─── PDF Types ────────────────────────────────────────────────────────

/** Metadata extracted from a PDF document. */
export interface PdfInfo {
  filename: string;
  total_pages: number;
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  producer?: string;
  creation_date?: string;
  modification_date?: string;
  page_size?: [number, number];
}

/** Single page extracted from a PDF. */
export interface PdfPageInfo {
  page_number: number;
  width: number;
  height: number;
  image_b64?: string;
  thumb_image_b64?: string;
}

/** Response from PDF page extraction endpoint. */
export interface PdfExtractResponse {
  filename: string;
  total_pages_extracted: number;
  dpi: number;
  thumb_width?: number;
  thumb_height?: number;
  pages: PdfPageInfo[];
  status: string;
  message: string;
}

/** OCR result for a single PDF page (mirrors OcrResult). */
export interface PdfOcrPageResult extends OcrResult {
  page_number: number;
}

/** Full PDF OCR response with per-page results. */
export interface PdfOcrResponse {
  task_id: string;
  filename: string;
  total_pages: number;
  total_text_lines: number;
  pages: PdfOcrPageResult[];
  status: string;
  message: string;
}

// ─── Export Types ──────────────────────────────────────────────────────

/** Supported export format identifiers. */
export type ExportFormat = 'json' | 'txt' | 'csv' | 'docx' | 'pdf';

/** Generic export response wrapper. */
export interface ExportResponse {
  format: ExportFormat;
  data: string;
}

/** Binary export responses (docx, searchable-pdf) return base64-encoded data. */
export interface BinaryExportResponse {
  format: 'docx' | 'pdf';
  data_b64: string;
}

// ─── System Types ──────────────────────────────────────────────────────

/** Health check response with device and model status. */
export interface HealthCheck {
  status: string;
  service: string;
  version: string;
  device: string;
  default_device: string;
  cuda_available: boolean;
  models_loaded: boolean;
  gpu_memory_used_gb: number;
  gpu_memory_total_gb: number;
}

/** Live usage statistics from the metrics engine. */
export interface LiveStats {
  uptime_seconds: number;
  total_requests: number;
  requests_per_second: number;
  ocr_requests_per_second: number;
  pdf_requests_per_second: number;
  export_requests_per_second: number;
  ocr_success: number;
  ocr_failures: number;
  total_lines_extracted: number;
  gpu_memory_used_gb: number;
  gpu_memory_total_gb: number;
  memory_used_gb: number;
  memory_total_gb: number;
  cpu_percent: number;
  latency_global?: LatencyPercentiles;
  latency_ocr?: LatencyPercentiles;
  latency_pdf?: LatencyPercentiles;
  latency_export?: LatencyPercentiles;
  per_api?: Record<string, ApiStats>;
}

/** Latency percentile breakdown. */
export interface LatencyPercentiles {
  p50?: number;
  p95?: number;
  p99?: number;
  max?: number;
  p50_ms?: number;
  p95_ms?: number;
  p99_ms?: number;
  max_ms?: number;
}

/** Per-API counter and latency statistics. */
export interface ApiStats {
  success_count: number;
  fail_count: number;
  files_processed: number;
  lines_extracted: number;
  latency?: LatencyPercentiles;
}

/** Server configuration snapshot. */
export interface ServerConfig {
  server: { host: string; port: number; workers: number };
  model: { default_device: string; conf_threshold: number; img_size: number };
  limits: {
    max_file_size_mb: number;
    max_batch_files: number;
    rate_limit_requests: number;
    rate_limit_window_sec: number;
  };
  features: {
    cache_enabled: boolean;
    cache_ttl_seconds: number;
    rate_limiting_enabled: boolean;
    authentication_enabled: boolean;
    text_cleaning_enabled: boolean;
    autocorrect_enabled: boolean;
    autocorrect_mode: string;
    spell_check_max_distance: number;
    spell_check_use_word_freq: boolean;
  };
}

/** Device switch response payload. */
export interface DeviceSwitchResponse {
  status: string;
  device?: string;
  message?: string;
}

// ─── Real-Time / SSE Types ─────────────────────────────────────────────

/** Discriminated union for SSE message types. */
export type SseMessageType =
  | 'live_stats'
  | 'live_ocr'
  | 'live_pdf'
  | 'live_export'
  | 'processing_event'
  | 'heartbeat';

/** Generic SSE envelope received from Server-Sent Events streams. */
export interface SseMessage<T = unknown> {
  type: SseMessageType;
  data: T;
}

/** Individual OCR processing completion event. */
export interface ProcessingEvent {
  task_id: string;
  filename: string;
  status: string;
  lines_detected: number;
  processing_time_ms: number;
  timestamp: string;
}

/** Active WebSocket subscriber information. */
export interface WsStatus {
  active_subscribers: number;
  connect_url: string;
}

// ─── Shared Utility Types ──────────────────────────────────────────────

/** Generic error response shape from the API. */
export interface ApiError {
  detail: string;
}

/** Progress tracker for long-running uploads. */
export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

/** Supported image extensions accepted by the backend. */
export const ALLOWED_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'bmp', 'tiff', 'tif', 'webp', 'gif', 'pdf',
];

// ─── History Types (from analysis API) ────────────────────────

export interface HistoryEntry {
  id: string;
  timestamp: number;
  operation: string;
  filename: string;
  status: string;
  lines_detected: number;
  processing_time_ms: number;
  confidence_mean?: number;
  confidence_min?: number;
  language?: string | null;
  document_type?: string | null;
  file_size_kb: number;
  device: string;
}

export interface HistoryStats {
  total_operations: number;
  by_status: Record<string, number>;
  by_operation: Record<string, number>;
  total_lines_extracted: number;
  total_processing_time_ms: number;
  avg_processing_time_ms: number;
  avg_confidence?: number;
  unique_files: number;
  time_window_seconds: number;
}

export interface HistoryResponse {
  status: string;
  stats: HistoryStats;
  entries: HistoryEntry[];
  count: number;
}

// ─── Spell Checker v4 Types ─────────────────────────────────────

/** A single error found during text analysis. */
export interface SpellError {
  word: string;
  position: number;
  length: number;
  suggestions: string[];
  confidence?: number;
  reason?: string;
}

/** Response from /spell/analyze — structured errors without auto-correction. */
export interface AnalyzeResponse {
  original: string;
  detected_script: 'urdu' | 'arabic' | 'mixed';
  errors: SpellError[];
  total_errors: number;
  grammar_flags?: GrammarFlags;
}

/** Per-word suggestion with confidence score. */
export interface Suggestion {
  candidate: string;
  confidence: number;
  reason?: string;
}

/** Response from /spell/suggest — top-N corrections per word.
 * @note Backend returns { original, suggestions } — the corrected text may be under `corrected` or omitted. */
export interface SuggestResponse {
  original?: string;
  text?: string;
  corrected?: string;
  suggested?: string;
  suggestions: Record<string, Suggestion[]>;
}

/** Single result within a batch response. */
export interface BatchSpellResult {
  index: number;
  original: string;
  corrected: string;
  corrections_applied: number;
  has_errors: boolean;
}

/** Response from /spell/batch — multiple texts processed together. */
export interface BatchResponse {
  results: BatchSpellResult[];
  total_texts: number;
  total_corrections: number;
  texts_with_errors: number;
}

/** Urdu-to-Latin transcription result per word. */
export interface RomanizeWord {
  urdu: string;
  latin: string;
}

/** Response from /spell/romanize — approximate Urdu-to-Latin transcription.
 * @note Backend returns { original, romanized } with a single string, not per-word arrays. */
export interface RomanizeResponse {
  original?: string;
  full_transcription?: string;
  romanized?: string;
  words?: RomanizeWord[];
}

/** Grammar detection flags from analysis. */
export interface GrammarFlags {
  missing_negation?: boolean;
  repetitive_words?: boolean;
}

/** Analytics data from /spell/analytics — session statistics. */
export interface AnalyticsResponse {
  total_corrections: number;
  total_texts_processed: number;
  correction_rate: number;
  average_confidence?: number;
  strategy_usage: Record<string, number>;
  dictionary_stats: {
    words_count: number;
    bigrams_count: number;
    trigrams_count: number;
    total_unique_tokens: number;
  };
}

/** User dictionary entry. */
export interface UserDictEntry {
  word: string;
  added_at: string;
}

/** Response for user dictionary operations.
 * @note Backend returns { added, user_dict_size } on add and { removed, success, user_dict_size } on remove. */
export interface UserDictResponse {
  status?: 'added' | 'removed' | 'error';
  added?: string;
  removed?: string;
  success?: boolean;
  message?: string;
  user_dict_size?: number;
}

/** Full user dictionary listing. */
export interface UserDictListResponse {
  words: UserDictEntry[];
  total: number;
}

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

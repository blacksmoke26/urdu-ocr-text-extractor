/**
 * Analysis API service functions.
 * Covers document analysis, text summarization, enhancement recommendations,
 * table detection, and processing history.
 */

import { postJson } from '../apiClient';

// ── Types ───────────────────────────────────────────────────────

export interface LanguageInfo {
  primary: string;
  languages: Array<{ code: string; label: string; proportion: number }>;
  proportions: Record<string, number>;
  is_mixed: boolean;
  script_count: number;
  confidence: number;
}

export interface DocumentTypeAnalysis {
  primary: string;
  confidence: number;
  scores: Record<string, number>;
}

export interface ContentAnalysis {
  word_count: number;
  sentence_count: number;
  avg_word_length: number;
  uniqueness_ratio: number;
  char_count: number;
  line_count: number;
  has_numbers: boolean;
  number_density: number;
}

export interface DocumentAnalysisResult {
  language: LanguageInfo;
  document_type: DocumentTypeAnalysis;
  content: ContentAnalysis;
  image_quality: Record<string, unknown>;
  recommendations: string[];
}

export interface KeywordInfo {
  word: string;
  count: number;
  score: number;
}

export interface SummaryResult {
  summary: string;
  method: string;
  confidence: number;
  keywords: KeywordInfo[];
  title: string;
  num_sentences_selected: number;
  total_sentences: number;
}

export interface EnhancementRecommendation {
  auto_optimize: boolean;
  recommendations: Array<{
    feature: string;
    reason: string;
    intensity?: number;
    strength?: string;
    kernel_size?: number;
    brightness_adjust?: number;
  }>;
  quality_score: number;
}

export interface TableDetectionResult {
  is_table: boolean;
  tables: Array<{
    start_row?: number;
    rows: number;
    cols: number;
    cells: string[][];
  }>;
}

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

// ── API Functions ───────────────────────────────────────────────

/** POST /analysis/document — Full document analysis */
export async function analyzeDocument(text: string, imageQuality?: Record<string, unknown>): Promise<{ status: string; analysis: DocumentAnalysisResult }> {
  return postJson('/analysis/document', { text, image_quality: imageQuality ? JSON.stringify(imageQuality) : '' });
}

/** POST /analysis/summarize — Generate text summary */
export async function summarizeText(text: string, maxSentences = 3): Promise<{ status: string; summary: SummaryResult }> {
  return postJson('/analysis/summarize', { text, max_sentences: maxSentences });
}

/** POST /analysis/recommend — Enhancement recommendations */
export async function recommendEnhancements(quality?: Record<string, unknown>): Promise<{ status: string; recommendation: EnhancementRecommendation }> {
  if (quality) {
    return postJson('/analysis/recommend', quality);
  }
  return postJson('/analysis/recommend', {});
}

/** POST /analysis/table-detect — Detect tables in OCR lines */
export async function detectTable(lines: string): Promise<{ status: string; table_detection: TableDetectionResult }> {
  return postJson('/analysis/table-detect', { lines });
}

/** GET /analysis/history — Processing history log */
export async function getHistory(limit = 50, operation?: string): Promise<HistoryResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (operation) params.append('operation', operation);
  return get(`/analysis/history?${params.toString()}`);
}

/** POST /analysis/history/clear — Clear processing history */
export async function clearHistory(): Promise<{ status: string; message: string }> {
  const client = await import('../apiClient').then(m => m.default);
  const res = await client.post('/analysis/history/clear', {});
  return res.data;
}

// ── Helper for direct GET (reused from apiClient) ───────────────

async function get<T>(url: string): Promise<T> {
  const { get: g } = await import('../apiClient');
  return g<T>(url);
}

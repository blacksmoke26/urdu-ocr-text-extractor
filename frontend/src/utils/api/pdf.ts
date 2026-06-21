/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2025 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

/**
 * PDF API service functions.
 * Covers metadata extraction, page extraction, reconstruction, and full OCR.
 */

import { upload, downloadBinary } from '../apiClient';
import client from '../apiClient';
import type { PdfInfo, PdfExtractResponse, PdfOcrOptions, PdfOcrResponse } from '#/types/api';

/** Retrieve metadata (pages, author, dimensions) from a PDF. */
export const pdfInfo = (file: File): Promise<PdfInfo> =>
  upload<PdfInfo>('/pdf/info', file, 'file');

/** Extract page images from a PDF at the given DPI range. */
export const pdfExtract = (
  file: File,
  fromPage = 1,
  toPage?: number,
  dpi = 300,
  taskId?: string,
): Promise<PdfExtractResponse> =>
  upload<PdfExtractResponse>('/pdf/extract', file, 'file', { from_page: fromPage, to_page: toPage, dpi, ...(taskId ? { task_id: taskId } : {}) });

/** Cancel a running PDF OCR task. Returns partial results or status. */
export const cancelPdfOcr = (task_id: string): Promise<{ task_id: string; status: string; message: string }> =>
// @ts-expect-error ignore it
  upload<{ task_id: string; status: string; message: string }>('/pdf/tasks/' + encodeURIComponent(task_id) + '/cancel', new Blob([]), 'file');

/** Reconstruct a new PDF from a page range (returns binary download). */
export const pdfReconstruct = async (
  file: File,
  fromPage = 1,
  toPage?: number,
): Promise<void> => {
  const { downloadBinary } = await import('../apiClient');
  await downloadBinary('/pdf/reconstruct', file, {
    from_page: fromPage,
    to_page: toPage,
  }, `${file.name}_extracted.pdf`);
};

/** Run full OCR on all pages (or a range) of a PDF. */
export const pdfOcr = (
  file: File,
  fromPage = 1,
  toPage?: number,
  confThreshold = 0.2,
  imgSize = 1280,
  textCleaning = 'true',
  onProgress?: (pct: number) => void,
  taskId?: string,
  advancedOptions?: PdfOcrOptions,
  signal?: AbortSignal,
): Promise<PdfOcrResponse> => {
  const formData: Record<string, string | number | boolean> = {
    from_page: fromPage,
    to_page: toPage,
    conf_threshold: confThreshold,
    img_size: imgSize,
    text_cleaning: textCleaning,
    ...(taskId ? { task_id: taskId } : {}),
  };

  // Add advanced options when provided
  if (advancedOptions) {
    const { use_cache, device, det_type, det_conf, mllm_model, layout_analysis, post_processing, preprocess_options, ...baseOpts } = advancedOptions;
    Object.assign(formData, baseOpts);
    if (use_cache !== undefined) formData.use_cache = use_cache ? 'true' : 'false';
    if (device) formData.device = device;
    if (det_type) formData.det_type = det_type;
    if (det_conf !== undefined) formData.det_conf = det_conf;
    if (mllm_model) formData.mllm_model = mllm_model;
    if (layout_analysis !== undefined) formData.layout_analysis = layout_analysis ? 'true' : 'false';
    if (post_processing) formData.post_processing = post_processing;
    if (preprocess_options) formData.preprocess_options = JSON.stringify(preprocess_options);
  }

  // Set to_page only when provided
  if (toPage !== undefined) {
    formData.to_page = toPage;
  }

  return upload<PdfOcrResponse>('/pdf/ocr', file, 'file', formData, onProgress, signal);
};

export default client;

/* ── Helpers ─────────────────────────────────────────────────── */

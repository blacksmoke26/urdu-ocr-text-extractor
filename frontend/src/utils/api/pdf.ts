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
import type { PdfInfo, PdfExtractResponse, PdfOcrResponse } from '#/types/api';

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
): Promise<PdfOcrResponse> =>
  upload<PdfOcrResponse>('/pdf/ocr', file, 'file', {
    from_page: fromPage,
    to_page: toPage,
    conf_threshold: confThreshold,
    img_size: imgSize,
    text_cleaning: textCleaning,
    ...(taskId ? { task_id: taskId } : {}),
  }, onProgress);

export default client;

/* ── Helpers ─────────────────────────────────────────────────── */

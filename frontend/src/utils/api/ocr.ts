/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2025 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

/**
 * OCR API service functions wrapping the axios client.
 * Covers single-image, batch, enhanced, and direct-tensor endpoints.
 */

import { upload } from '../apiClient';
import type { OcrResult, BatchOcrResponse, SingleOcrParams, EnhanceOptions } from '#/types/api';

/** Process a single image for Urdu text extraction. */
export const ocrSingle = (
  file: File,
  params?: SingleOcrParams,
  onProgress?: (pct: number) => void,
): Promise<OcrResult> =>
  upload<OcrResult>('/ocr/single', file, 'file', params, onProgress);

/** Process multiple images or PDFs in a single batch request. */
export const ocrBatch = (
  files: File[],
  params?: SingleOcrParams & { use_cache?: boolean },
  onProgress?: (pct: number) => void,
): Promise<BatchOcrResponse> =>
  upload<BatchOcrResponse>('/ocr', files, 'files', params, onProgress);

/** Run OCR with optional image enhancement preprocessing. */
export const ocrEnhanced = (
  file: File,
  options?: EnhanceOptions & SingleOcrParams,
  onProgress?: (pct: number) => void,
): Promise<OcrResult> =>
  upload<OcrResult>('/ocr/with-enhance', file, 'file', options, onProgress);

/** Direct pipeline call — no caching or text cleaning. */
export const ocrDirect = (
  file: File,
  params?: SingleOcrParams,
  onProgress?: (pct: number) => void,
): Promise<OcrResult> =>
  upload<OcrResult>('/ocr/direct-tensor', file, 'file', params, onProgress);

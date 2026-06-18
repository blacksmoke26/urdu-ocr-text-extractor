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
): Promise<OcrResult> => {
  // Build text_cleaning JSON with spell check settings
  let textCleaning = 'true';
  if (params?.autocorrect) {
    textCleaning = JSON.stringify({
      autocorrect: true,
      autocorrect_mode: params.autocorrect_mode || 'hybrid',
      max_distance: params.spell_check_max_distance ?? 2,
      use_word_freq: params.spell_check_use_word_freq !== false,
    });
  }
  const cleanedParams: SingleOcrParams = {
    conf_threshold: params?.conf_threshold,
    img_size: params?.img_size,
    text_cleaning: textCleaning,
  };
  return upload<OcrResult>('/ocr/single', file, 'file', cleanedParams, onProgress);
};

/** Process multiple images or PDFs in a single batch request. */
export const ocrBatch = (
  files: File[],
  params?: SingleOcrParams & { use_cache?: boolean },
  onProgress?: (pct: number) => void,
): Promise<BatchOcrResponse> => {
  let textCleaning = 'true';
  if (params?.autocorrect) {
    textCleaning = JSON.stringify({
      autocorrect: true,
      autocorrect_mode: params.autocorrect_mode || 'hybrid',
      max_distance: params.spell_check_max_distance ?? 2,
      use_word_freq: params.spell_check_use_word_freq !== false,
    });
  }
  const cleanedParams: SingleOcrParams & { use_cache?: boolean } = {
    conf_threshold: params?.conf_threshold,
    img_size: params?.img_size,
    text_cleaning: textCleaning,
    use_cache: params?.use_cache,
  };
  return upload<BatchOcrResponse>('/ocr', files, 'files', cleanedParams, onProgress);
};

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

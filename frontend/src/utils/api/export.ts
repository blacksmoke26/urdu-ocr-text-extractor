/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2025 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

/**
 * Export API service functions.
 * Sends an OCR result object to the backend and receives formatted output.
 */

import { postJson } from '../apiClient';
import type { OcrResult, PdfOcrResponse, ExportResponse, BinaryExportResponse, ExportFormat } from '#/types/api';

/* ─── Image OCR Exports ───────────────────────────── */

/** Send OCR result for JSON formatting. */
export const exportJson = (result: OcrResult): Promise<ExportResponse> =>
  postJson<ExportResponse>('/export/json', result);

/** Send OCR result for plain text extraction. */
export const exportTxt = (result: OcrResult): Promise<ExportResponse> =>
  postJson<ExportResponse>('/export/txt', result);

/** Send OCR result for CSV with bounding box data. */
export const exportCsv = (result: OcrResult): Promise<ExportResponse> =>
  postJson<ExportResponse>('/export/csv', result);

/** Generate a .docx document from an OCR result. */
export const exportDocx = (result: OcrResult): Promise<BinaryExportResponse> =>
  postJson<BinaryExportResponse>('/export/docx', result);

/** Generate a searchable PDF with invisible text overlay. */
export const exportSearchablePdf = (result: OcrResult): Promise<BinaryExportResponse> =>
  postJson<BinaryExportResponse>('/export/searchable-pdf', result);

/* ─── PDF OCR Exports ─────────────────────────────── */

/** Send PDF OCR response for JSON export. */
export const exportPdfJson = (result: PdfOcrResponse): Promise<ExportResponse> =>
  postJson<ExportResponse>('/export/pdf-json', result);

/** Send PDF OCR response for plain text export. */
export const exportPdfTxt = (result: PdfOcrResponse): Promise<ExportResponse> =>
  postJson<ExportResponse>('/export/pdf-txt', result);

/** Send PDF OCR response for CSV export. */
export const exportPdfCsv = (result: PdfOcrResponse): Promise<ExportResponse> =>
  postJson<ExportResponse>('/export/pdf-csv', result);

/** Send PDF OCR response for DOCX export. */
export const exportPdfDocx = (result: PdfOcrResponse): Promise<BinaryExportResponse> =>
  postJson<BinaryExportResponse>('/export/pdf-docx', result);

/* ─── Download Helpers ────────────────────────────── */

/** Download a base64-encoded binary file in the browser. */
export function downloadBase64File(dataB64: string, filename: string, mimeType = 'application/octet-stream') {
  const byteChars = atob(dataB64);
  const byteArr = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
  const blob = new Blob([byteArr], { type: mimeType });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** Download a text export (json/txt/csv) as a file. */
export function downloadTextFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** Map an export format identifier to a human-readable label. */
export const FORMAT_LABELS: Record<ExportFormat, string> = {
  json: 'JSON',
  txt: 'Plain Text',
  csv: 'CSV (with bbox)',
  docx: 'Word (.docx)',
  pdf: 'Searchable PDF',
};

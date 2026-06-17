/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2025 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

/**
 * Axios-based HTTP client for the Urdu OCR v2 API.
 * Provides interceptors for request/response handling, error normalization,
 * and progress callbacks suitable for file uploads.
 * @author Junaid Atari <mj.atari@gmail.com>
 */

import axios from 'axios';
import type {ApiError} from '#/types/api';

/**
 * Base URL for the Urdu OCR v2 API endpoints.
 * @example
 * // Returns '/api/v2/ocr/single'
 * toUrl('ocr/single');
 * @developerNote
 * Ensure this matches the backend proxy configuration to avoid 404s.
 */
export const BASE_URL = '/api/v2';

/**
 * Constructs a full API endpoint URL from a relative route.
 * @param route - The relative path (e.g., 'ocr/single').
 * @returns The absolute API path.
 * @example
 * const endpoint = toUrl('status'); // '/api/v2/status'
 * @developerNote
 * Do not include a leading slash in the route parameter.
 */
export const toUrl = (route: string): string => {
  return `${BASE_URL}/${route}`;
};

/**
 * Pre-configured Axios instance for API communication.
 * Includes default headers and a 2-minute timeout.
 * @developerNote
 * Use this instance for all JSON requests; for file uploads, see `upload()`.
 */
const client = axios.create({
  baseURL: BASE_URL,
  headers: {'Content-Type': 'application/json'},
  timeout: 120_000, // 2 minutes for large file processing
});

/** Normalize error responses to a consistent shape. */
client.interceptors.response.use(
  (res) => res,
  (err) => {
    const detail = err.response?.data as ApiError | undefined;
    const msg = detail?.detail ?? err.message ?? 'Unknown API error';
    return Promise.reject({status: err.response?.status, message: msg});
  },
);

/**
 * Upload a file (or files) with FormData and optional params.
 * Returns the JSON response data.
 *
 * @param url - Relative API path (e.g. `/ocr/single`)
 * @param file - Single file or array of files to upload
 * @param fieldKey - Form-data field name (`files` for batch, `file` for single)
 * @param params - Extra form fields
 * @param onProgress - Upload progress callback (0–100)
 */
export async function upload<T>(
  url: string,
  file: File | File[],
  fieldKey = 'files',
  params?: Record<string, any>,
  onProgress?: (pct: number) => void,
): Promise<T> {
  const form = new FormData();
  const files = Array.isArray(file) ? file : [file];
  for (const f of files) form.append(fieldKey, f);

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      // Skip undefined values so FastAPI Form() gets its None default
      if (v === undefined || v === null) continue;
      const value = typeof v === 'boolean' ? String(v) : v;
      form.append(k, String(value));
    }
  }

  const res = await client.post(url, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300_000,
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });

  return res.data as T;
}

/**
 * Send a JSON POST request (used by export endpoints).
 */
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await client.post(url, body);
  return res.data as T;
}

/** Generic GET request. */
export async function get<T>(url: string): Promise<T> {
  const res = await client.get(url);
  return res.data as T;
}

/**
 * Download a raw binary file (PDF, DOCX) returned by the backend.
 * Bypasses the JSON-interceptor and triggers an in-browser download.
 */
export async function downloadBinary(url: string, file: File | null, params?: Record<string, any>, filename?: string): Promise<void> {
  if (!file) return;

  const form = new FormData();
  form.append('file', file);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      form.append(k, String(v));
    }
  }

  const res = await axios.post(url, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    responseType: 'blob',
  });

  const blob = new Blob([res.data]);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename ?? `download_${Date.now()}.pdf`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default client;

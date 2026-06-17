/**
 * Real-time (SSE / WebSocket) utilities for live statistics streaming.
 * Provides helpers to connect to the backend Server-Sent Events endpoints
 * and a WebSocket connection manager for stats broadcasts.
 *
 * @example
 * ```ts
 * import { connectLiveStats, connectWsStats } from '#/utils/liveStats';
 *
 * // SSE: Subscribe to live stats updates
 * const sse = connectLiveStats((stats) => {
 *   console.log('Live stats:', stats);
 * });
 *
 * // WebSocket: Bidirectional live stats broadcast
 * const { unsubscribe } = connectWsStats(
 *   (stats) => console.log('WS stats:', stats),
 *   () => console.log('WS connected'),
 *   () => console.log('WS closed'),
 * );
 *
 * // Cleanup when component unmounts
 * onCleanup(() => {
 *   sse.close();
 *   unsubscribe();
 * });
 * ```
 *
 * @developer_notes
 * - SSE connections are one-way; use for event-driven streams.
 * - WebSocket supports subscription/unsubscription via string messages.
 * - Malformed JSON frames are silently skipped.
 * - `BASE_URL` from `apiClient` is used for all paths.
 */

import type { SseMessage, LiveStats } from '#/types/api';
import {BASE_URL} from '#/utils/apiClient';

/**
 * Connect to an SSE endpoint and call `onMessage` for each parsed JSON event.
 * Returns the EventSource for manual closing.
 *
 * @example
 * ```ts
 * const es = connectSse<MyType>('/events', (msg) => console.log(msg.data));
 * // later: es.close();
 * ```
 *
 * @developer_notes
 * - Generic `T` defaults to `LiveStats` but can be any JSON-serializable type.
 * - `onError` defaults to a no-op; provide a handler to log connection issues.
 * - JSON parse errors are ignored (malformed frames).
 */
export function connectSse<T = LiveStats>(
  path: string,
  onMessage: (msg: SseMessage<T>) => void,
  onError?: (e: Event) => void,
): EventSource {
  const es = new EventSource(`${BASE_URL}${path}`);

  es.onmessage = (evt) => {
    try {
      const msg: SseMessage<T> = JSON.parse(evt.data);
      onMessage(msg);
    } catch {
      // Skip malformed frames silently
    }
  };

  es.onerror = onError ?? (() => {});
  return es;
}

/** Connect to the global live-stats SSE stream. */
export const connectLiveStats = (cb: (stats: LiveStats) => void, onError?: (e: Event) => void) =>
  connectSse<LiveStats>('/live-stats/sse', (msg) => cb(msg.data as LiveStats), onError);

/** Connect to OCR-only SSE stream. */
export const connectOcrStats = (cb: (data: unknown) => void, onError?: (e: Event) => void) =>
  connectSse<unknown>('/live-stats/ocr', (msg) => cb(msg.data), onError);

/** Connect to PDF-only SSE stream. */
export const connectPdfStats = (cb: (data: unknown) => void, onError?: (e: Event) => void) =>
  connectSse<unknown>('/live-stats/pdf', (msg) => cb(msg.data), onError);

/** Connect to Export-only SSE stream. */
export const connectExportStats = (cb: (data: unknown) => void, onError?: (e: Event) => void) =>
  connectSse<unknown>('/live-stats/export', (msg) => cb(msg.data), onError);

/**
 * Establish a WebSocket connection for live stats broadcast.
 * Returns the WebSocket instance and an `unsubscribe` function.
 *
 * @example
 * ```ts
 * const { ws, unsubscribe } = connectWsStats(
 *   (stats) => console.log('WS stats:', stats),
 *   () => console.log('WS opened'),
 *   () => console.log('WS closed'),
 * );
 *
 * // later: unsubscribe();
 * ```
 *
 * @developer_notes
 * - Protocol is automatically chosen (ws/wss) based on `location.protocol`.
 * - Backend may send `pong` messages, which are ignored.
 * - `unsubscribe` sends an 'unsubscribe' string and closes the connection.
 */
export function connectWsStats(
  onMessage: (data: LiveStats) => void,
  onOpen?: () => void,
  onClose?: () => void,
): { ws: WebSocket; unsubscribe: () => void } {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';

  // In production, use the same host as the page (backend serves WS)
  // In dev (Vite on localhost:5173), connect directly to backend on port 8000
  // because Vite's proxy does not support WebSocket upgrade for custom routes.
  const isDev = import.meta.env.DEV;
  let host: string;
  if (isDev) {
    host = `${location.hostname}:8000`;
  } else {
    host = location.host;
  }

  const ws = new WebSocket(`${proto}//${host}${BASE_URL}/ws/stats`);

  // Track whether the connection has opened at least once
  let isConnected = false;

  ws.onopen = () => {
    isConnected = true;
    onOpen?.();
  };

  ws.onmessage = (evt) => {
    try {
      // Backend sends binary frames; convert to string for JSON parsing
      const raw = evt.data instanceof Blob ? new TextDecoder().decode(evt.data) : evt.data;
      const parsed = JSON.parse(raw);
      // Backend sends full LiveStats object from broadcast loop
      if (parsed.type === 'pong') return;
      onMessage(parsed as LiveStats);
    } catch { /* skip */ }
  };

  ws.onerror = () => {
    console.warn('[WsStats] WebSocket error — stats will not update.');
    isConnected = false;
    onClose?.();
  };

  ws.onclose = (evt) => {
    isConnected = false;
    if (!evt.wasClean) {
      console.warn(`[WsStats] WebSocket closed unexpectedly (code: ${evt.code}, reason: ${evt.reason})`);
    }
    onClose?.();
  };

  const unsubscribe = () => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send('unsubscribe');
    }
    ws.close();
  };

  return { ws, unsubscribe };
}

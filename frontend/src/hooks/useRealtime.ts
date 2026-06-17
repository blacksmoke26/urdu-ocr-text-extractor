/**
 * React hooks for real-time data streams.
 * Uses axios for all HTTP requests — no native fetch calls.
 */

import { useEffect, useRef, useState } from 'react';
import client from '#/utils/apiClient';
import { connectLiveStats, connectWsStats } from '#/utils/realtime';
import type { HealthCheck, LiveStats } from '#/types/api';

/**
 * Poll the server for health check at a fixed interval.
 */
export function useHealthPoll(intervalMs = 5_000) {
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await client.get<HealthCheck>('/health');
        if (!cancelled) {
          setHealth(res.data);
          setConnected(true);
        }
      } catch {
        if (!cancelled) {
          setHealth(null);
          setConnected(false);
        }
      }
    }

    poll();
    const id = setInterval(poll, intervalMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [intervalMs]);

  return { health, connected };
}

/**
 * Subscribe to the SSE live-stats stream. Data updates every ~1s from the server.
 */
export function useSseLiveStats() {
  const [stats, setStats] = useState<LiveStats | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const source = connectLiveStats((data: LiveStats) => setStats(data));
    esRef.current = source;
    return () => { source.close(); };
  }, []);

  return stats;
}

/**
 * Subscribe via WebSocket. Preferred for lower-latency real-time updates.
 * Falls back to the same polling logic as useStatsPoll if WS fails.
 */
export function useWsLiveStats() {
  const [stats, setStats] = useState<LiveStats | null>(null);
  const wsRef = useRef<{ unsubscribe: () => void; isOpen: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Try the real WebSocket connection
    const { ws, unsubscribe } = connectWsStats(
      (data) => {
        if (!cancelled) setStats(data);
      },
      () => {}, // onOpen — WS connected successfully
      () => {}, // onClose — don't reset stats
    );
    wsRef.current = { unsubscribe, isOpen: ws.readyState === WebSocket.OPEN };

    return () => {
      cancelled = true;
      try { ws.close(); } catch {}
      unsubscribe();
    };
  }, []);

  // Always poll as fallback — useStatsPoll already handles errors gracefully
  const pollStats = useStatsPoll(5_000);

  // Return WS data if available, otherwise polling
  const wsHasData = Boolean(stats && stats.total_requests != null);
  return wsHasData ? stats : pollStats;
}

/**
 * Poll the /stats endpoint at a fixed interval (axios-based fallback).
 */
export function useStatsPoll(intervalMs = 2_000) {
  const [stats, setStats] = useState<LiveStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await client.get<LiveStats>('/stats');
        if (!cancelled) setStats(res.data);
      } catch { /* ignore */ }
    }
    poll();
    const id = setInterval(poll, intervalMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [intervalMs]);

  return stats;
}

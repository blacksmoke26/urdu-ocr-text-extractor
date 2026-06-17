/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2025 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

/**
 * System API service functions.
 * Covers health check, stats, config, cache management, and device switching.
 */

import { get } from '../apiClient';
import client from '../apiClient';
import type { HealthCheck, LiveStats, ServerConfig, CacheStats, DeviceSwitchResponse } from '#/types/api';

/** GET /health — Service health + GPU memory. */
export const fetchHealth = (): Promise<HealthCheck> => get<HealthCheck>('/health');

/** GET /stats — Live usage metrics. */
export const fetchStats = (): Promise<LiveStats> => get<LiveStats>('/stats');

/** GET /config — Current server configuration. */
export const fetchConfig = (): Promise<ServerConfig> => get<ServerConfig>('/config');

/** GET /cache/stats — Cache hit/miss metrics. */
export const fetchCacheStats = (): Promise<{ cache: CacheStats }> =>
  get<{ cache: CacheStats }>('/cache/stats');

/** POST /cache/clear — Flush all cached results. */
export const clearCache = async (): Promise<{ status: string; message: string }> => {
  const res = await client.post('/cache/clear', {});
  return res.data;
};

/** POST /device/switch — Switch CPU/CUDA at runtime. */
export const switchDevice = async (device: 'cpu' | 'cuda'): Promise<DeviceSwitchResponse> => {
  const res = await client.post('/device/switch', { device });
  return res.data;
};

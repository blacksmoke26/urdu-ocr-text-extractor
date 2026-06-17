/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2025 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

/**
 * System Page — Server health, configuration, cache management, and device switching.
 *
 * Displays the current server status via health poll, live config snapshot, cache stats,
 * and controls to switch between CPU/CUDA or flush the result cache.
 */

import { useEffect, useState } from 'react';
import { Activity, Cpu, MemoryStick, Settings2, RefreshCw, Trash2 } from 'lucide-react';
import { fetchHealth, fetchConfig, fetchCacheStats, clearCache, switchDevice } from '#/utils/api/system';
import type { HealthCheck, ServerConfig, CacheStats } from '#/types/api';
import { Card } from '#/components/ui/Card';
import { Button } from '#/components/ui/Button';
import { Badge } from '#/components/ui/Badge';
import { useToast } from '#/context/ToastContext';

export function SystemPage() {
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  // Poll health on mount and every 5s
  useEffect(() => {
    async function poll() {
      const h = await fetchHealth();
      setHealth(h);
    }
    poll();
    const id = setInterval(poll, 5_000);
    return () => clearInterval(id);
  }, []);

  // Load config once
  useEffect(() => {
    fetchConfig().then(setConfig).catch(() => {});
    fetchCacheStats().then((d) => setCacheStats(d.cache)).catch(() => {});
  }, []);

  const onClearCache = async () => {
    setLoading(true);
    try {
      await clearCache();
      addToast('Cache cleared successfully.', 'success');
      setCacheStats({ hits: 0, misses: 0, entries: 0 });
    } catch (err: any) {
      addToast(err?.message || 'Cache clear failed.', 'error');
    } finally { setLoading(false); }
  };

  const onDeviceSwitch = async (device: 'cpu' | 'cuda') => {
    setLoading(true);
    try {
      await switchDevice(device);
      addToast(`Switched to ${device.toUpperCase()}. Models reloaded.`, 'success');
      const h = await fetchHealth();
      setHealth(h);
    } catch (err: any) {
      addToast(err?.message || 'Device switch failed.', 'error');
    } finally { setLoading(false); }
  };

  /* ── Render helpers ───────────────────────────────────── */

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Server Status */}
      <Card title="Server Status" description="Health is polled every 5 seconds.">
        {health ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant={health.status === 'healthy' ? 'success' : 'warning'} label={health.status.toUpperCase()} />
              <span className="text-sm text-gray-500">{health.service} v{health.version}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <Stat icon={<Cpu className="h-4 w-4" />} label="Device" value={health.device} />
              <Stat icon={<MemoryStick className="h-4 w-4" />} label="GPU Used" value={`${health.gpu_memory_used_gb} / ${health.gpu_memory_total_gb} GB`} />
              <Stat icon={<Activity className="h-4 w-4" />} label="CUDA" value={health.cuda_available ? 'Available' : 'Unavailable'} />
            </div>
            {health.models_loaded ? (
              <Badge variant="success" label="Models Loaded" />
            ) : (
              <Badge variant="warning" label="Models Not Loaded" />
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <RefreshCw className="h-8 w-8 mx-auto text-gray-400 animate-spin mb-2" />
            <p className="text-sm text-gray-500">Connecting to server…</p>
          </div>
        )}
      </Card>

      {/* Device Switch */}
      {health && health.models_loaded && (
        <Card title="Device Management" description="Switch between CPU and CUDA for model inference.">
          <div className="flex gap-3">
            <Button onClick={() => onDeviceSwitch('cpu')} variant={health.device === 'cpu' ? 'primary' : 'secondary'} disabled={loading}>
              Switch to CPU
            </Button>
            <Button onClick={() => onDeviceSwitch('cuda')} variant={health.device === 'cuda' ? 'primary' : 'secondary'} disabled={loading || !health.cuda_available}>
              Switch to CUDA
            </Button>
          </div>
        </Card>
      )}

      {/* Cache */}
      {cacheStats && (
        <Card title="Result Cache" description="Cached OCR results are reused for identical uploads.">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-slate-900/50">
              <p className="text-2xl font-bold text-violet-600">{cacheStats.hits}</p>
              <p className="text-xs text-gray-500 mt-1">Hits</p>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-slate-900/50">
              <p className="text-2xl font-bold text-blue-600">{cacheStats.misses}</p>
              <p className="text-xs text-gray-500 mt-1">Misses</p>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-slate-900/50">
              <p className="text-2xl font-bold text-emerald-600">{cacheStats.entries}</p>
              <p className="text-xs text-gray-500 mt-1">Entries</p>
            </div>
          </div>
          <div className="mt-3">
            <Button variant="destructive" onClick={onClearCache} loading={loading}>
              <Trash2 className="h-4 w-4 mr-1" /> Clear Cache
            </Button>
          </div>
        </Card>
      )}

      {/* Config */}
      {config && (
        <Card title="Server Configuration">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <ConfigSection title="Server" icon={<Settings2 className="h-4 w-4" />}>
              <div>Host: {config.server.host}</div>
              <div>Port: {config.server.port}</div>
              <div>Workers: {config.server.workers}</div>
            </ConfigSection>
            <ConfigSection title="Model" icon={<Cpu className="h-4 w-4" />}>
              <div>Device: {config.model.default_device}</div>
              <div>Conf Threshold: {config.model.conf_threshold}</div>
              <div>Image Size: {config.model.img_size}</div>
            </ConfigSection>
            <ConfigSection title="Limits & Features" icon={<Activity className="h-4 w-4" />}>
              <div>Max File: {config.limits.max_file_size_mb} MB</div>
              <div>Batch Limit: {config.limits.max_batch_files}</div>
              <div>Rate Limit: {config.limits.rate_limit_requests}/{config.limits.rate_limit_window_sec}s</div>
              <div>Cache: {config.features.cache_enabled ? 'On' : 'Off'}</div>
              <div>Auth: {config.features.authentication_enabled ? 'Enabled' : 'Disabled'}</div>
            </ConfigSection>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ── Inline sub-components ──────────────────────────────────── */

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-violet-500">{icon}</span>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="font-medium text-gray-900 dark:text-gray-100">{value}</p>
      </div>
    </div>
  );
}

function ConfigSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="font-medium text-sm flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
        {icon} {title}
      </h4>
      <div className="text-xs space-y-1 text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-slate-800 pt-2">
        {children}
      </div>
    </div>
  );
}

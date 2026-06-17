/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2025 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

import { useEffect, useState } from 'react';
import { Activity, Cpu, MemoryStick, Settings2, RefreshCw, Trash2, Server, Shield, Wifi } from 'lucide-react';
import { fetchHealth, fetchConfig, fetchCacheStats, clearCache, switchDevice } from '#/utils/api/system';
import type { HealthCheck, ServerConfig, CacheStats } from '#/types/api';

export function SystemPage() {
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function poll() {
      const h = await fetchHealth();
      setHealth(h);
    }
    poll();
    const id = setInterval(poll, 5_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetchConfig().then(setConfig).catch(() => {});
    fetchCacheStats().then((d) => setCacheStats(d.cache)).catch(() => {});
  }, []);

  const onClearCache = async () => {
    setLoading(true);
    try {
      await clearCache();
      setCacheStats({ hits: 0, misses: 0, entries: 0 });
    } catch (err: any) {
      console.error('Cache clear failed:', err?.message || err);
    } finally { setLoading(false); }
  };

  const onDeviceSwitch = async (device: 'cpu' | 'cuda') => {
    setLoading(true);
    try {
      await switchDevice(device);
      const h = await fetchHealth();
      setHealth(h);
    } catch (err: any) {
      console.error('Device switch failed:', err?.message || err);
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* ── Server Status ─────────────────────── */}
      <div className="glass-card rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl -translate-y-12 translate-x-12" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 rounded-xl bg-emerald-500/10">
              <Server className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Server Status</h3>
              <p className="text-xs text-slate-500">Health polled every 5 seconds</p>
            </div>
          </div>

          {health ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  health.status === 'healthy' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${health.status === 'healthy' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  {health.status.toUpperCase()}
                </span>
                <span className="text-sm text-slate-400">{health.service}</span>
                <span className="text-xs px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-400 font-medium">v{health.version}</span>
                {health.models_loaded ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 text-xs font-medium">
                    <Shield className="h-3 w-3" /> Models Loaded
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-400 text-xs font-medium">
                    Models Not Loaded
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <InfoRow icon={<Cpu className="h-4 w-4" />} label="Device" value={health.device.toUpperCase()} color="text-violet-400" />
                <InfoRow icon={<MemoryStick className="h-4 w-4" />} label="GPU Memory" value={`${health.gpu_memory_used_gb.toFixed(1)} / ${health.gpu_memory_total_gb} GB`} color="text-blue-400" />
                <InfoRow icon={<Wifi className="h-4 w-4" />} label="CUDA" value={health.cuda_available ? 'Available' : 'Unavailable'} color={health.cuda_available ? 'text-emerald-400' : 'text-red-400'} />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 text-slate-600 animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* ── Device Management ─────────────────── */}
      {health && health.models_loaded && (
        <div className="glass-card rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl -translate-y-12 translate-x-12" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 rounded-xl bg-blue-500/10">
                <Cpu className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Device Management</h3>
                <p className="text-xs text-slate-500">Switch inference device for model processing</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => onDeviceSwitch('cpu')}
                disabled={loading}
                className={`relative inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  health.device === 'cpu'
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/25'
                    : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-slate-700/40'
                } disabled:opacity-50`}
              >
                {health.device === 'cpu' && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-white" />}
                Switch to CPU
              </button>
              <button
                onClick={() => onDeviceSwitch('cuda')}
                disabled={loading || !health.cuda_available}
                className={`relative inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  health.device === 'cuda'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/25'
                    : health.cuda_available
                      ? 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-slate-700/40'
                      : 'bg-white/[0.02] text-slate-600 border border-slate-800/40 cursor-not-allowed'
                } disabled:opacity-50`}
              >
                {health.device === 'cuda' && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-white" />}
                Switch to CUDA
                {!health.cuda_available && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">N/A</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cache Stats ───────────────────────── */}
      {cacheStats && (
        <div className="glass-card rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-purple-500/5 rounded-full blur-3xl -translate-y-12 translate-x-12" />
          <div className="relative">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/10">
                  <Activity className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Result Cache</h3>
                  <p className="text-xs text-slate-500">Cached OCR results for identical uploads</p>
                </div>
              </div>
              <button
                onClick={onClearCache}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Clear
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <CacheStat label="Hits" value={cacheStats.hits} color="from-emerald-500 to-green-400" bg="bg-emerald-500/10" iconColor="text-emerald-400" />
              <CacheStat label="Misses" value={cacheStats.misses} color="from-blue-500 to-cyan-400" bg="bg-blue-500/10" iconColor="text-blue-400" />
              <CacheStat label="Entries" value={cacheStats.entries} color="from-violet-500 to-purple-400" bg="bg-violet-500/10" iconColor="text-violet-400" />
            </div>
          </div>
        </div>
      )}

      {/* ── Configuration ─────────────────────── */}
      {config && (
        <div className="glass-card rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl -translate-y-12 translate-x-12" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-amber-500/10">
                <Settings2 className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Server Configuration</h3>
                <p className="text-xs text-slate-500">Current runtime settings</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <ConfigSection title="Server" icon={<Server className="h-4 w-4" />} iconColor="text-blue-400" bgColor="bg-blue-500/10">
                <ConfigItem label="Host" value={config.server.host} />
                <ConfigItem label="Port" value={String(config.server.port)} />
                <ConfigItem label="Workers" value={String(config.server.workers)} />
              </ConfigSection>
              <ConfigSection title="Model" icon={<Cpu className="h-4 w-4" />} iconColor="text-violet-400" bgColor="bg-violet-500/10">
                <ConfigItem label="Device" value={config.model.default_device} />
                <ConfigItem label="Conf Threshold" value={String(config.model.conf_threshold)} />
                <ConfigItem label="Image Size" value={String(config.model.img_size)} />
              </ConfigSection>
              <ConfigSection title="Limits & Features" icon={<Shield className="h-4 w-4" />} iconColor="text-emerald-400" bgColor="bg-emerald-500/10">
                <ConfigItem label="Max File" value={`${config.limits.max_file_size_mb} MB`} />
                <ConfigItem label="Batch Limit" value={String(config.limits.max_batch_files)} />
                <ConfigItem label="Rate Limit" value={`${config.limits.rate_limit_requests}/${config.limits.rate_limit_window_sec}s`} />
                <ConfigItem label="Cache" value={config.features.cache_enabled ? 'Enabled' : 'Disabled'} accent={config.features.cache_enabled ? 'text-emerald-400' : 'text-slate-500'} />
                <ConfigItem label="Authentication" value={config.features.authentication_enabled ? 'Enabled' : 'Disabled'} accent={config.features.authentication_enabled ? 'text-violet-400' : 'text-slate-500'} />
              </ConfigSection>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Inline sub-components ─────────────────── */

function InfoRow({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-slate-800/40">
      <span className={color}>{icon}</span>
      <div>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">{label}</p>
        <p className="text-sm font-semibold text-white">{value}</p>
      </div>
    </div>
  );
}

function CacheStat({ label, value, color, bg, iconColor }: { label: string; value: number; color: string; bg: string; iconColor: string }) {
  return (
    <div className={`p-4 rounded-xl ${bg}`}>
      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1">{label}</p>
      <p className={`text-3xl font-bold ${iconColor} tracking-tight`}>{value.toLocaleString()}</p>
    </div>
  );
}

function ConfigSection({ title, icon, iconColor, bgColor, children }: {
  title: string; icon: React.ReactNode; iconColor: string; bgColor: string; children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className={`p-1.5 rounded-lg ${bgColor}`}>
          <span className={iconColor}>{icon}</span>
        </div>
        <h4 className="text-sm font-semibold text-white">{title}</h4>
      </div>
      <div className="space-y-2 pl-1">
        {children}
      </div>
    </div>
  );
}

function ConfigItem({ label, value, accent = 'text-slate-300' }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-slate-500">{label}</span>
      <span className={`font-medium ${accent}`}>{value}</span>
    </div>
  );
}

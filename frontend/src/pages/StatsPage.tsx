/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2025 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

import { useState } from 'react';
import { Zap, TrendingUp, Timer, Cpu, Activity, HardDrive, ArrowUpRight, Wifi } from 'lucide-react';
import { useStatsPoll, useSseLiveStats, useWsLiveStats } from '#/hooks/useRealtime';
import type { LiveStats } from '#/types/api';

type StatsSource = 'sse' | 'websocket' | 'poll';

export function StatsPage() {
  const [source, setSource] = useState<StatsSource>('sse');
  const sseStats = useSseLiveStats();
  const wsStats = useWsLiveStats();
  const pollStats = useStatsPoll(2_000);
  const stats = source === 'sse' ? sseStats : source === 'websocket' ? wsStats : pollStats;

  if (!stats) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
            <Activity className="h-7 w-7 text-violet-400 animate-spin" />
          </div>
          <p className="text-sm text-slate-400">Loading analytics…</p>
        </div>
      </div>
    );
  }

  const perApi = (stats.per_api ?? {}) as Record<string, { success_count: number; fail_count: number; files_processed: number }>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* Source selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 p-1 rounded-xl bg-white/5 border border-slate-800/40">
          {(['sse', 'websocket', 'poll'] as StatsSource[]).map((s) => (
            <button
              key={s}
              onClick={() => setSource(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                source === s
                  ? 'bg-violet-500/20 text-violet-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {s === 'sse' ? 'SSE Stream' : s === 'websocket' ? 'WebSocket' : `Poll`}
            </button>
          ))}
        </div>
      </div>

      {/* ── Hero KPI Row ─────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Uptime - Featured */}
        <div className="glass-card rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl -translate-y-8 translate-x-8" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Wifi className="h-4 w-4 text-emerald-400" />
              </div>
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Uptime</span>
            </div>
            <p className="text-3xl font-bold text-white tracking-tight">{formatUptime(stats.uptime_seconds)}</p>
            <div className="flex items-center gap-1 mt-2">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400 font-medium">Healthy</span>
            </div>
          </div>
        </div>

        {/* Total Requests */}
        <div className="glass-card rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 rounded-full blur-2xl -translate-y-8 translate-x-8" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-violet-500/10">
                <Zap className="h-4 w-4 text-violet-400" />
              </div>
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Requests</span>
            </div>
            <p className="text-3xl font-bold text-white tracking-tight">{stats.total_requests.toLocaleString()}</p>
            <div className="flex items-center gap-1 mt-2">
              <TrendingUp className="h-3 w-3 text-emerald-400" />
              <span className="text-xs text-slate-500">Total handled</span>
            </div>
          </div>
        </div>

        {/* OCR RPS */}
        <div className="glass-card rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl -translate-y-8 translate-x-8" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Activity className="h-4 w-4 text-blue-400" />
              </div>
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">OCR RPS</span>
            </div>
            <p className="text-3xl font-bold text-white tracking-tight">{stats.ocr_requests_per_second.toFixed(1)}</p>
            <div className="flex items-center gap-1 mt-2">
              <ArrowUpRight className="h-3 w-3 text-emerald-400" />
              <span className="text-xs text-slate-500">Requests/sec</span>
            </div>
          </div>
        </div>

        {/* Failures */}
        <div className="glass-card rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-2xl -translate-y-8 translate-x-8" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <Activity className="h-4 w-4 text-red-400" />
              </div>
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Failures</span>
            </div>
            <p className="text-3xl font-bold text-white tracking-tight">{stats.ocr_failures.toLocaleString()}</p>
            <div className="flex items-center gap-1 mt-2">
              {stats.ocr_failures > 0 ? (
                <><ArrowUpRight className="h-3 w-3 text-red-400" /><span className="text-xs text-red-400">Needs attention</span></>
              ) : (
                <><span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" /><span className="text-xs text-slate-500">All clear</span></>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Resource Usage Row ───────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* GPU */}
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Cpu className="h-4 w-4 text-blue-400" />
            </div>
            <span className="text-sm font-semibold text-white">GPU Memory</span>
          </div>
          <div className="space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-2xl font-bold text-white">{stats.gpu_memory_used_gb.toFixed(1)}</p>
                <p className="text-xs text-slate-500">GB used</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">of {stats.gpu_memory_total_gb} GB</p>
                <p className="text-lg font-semibold text-blue-400">{Math.round((stats.gpu_memory_used_gb / stats.gpu_memory_total_gb) * 100)}%</p>
              </div>
            </div>
            <div className="h-3 rounded-full bg-slate-800/80 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-700"
                style={{ width: `${Math.min((stats.gpu_memory_used_gb / stats.gpu_memory_total_gb) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* RAM */}
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <HardDrive className="h-4 w-4 text-purple-400" />
            </div>
            <span className="text-sm font-semibold text-white">RAM Usage</span>
          </div>
          <div className="space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-2xl font-bold text-white">{stats.memory_used_gb.toFixed(1)}</p>
                <p className="text-xs text-slate-500">GB used</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">of {stats.memory_total_gb} GB</p>
                <p className="text-lg font-semibold text-purple-400">{Math.round((stats.memory_used_gb / stats.memory_total_gb) * 100)}%</p>
              </div>
            </div>
            <div className="h-3 rounded-full bg-slate-800/80 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-400 transition-all duration-700"
                style={{ width: `${Math.min((stats.memory_used_gb / stats.memory_total_gb) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* CPU */}
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Cpu className="h-4 w-4 text-amber-400" />
            </div>
            <span className="text-sm font-semibold text-white">CPU Usage</span>
          </div>
          <div className="space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <p className={`text-2xl font-bold ${stats.cpu_percent > 80 ? 'text-red-400' : stats.cpu_percent > 60 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {stats.cpu_percent}%
                </p>
                <p className="text-xs text-slate-500">Current load</p>
              </div>
            </div>
            <div className="h-3 rounded-full bg-slate-800/80 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  stats.cpu_percent > 80 ? 'bg-gradient-to-r from-red-500 to-rose-400' :
                  stats.cpu_percent > 60 ? 'bg-gradient-to-r from-amber-500 to-yellow-400' :
                  'bg-gradient-to-r from-emerald-500 to-green-400'
                }`}
                style={{ width: `${Math.min(stats.cpu_percent, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Text Extraction Summary ──────────────── */}
      <div className="glass-card rounded-2xl p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 via-transparent to-purple-500/5" />
        <div className="relative text-center">
          <Zap className="h-6 w-6 text-violet-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-1">Total Lines Extracted</p>
          <p className="text-5xl font-bold gradient-text tracking-tight">{stats.total_lines_extracted.toLocaleString()}</p>
        </div>
      </div>

      {/* ── Latency Cards ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LatencyCard title="Global Latency" data={stats.latency_global} />
        <LatencyCard title="OCR Latency" data={stats.latency_ocr} />
      </div>

      {/* ── Per-Endpoint Metrics ─────────────────── */}
      {Object.keys(perApi).length > 0 && (
        <div className="glass-card rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Per-Endpoint Metrics</h3>
          <div className="space-y-1">
            {Object.entries(perApi).map(([name, s]) => (
              <div key={name} className={`flex items-center justify-between px-4 py-3 rounded-xl transition-colors ${
                'hover:bg-white/[0.02]'
              }`}>
                <span className="font-medium text-sm capitalize text-slate-200">{name.replace(/_/g, ' ')}</span>
                <div className="flex items-center gap-5 text-xs">
                  <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    OK: {s.success_count.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1.5 text-red-400 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                    ERR: {s.fail_count.toLocaleString()}
                  </span>
                  <span className={`text-slate-500 font-medium`}>
                    Files: {s.files_processed.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Inline sub-components ─────────────────────────── */

function LatencyCard({ title, data }: { title: string; data?: LiveStats['latency_global'] | LiveStats['latency_ocr'] }) {
  if (!data) return (
    <div className="glass-card rounded-2xl p-6">
      <p className="text-sm text-slate-500 italic">No latency data available</p>
    </div>
  );

  const p50 = data.p50 ?? data.p50_ms ?? 0;
  const p95 = data.p95 ?? data.p95_ms ?? 0;
  const p99 = data.p99 ?? data.p99_ms ?? 0;
  const maxVal = data.max ?? data.max_ms ?? 0;

  const bars = [
    { label: 'p50', value: p50, color: 'from-violet-500 to-purple-400' },
    { label: 'p95', value: p95, color: 'from-blue-500 to-cyan-400' },
    { label: 'p99', value: p99, color: 'from-amber-500 to-yellow-400' },
    { label: 'Max', value: maxVal, color: 'from-red-400 to-rose-400' },
  ];

  const max = Math.max(p50, p95, p99, maxVal) || 1;

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-blue-500/10">
          <Timer className="h-4 w-4 text-blue-400" />
        </div>
        <span className="text-sm font-semibold text-white">{title}</span>
      </div>
      <div className="space-y-3">
        {bars.map(({ label, value, color }) => (
          <div key={label}>
            <div className="flex justify-between items-center text-xs mb-1.5">
              <span className="font-medium text-slate-400">{label}</span>
              <span className="font-bold text-white">{Math.round(value)}ms</span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-800/80 overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700`}
                style={{ width: `${(value / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(' ');
}

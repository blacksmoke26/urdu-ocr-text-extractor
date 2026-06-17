/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2025 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

/**
 * Stats Page — Real-time server metrics via SSE, WebSocket, or polling.
 *
 * Displays live charts: requests per second, OCR success/fail counters, GPU memory usage,
 * and latency percentiles (p50/p95/p99). Falls back to simple counters if no real-time source is available.
 */

import { useState } from 'react';
import { Zap, TrendingUp, Timer, Cpu, Activity, HardDrive } from 'lucide-react';
import { useStatsPoll, useSseLiveStats, useWsLiveStats } from '#/hooks/useRealtime';
import type { LiveStats } from '#/types/api';
import { Card } from '#/components/ui/Card';

type StatsSource = 'sse' | 'websocket' | 'poll';

export function StatsPage() {
  const [source, setSource] = useState<StatsSource>('sse');
  const sseStats = useSseLiveStats();
  const wsStats = useWsLiveStats();
  const pollStats = useStatsPoll(2_000);
  const stats = source === 'sse' ? sseStats : source === 'websocket' ? wsStats : pollStats;

  if (!stats) {
    return (
      <div className="max-w-6xl mx-auto text-center py-16">
        <Activity className="h-12 w-12 mx-auto text-gray-400 animate-spin mb-4" />
        {source === 'websocket' ? (
          <p className="text-gray-500">Connecting to WebSocket…</p>
        ) : (
          <p className="text-gray-500">Loading stats…</p>
        )}
      </div>
    );
  }

  // Ensure per_api values have the right shape
  const perApi = (stats.per_api ?? {}) as Record<string, { success_count: number; fail_count: number; files_processed: number }>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Source selector */}
      <div className="flex items-center gap-2">
        {(['sse', 'websocket', 'poll'] as StatsSource[]).map((s) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              source === s
                ? 'bg-violet-600 text-white'
                : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700'
            }`}
          >
            {s === 'sse' ? 'SSE Stream' : s === 'websocket' ? 'WebSocket' : `Poll (${source === 'poll' ? 'every 2s' : '?'})`}
          </button>
        ))}
      </div>

      {/* Uptime */}
      <Card className="text-center">
        <div className="space-y-1">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Server Uptime</p>
          <p className="text-3xl font-bold text-violet-600">{formatUptime(stats.uptime_seconds)}</p>
        </div>
      </Card>

      {/* Core counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard icon={<Zap className="h-5 w-5 text-violet-500" />} label="Total Requests" value={stats.total_requests.toLocaleString()} />
        <MetricCard icon={<TrendingUp className="h-5 w-5 text-emerald-500" />} label="OCR RPS" value={`${stats.ocr_requests_per_second.toFixed(1)}`} />
        <MetricCard icon={<Cpu className="h-5 w-5 text-blue-500" />} label="GPU Used" value={`${stats.gpu_memory_used_gb} / ${stats.gpu_memory_total_gb} GB`} />
        <MetricCard icon={<Activity className="h-5 w-5 text-red-500" />} label="OCR Failures" value={stats.ocr_failures.toString()} />
      </div>

      {/* CPU / RAM */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard icon={<HardDrive className="h-5 w-5 text-orange-500" />} label="RAM Used" value={`${stats.memory_used_gb} / ${stats.memory_total_gb} GB`} />
        <MetricCard icon={<Cpu className="h-5 w-5 text-green-500" />} label="CPU Usage" value={`${stats.cpu_percent}%`} />
        <div className="flex items-center gap-3">
          <div className="w-full h-2.5 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(stats.cpu_percent, 100)}%`,
                backgroundColor: stats.cpu_percent > 80 ? '#ef4444' : stats.cpu_percent > 60 ? '#f59e0b' : '#22c55e',
              }}
            />
          </div>
        </div>
      </div>

      {/* Lines extracted */}
      <Card title="Text Extraction Summary">
        <div className="text-center py-4">
          <p className="text-4xl font-bold text-violet-600">{stats.total_lines_extracted.toLocaleString()}</p>
          <p className="text-sm text-gray-500 mt-1">Total lines extracted</p>
        </div>
      </Card>

      {/* Latency Percentiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <LatencyCard title="Global" data={stats.latency_global} />
        <LatencyCard title="OCR" data={stats.latency_ocr} />
      </div>

      {/* Per-API stats */}
      {Object.keys(perApi).length > 0 && (
        <Card title="Per-Endpoint Metrics">
          <div className="space-y-3">
            {Object.entries(perApi).map(([name, s]) => (
              <div key={name} className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-2">
                <span className="font-medium text-sm capitalize">{name}</span>
                <div className="flex gap-4 text-sm">
                  <span className="text-emerald-600 dark:text-emerald-400">OK: {s.success_count}</span>
                  <span className="text-red-500">ERR: {s.fail_count}</span>
                  <span className="text-gray-500">Files: {s.files_processed}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ── Inline sub-components ──────────────────────────────────── */

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function LatencyCard({ title, data }: { title: string; data?: LiveStats['latency_global'] | LiveStats['latency_ocr'] }) {
  if (!data) return (
    <Card title={title}>
      <p className="text-sm text-gray-400 italic">No latency data</p>
    </Card>
  );

  // Support both naming conventions: {p50, p95, ...} and {p50_ms, p95_ms, ...}
  const p50 = data.p50 ?? data.p50_ms ?? 0;
  const p95 = data.p95 ?? data.p95_ms ?? 0;
  const p99 = data.p99 ?? data.p99_ms ?? 0;
  const maxVal = data.max ?? data.max_ms ?? 0;

  const bars = [
    { label: 'p50', value: p50, color: 'bg-violet-500' },
    { label: 'p95', value: p95, color: 'bg-blue-500' },
    { label: 'p99', value: p99, color: 'bg-red-500' },
    { label: 'Max', value: maxVal, color: 'bg-emerald-500' },
  ];

  const max = Math.max(p50, p95, p99, maxVal) || 1;

  return (
    <Card title={<><Timer className="h-4 w-4 inline mr-1" /> Latency ({title})</>}>
      <div className="space-y-2">
        {bars.map(({ label, value, color }) => (
          <div key={label}>
            <div className="flex justify-between text-xs mb-1">
              <span>{label}</span>
              <span>{Math.round(value)}ms</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
              <div className={`h-full rounded-full ${color}`} style={{ width: `${(value / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
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

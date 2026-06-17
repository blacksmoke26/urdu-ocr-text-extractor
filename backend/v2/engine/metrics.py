"""Metrics recording engine — thread-safe counters, histograms, and timers for live stats."""

from __future__ import annotations

import time
import threading
from collections import defaultdict
from dataclasses import dataclass, field


@dataclass
class _Counter:
    value: int = 0
    lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def inc(self, amount: int = 1):
        with self.lock:
            self.value += amount

    @property
    def count(self) -> int:
        with self.lock:
            return self.value


@dataclass
class _Histogram:
    """Exponential bucket histogram for latency (ms)."""
    buckets: list[int] = field(default_factory=lambda: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000])
    counts: list[int] = field(default_factory=lambda: [0] * 11)
    total_sum: float = 0.0
    total_count: int = 0
    max_val: float = 0.0
    lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def record(self, value_ms: float):
        with self.lock:
            self.total_sum += value_ms
            self.total_count += 1
            if value_ms > self.max_val:
                self.max_val = value_ms
            for i, boundary in enumerate(self.buckets):
                if value_ms <= boundary:
                    self.counts[i] += 1
                    break

    @property
    def p50(self) -> float | None:
        """Approximate median using the histogram buckets."""
        return self._percentile(50)

    @property
    def p95(self) -> float | None:
        return self._percentile(95)

    @property
    def p99(self) -> float | None:
        return self._percentile(99)

    def _percentile(self, pct: int) -> float | None:
        if self.total_count == 0:
            return None
        target = self.total_count * pct / 100
        cumulative = 0
        for i, count in enumerate(self.counts):
            cumulative += count
            if cumulative >= target:
                return float(self.buckets[i])
        return float(self.buckets[-1])

    @property
    def stats(self) -> dict:
        avg = self.total_sum / self.total_count if self.total_count > 0 else 0.0
        return {
            "count": self.total_count,
            "avg_ms": round(avg, 2),
            "p50_ms": self.p50,
            "p95_ms": self.p95,
            "p99_ms": self.p99,
            "max_ms": round(self.max_val, 2),
        }


@dataclass
class _Rate:
    """Sliding window rate counter with periodic reset."""
    count: int = 0
    window_start: float = field(default_factory=time.time)
    window_seconds: float = 60.0
    lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def inc(self):
        with self.lock:
            self.count += 1

    def get_rate(self) -> float:
        """Get requests per second over the current window."""
        with self.lock:
            elapsed = time.time() - self.window_start
            if elapsed >= self.window_seconds:
                rate = self.count / max(elapsed, 0.001)
                self.count = 0
                self.window_start = time.time()
            else:
                rate = self.count / max(elapsed, 0.001)
            return round(rate, 2)


class _APIMetrics:
    """Per-API metrics: counters + latency histogram."""

    def __init__(self):
        self.success_count = _Counter()
        self.fail_count = _Counter()
        self.files_processed = _Counter()
        self.lines_extracted = _Counter()
        self.latency = _Histogram()
        self.lock = threading.Lock()  # for batch-level access

    def record_success(self, files: int = 1, lines: int = 0):
        self.success_count.inc()
        self.files_processed.inc(files)
        self.lines_extracted.inc(lines)

    def record_fail(self):
        self.fail_count.inc()


class MetricsEngine:
    """Central stats engine — all services record here."""

    def __init__(self):
        # Global counters
        self.total_requests = _Counter()
        self.total_files_processed = _Counter()
        self.total_lines_extracted = _Counter()
        self.total_errors = _Counter()
        self.total_batch_files = _Counter()

        # OCR-specific
        self.ocr_success_count = _Counter()
        self.ocr_fail_count = _Counter()
        self.pdf_processed = _Counter()
        self.pdf_pages_processed = _Counter()

        # Latency histograms
        self.latency_global = _Histogram()
        self.latency_ocr = _Histogram()
        self.latency_pdf = _Histogram()

        # Rates
        self.rps_global = _Rate(window_seconds=60.0)
        self.rps_ocr = _Rate(window_seconds=60.0)

        # Live per-second counters (reset every tick)
        self._live_lock = threading.Lock()
        self._live_requests_last_sec = 0
        self._live_errors_last_sec = 0
        self._live_lines_last_sec = 0

        # ── Per-API registries ─────────────────────
        self._api_lock = threading.Lock()
        self._apis: dict[str, _APIMetrics] = {
            "ocr": _APIMetrics(),
            "pdf": _APIMetrics(),
            "export": _APIMetrics(),
        }

    @property
    def api_ocr(self) -> _APIMetrics:
        return self._apis["ocr"]

    @property
    def api_pdf(self) -> _APIMetrics:
        return self._apis["pdf"]

    @property
    def api_export(self) -> _APIMetrics:
        return self._apis["export"]

    def record_request(self, endpoint: str = "global", latency_ms: float = 0.0):
        """Record a completed request."""
        self.total_requests.inc()
        self.rps_global.inc()
        self.latency_global.record(latency_ms)
        with self._live_lock:
            self._live_requests_last_sec += 1
            if endpoint == "ocr":
                self.ocr_success_count.inc()
                self.rps_ocr.inc()
                self.latency_ocr.record(latency_ms)

    def record_file(self, lines_extracted: int = 0):
        self.total_files_processed.inc()
        with self._live_lock:
            self._live_lines_last_sec += lines_extracted

    def record_error(self):
        self.total_errors.inc()
        with self._live_lock:
            self._live_errors_last_sec += 1

    def record_batch(self, file_count: int):
        self.total_batch_files.inc(file_count)
        with self._live_lock:
            self._live_requests_last_sec += file_count

    def record_ocr_success(self, lines: int = 0):
        self.ocr_success_count.inc()
        self.total_lines_extracted.inc(lines)
        self.pdf_processed.inc(1)
        with self._live_lock:
            self._live_lines_last_sec += lines

    def record_pdf_pages(self, count: int):
        self.pdf_pages_processed.inc(count)

    @property
    def live_stats(self) -> dict:
        """Return current live stats snapshot."""
        import torch
        import psutil
        now = time.time()

        gpu_mem_used = 0.0
        gpu_mem_total = 0.0
        if torch.cuda.is_available():
            try:
                gpu_mem_used = torch.cuda.memory_allocated() / (1024 ** 3)
                gpu_mem_total = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
            except Exception:
                pass

        with self._live_lock:
            live_reqs = self._live_requests_last_sec
            live_errs = self._live_errors_last_sec
            live_lines = self._live_lines_last_sec

        # CPU / RAM usage
        try:
            ram = psutil.virtual_memory()
            mem_used_gb = ram.used / (1024 ** 3)
            mem_total_gb = ram.total / (1024 ** 3)
            cpu_percent = ram.percent
        except Exception:
            mem_used_gb = 0.0
            mem_total_gb = 0.0
            cpu_percent = 0.0

        from engine.loader import _models_loaded, _device
        from config import CACHE_ENABLED, RATE_LIMIT_ENABLED

        return {
            "uptime_seconds": round(now - self._start_time if hasattr(self, "_start_time") else 0, 1),
            "total_requests": self.total_requests.count,
            "total_files_processed": self.total_files_processed.count,
            "total_lines_extracted": self.total_lines_extracted.count,
            "total_errors": self.total_errors.count,
            # Live per-second (approximate, from the last recorded batch)
            "live_reqs_last_sec": live_reqs,
            "live_errors_last_sec": live_errs,
            "live_lines_last_sec": live_lines,
            "requests_per_second": round(self.rps_global.get_rate(), 2),
            "ocr_requests_per_second": round(self.rps_ocr.get_rate(), 2),
            # Latency
            "latency": self.latency_global.stats,
            "latency_ocr": self.latency_ocr.stats,
            # OCR specific
            "ocr_success": self.ocr_success_count.count,
            "ocr_failures": self.ocr_fail_count.count,
            "pdf_pages_processed": self.pdf_pages_processed.count,
            "pdf_documents": self.pdf_processed.count,
            # GPU
            "cuda_available": torch.cuda.is_available(),
            "gpu_memory_used_gb": round(gpu_mem_used, 2),
            "gpu_memory_total_gb": round(gpu_mem_total, 2),
            # CPU / RAM
            "memory_used_gb": round(mem_used_gb, 2),
            "memory_total_gb": round(mem_total_gb, 2),
            "cpu_percent": round(cpu_percent, 1),
            # State
            "models_loaded": _models_loaded if "_models_loaded" in dir() else False,
            "device": str(_device) if "_device" in dir() and _device else None,
            "cache_enabled": CACHE_ENABLED,
            "rate_limiting_enabled": RATE_LIMIT_ENABLED,
            # Per-API stats (live)
            "per_api": self.per_api_stats,
        }

    def reset_live_counters(self):
        """Reset live per-second counters for next interval."""
        with self._live_lock:
            self._live_requests_last_sec = 0
            self._live_errors_last_sec = 0
            self._live_lines_last_sec = 0

    def get_api_stats(self, api_name: str) -> dict | None:
        """Get live per-API stats snapshot."""
        api = self._apis.get(api_name)
        if not api:
            return None
        return {
            "api": api_name,
            "success_count": api.success_count.count,
            "fail_count": api.fail_count.count,
            "files_processed": api.files_processed.count,
            "lines_extracted": api.lines_extracted.count,
            "latency": api.latency.stats,
        }

    @property
    def per_api_stats(self) -> dict:
        """Get all per-API stats."""
        return {
            name: self.get_api_stats(name)
            for name in self._apis
        }


# Module-level singleton
_metrics_engine: MetricsEngine | None = None

def get_metrics() -> MetricsEngine:
    global _metrics_engine
    if _metrics_engine is None:
        _metrics_engine = MetricsEngine()
        _metrics_engine._start_time = time.time()
    return _metrics_engine


def record_request(endpoint: str = "global", latency_ms: float = 0.0):
    """Convenience function to record a request."""
    get_metrics().record_request(endpoint, latency_ms)

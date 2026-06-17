"""Processing history service — tracks all OCR/PDF operations with metadata.

Stores processing events in-memory with TTL-based eviction. Provides:
- Recent operations log
- Per-file operation details (time, lines, confidence, etc.)
- Aggregated stats over time windows
"""

from __future__ import annotations

import time
import threading
from collections import deque
from typing import Any


class ProcessingHistory:
    """Thread-safe in-memory history of OCR processing operations."""

    def __init__(self, max_entries: int = 500, ttl_seconds: int = 3600):
        self._max_entries = max_entries
        self._ttl = ttl_seconds
        self._lock = threading.Lock()
        self._entries: deque[dict[str, Any]] = deque(maxlen=max_entries)

    def record(
        self,
        operation: str,  # "ocr_single", "ocr_batch", "pdf_ocr", "export", etc.
        filename: str,
        status: str = "success",
        lines_detected: int = 0,
        processing_time_ms: float = 0.0,
        confidence_mean: float | None = None,
        confidence_min: float | None = None,
        language: str | None = None,
        document_type: str | None = None,
        file_size_kb: float = 0.0,
        device: str = "unknown",
    ):
        """Record a processing operation."""
        entry = {
            "id": f"evt_{int(time.time() * 1000)}_{len(self._entries)}",
            "timestamp": time.time(),
            "operation": operation,
            "filename": filename,
            "status": status,
            "lines_detected": lines_detected,
            "processing_time_ms": round(processing_time_ms, 2),
            "confidence_mean": round(confidence_mean, 4) if confidence_mean is not None else None,
            "confidence_min": round(confidence_min, 4) if confidence_min is not None else None,
            "language": language,
            "document_type": document_type,
            "file_size_kb": round(file_size_kb, 2),
            "device": device,
        }

        with self._lock:
            self._entries.append(entry)

    def get_recent(self, limit: int = 50) -> list[dict[str, Any]]:
        """Get the most recent entries, oldest first."""
        with self._lock:
            all_entries = list(self._entries)

        # Filter out expired entries
        cutoff = time.time() - self._ttl
        valid = [e for e in all_entries if e["timestamp"] >= cutoff]

        return valid[-limit:]

    def get_by_operation(self, operation: str, limit: int = 50) -> list[dict[str, Any]]:
        """Get recent entries filtered by operation type."""
        recent = self.get_recent(200)
        return [e for e in reversed(recent) if e["operation"] == operation][:limit]

    def get_stats(self) -> dict[str, Any]:
        """Get aggregated stats from history."""
        with self._lock:
            all_entries = list(self._entries)

        cutoff = time.time() - self._ttl
        valid = [e for e in all_entries if e["timestamp"] >= cutoff]

        total = len(valid)
        by_status: dict[str, int] = {}
        by_operation: dict[str, int] = {}
        total_lines = 0
        total_time = 0.0

        for entry in valid:
            status = entry.get("status", "unknown")
            op = entry.get("operation", "unknown")
            by_status[status] = by_status.get(status, 0) + 1
            by_operation[op] = by_operation.get(op, 0) + 1
            total_lines += entry.get("lines_detected", 0)
            total_time += entry.get("processing_time_ms", 0)

        avg_time = total_time / max(total, 1)
        avg_conf: float | None = None
        conf_values = [e["confidence_mean"] for e in valid if e.get("confidence_mean")]
        if conf_values:
            avg_conf = round(sum(conf_values) / len(conf_values), 4)

        return {
            "total_operations": total,
            "by_status": by_status,
            "by_operation": by_operation,
            "total_lines_extracted": total_lines,
            "total_processing_time_ms": round(total_time, 2),
            "avg_processing_time_ms": round(avg_time, 2),
            "avg_confidence": avg_conf,
            "unique_files": len(set(e["filename"] for e in valid)),
            "time_window_seconds": self._ttl,
        }

    def clear(self):
        """Clear all history entries."""
        with self._lock:
            self._entries.clear()


# Module-level singleton
_history = ProcessingHistory()


def get_history() -> ProcessingHistory:
    return _history


def record_operation(**kwargs):
    _history.record(**kwargs)

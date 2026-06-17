"""Thread-safe progress tracking for long-running tasks.

Stores per-page OCR progress so the frontend can poll or subscribe to updates
even when pages are processed in a single blocking call inside an executor.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field


@dataclass
class TaskProgress:
    """Holds runtime progress for a long-running task."""
    task_id: str
    total_pages: int = 0
    pages_completed: int = 0
    started_at: float = field(default_factory=time.perf_counter)
    last_page_time_ms: float = 0.0  # time taken to process the last page

    @property
    def percentage(self) -> float:
        if self.total_pages == 0:
            return 0.0
        return (self.pages_completed / self.total_pages) * 100

    @property
    def elapsed_seconds(self) -> float:
        return time.perf_counter() - self.started_at

    @property
    def eta_seconds(self) -> float:
        """Estimated seconds remaining based on average page time."""
        if self.pages_completed == 0 or self.last_page_time_ms == 0:
            return 0.0
        avg_ms = (self.elapsed_seconds * 1000) / self.pages_completed
        remaining = self.total_pages - self.pages_completed
        return (avg_ms * remaining) / 1000

    @property
    def pages_remaining(self) -> int:
        return max(0, self.total_pages - self.pages_completed)


class ProgressTracker:
    """Thread-safe registry of active task progress."""

    def __init__(self):
        self._lock = threading.Lock()
        self._tasks: dict[str, TaskProgress] = {}

    def register(self, task_id: str, total_pages: int) -> TaskProgress:
        """Register a new task and return its progress object."""
        with self._lock:
            tp = TaskProgress(task_id=task_id, total_pages=total_pages)
            self._tasks[task_id] = tp
            return tp

    def update_page(self, task_id: str, pages_completed: int, last_page_ms: float):
        """Mark that a page (or batch of pages) was completed."""
        with self._lock:
            tp = self._tasks.get(task_id)
            if tp is not None:
                tp.pages_completed = pages_completed
                tp.last_page_time_ms = last_page_ms

    def get(self, task_id: str) -> TaskProgress | None:
        with self._lock:
            return self._tasks.get(task_id)

    def remove(self, task_id: str):
        with self._lock:
            self._tasks.pop(task_id, None)

    def all_running(self) -> list[TaskProgress]:
        with self._lock:
            return list(self._tasks.values())


# Module-level singleton
_progress_tracker = ProgressTracker()


def get_progress_tracker() -> ProgressTracker:
    return _progress_tracker

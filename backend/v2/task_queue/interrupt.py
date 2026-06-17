"""Thread-safe interrupt tracking for long-running OCR operations."""

from __future__ import annotations

import threading
from typing import Dict


class InterruptTracker:
    """Track per-task interruption events for synchronous loops."""

    def __init__(self):
        self._lock = threading.Lock()
        self._events: Dict[str, threading.Event] = {}

    def create_interrupt(self, task_id: str) -> threading.Event:
        """Create a new interrupt event and store it by task_id."""
        with self._lock:
            ev = threading.Event()
            self._events[task_id] = ev
            return ev

    def cancel(self, task_id: str) -> bool:
        """Signal the interrupt event for a task. Returns True if found and set."""
        with self._lock:
            ev = self._events.get(task_id)
            if ev is not None:
                ev.set()
                return True
            return False

    def is_cancelled(self, task_id: str) -> bool:
        """Check if a task has been cancelled."""
        with self._lock:
            ev = self._events.get(task_id)
            return ev.is_set() if ev else False

    def remove(self, task_id: str):
        """Remove the interrupt event for a completed or expired task."""
        with self._lock:
            self._events.pop(task_id, None)


# Module-level singleton
_interrupt_tracker = InterruptTracker()


def get_interrupt_tracker() -> InterruptTracker:
    return _interrupt_tracker

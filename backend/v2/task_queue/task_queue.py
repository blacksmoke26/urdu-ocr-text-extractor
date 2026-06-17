"""Background task queue for long-running OCR operations."""

from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Optional


class TaskStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class _TaskRecord:
    task_id: str
    status: TaskStatus = TaskStatus.PENDING
    progress: float = 0.0  # 0-100
    result: Any = None
    error_message: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    completed_at: Optional[float] = None
    filename: str = ""

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "status": self.status.value,
            "progress": round(self.progress, 1),
            "filename": self.filename,
            "created_at": self.created_at,
            "completed_at": self.completed_at,
            "processing_time_ms": round((self.completed_at or time.time()) - self.created_at, 3) * 1000 if self.status != TaskStatus.PENDING else None,
        }


class TaskQueue:
    """In-memory async task queue for background OCR jobs."""

    def __init__(self, max_tasks: int = 50, cleanup_after_seconds: float = 3600):
        self._tasks: dict[str, _TaskRecord] = {}
        self.max_tasks = max_tasks
        self.cleanup_after = cleanup_after_seconds
        self._semaphore = asyncio.Semaphore(4)  # Max concurrent tasks

    def create_task(self, filename: str = "") -> str:
        """Create a new task record and return its ID."""
        task_id = uuid.uuid4().hex[:12]
        self._tasks[task_id] = _TaskRecord(task_id=task_id, filename=filename)
        return task_id

    def get_task(self, task_id: str) -> Optional[_TaskRecord]:
        return self._tasks.get(task_id)

    def update_progress(self, task_id: str, progress: float):
        if task_id in self._tasks:
            self._tasks[task_id].progress = min(progress, 100)

    def complete_task(self, task_id: str, result: Any = None):
        if task_id in self._tasks:
            t = self._tasks[task_id]
            t.status = TaskStatus.COMPLETED
            t.result = result
            t.progress = 100.0
            t.completed_at = time.time()

    def fail_task(self, task_id: str, error: str):
        if task_id in self._tasks:
            t = self._tasks[task_id]
            t.status = TaskStatus.FAILED
            t.error_message = error
            t.progress = 0.0
            t.completed_at = time.time()

    def cancel_task(self, task_id: str):
        if task_id in self._tasks:
            t = self._tasks[task_id]
            t.status = TaskStatus.CANCELLED
            t.completed_at = time.time()

    async def execute(self, task_id: str, coro_func: Callable, *args, **kwargs):
        """Execute a coroutine as a background task with progress tracking."""
        async with self._semaphore:
            if task_id not in self._tasks:
                return

            t = self._tasks[task_id]
            t.status = TaskStatus.PROCESSING
            t.progress = 10.0

            try:
                result = await coro_func(*args, **kwargs)
                t.progress = 90.0
                t.result = result
                self.complete_task(task_id)
            except Exception as e:
                self.fail_task(task_id, str(e))
                raise
            finally:
                if task_id in self._tasks and self._tasks[task_id].status != TaskStatus.COMPLETED:
                    pass  # handled above

    def get_all_tasks(self) -> list[_TaskRecord]:
        return list(self._tasks.values())

    def cleanup_stale(self):
        """Remove tasks older than cleanup_after."""
        now = time.time()
        stale = [tid for tid, t in self._tasks.items() if (now - t.created_at) > self.cleanup_after and t.status != TaskStatus.PENDING]
        for tid in stale:
            del self._tasks[tid]

    @property
    def stats(self) -> dict:
        counts = {s.value: 0 for s in TaskStatus}
        for t in self._tasks.values():
            counts[t.status.value] += 1
        return {
            "total_tasks": len(self._tasks),
            "by_status": counts,
            "active_slots": 4,
            "max_concurrent": 4,
        }


# Module-level singleton
_task_queue: Optional[TaskQueue] = None


def get_task_queue() -> TaskQueue:
    global _task_queue
    if _task_queue is None:
        _task_queue = TaskQueue()
    return _task_queue

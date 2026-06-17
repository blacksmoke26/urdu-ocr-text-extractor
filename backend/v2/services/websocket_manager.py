"""WebSocket connection manager — broadcast hub for real-time stats streaming."""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Optional

from starlette.websockets import WebSocket


class _Subscription:
    def __init__(self, ws: WebSocket):
        self.ws = ws
        self.subscribed_at = time.time()
        self.alive = True


class WebSocketManager:
    """Manages WebSocket connections and broadcasts live stats to subscribers."""

    def __init__(self, broadcast_interval: float = 1.0):
        self._subscribers: list[_Subscription] = []
        self._broadcast_interval = broadcast_interval
        self._broadcast_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()
        # Task-specific subscribers for PDF extraction / OCR
        self._task_subscribers: dict[str, list[WebSocket]] = {}
        self._task_lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        sub = _Subscription(ws)
        async with self._lock:
            self._subscribers.append(sub)

    async def disconnect(self, ws: WebSocket) -> None:
        # Also clean up task-specific subscriptions
        async with self._task_lock:
            for tid in list(self._task_subscribers.keys()):
                subs = [w for w in self._task_subscribers[tid] if w == ws]
                for s in subs:
                    self._task_subscribers[tid].remove(s)
                if not self._task_subscribers[tid]:
                    del self._task_subscribers[tid]
        async with self._lock:
            for sub in list(self._subscribers):
                if sub.ws == ws:
                    sub.alive = False
                    self._subscribers.remove(sub)
                    break

    async def subscribe_task(self, task_id: str, ws: WebSocket) -> None:
        """Subscribe a WebSocket to a specific task's progress events."""
        async with self._task_lock:
            if task_id not in self._task_subscribers:
                self._task_subscribers[task_id] = []
            self._task_subscribers[task_id].append(ws)

    async def unsubscribe_task(self, task_id: str, ws: WebSocket) -> None:
        """Unsubscribe a WebSocket from a specific task."""
        async with self._task_lock:
            if task_id in self._task_subscribers:
                if ws in self._task_subscribers[task_id]:
                    self._task_subscribers[task_id].remove(ws)
                if not self._task_subscribers[task_id]:
                    del self._task_subscribers[task_id]

    async def broadcast_to_task(self, task_id: str, data: dict[str, Any]) -> None:
        """Send a progress event to all subscribers of a specific task."""
        payload = json.dumps(data, ensure_ascii=False)
        async with self._task_lock:
            subs = list(self._task_subscribers.get(task_id, []))
        for sub_ws in subs:
            try:
                await sub_ws.send_text(payload)
            except Exception:
                async with self._task_lock:
                    if task_id in self._task_subscribers:
                        if sub_ws in self._task_subscribers[task_id]:
                            self._task_subscribers[task_id].remove(sub_ws)
                        if not self._task_subscribers[task_id]:
                            del self._task_subscribers[task_id]

    async def broadcast(self, data: dict[str, Any]) -> None:
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        async with self._lock:
            dead = []
            for sub in list(self._subscribers):
                if not sub.alive:
                    dead.append(sub)
                    continue
                try:
                    await sub.ws.send_bytes(payload)
                except Exception:
                    sub.alive = False
                    dead.append(sub)
            for sub in dead:
                self._subscribers.remove(sub)

    async def start_broadcast(self, metrics_getter):
        """Start the background broadcast loop. `metrics_getter` is a callable returning live stats."""
        if self._broadcast_task and not self._broadcast_task.done():
            return  # already running
        self._broadcast_task = asyncio.create_task(self._broadcast_loop(metrics_getter))

    async def _broadcast_loop(self, metrics_getter):
        while True:
            try:
                stats = metrics_getter()
                await self.broadcast({"type": "stats", "data": stats})
            except Exception:
                pass  # silently ignore broadcast errors
            await asyncio.sleep(self._broadcast_interval)

    @property
    def subscriber_count(self) -> int:
        return len([s for s in self._subscribers if s.alive])


# Module-level singleton
_ws_manager: Optional[WebSocketManager] = None


def get_ws_manager() -> WebSocketManager:
    global _ws_manager
    if _ws_manager is None:
        _ws_manager = WebSocketManager(broadcast_interval=1.0)
    return _ws_manager

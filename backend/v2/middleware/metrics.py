"""Middleware — auto-instruments every request with latency + metric recording."""

from __future__ import annotations

import time
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class MetricsMiddleware(BaseHTTPMiddleware):
    """Records request latency and counts for the metrics engine on every request."""

    def __init__(self, app, endpoint_label: Optional[list[str]] = None):
        super().__init__(app)
        self.endpoint_label = endpoint_label or []  # label specific endpoints
        self.default_label = "global"

    async def dispatch(self, request: Request, call_next) -> Response:
        t0 = time.perf_counter()
        response = await call_next(request)
        latency_ms = (time.perf_counter() - t0) * 1000

        # Determine endpoint label
        path = request.url.path
        label = self.default_label
        for ep in self.endpoint_label:
            if path.startswith(ep):
                label = ep.strip("/")
                break

        from engine.metrics import record_request, get_metrics

        record_request(endpoint=label, latency_ms=latency_ms)

        # Attach latency to response headers for debugging
        response.headers["X-Processing-Time-Ms"] = str(round(latency_ms, 2))

        return response


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Attaches a unique request ID header to every response."""

    async def dispatch(self, request: Request, call_next) -> Response:
        import uuid
        request_id = f"req_{uuid.uuid4().hex[:10]}"
        request.state.request_id = request_id

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


class LiveStatsResetMiddleware(BaseHTTPMiddleware):
    """Periodically resets live per-second counters (every 60s approx)."""
    # This is a no-op middleware — it's used to ensure the app processes requests normally.
    async def dispatch(self, request: Request, call_next) -> Response:
        return await call_next(request)

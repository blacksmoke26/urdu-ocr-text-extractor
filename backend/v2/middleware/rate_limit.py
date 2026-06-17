"""Sliding-window rate limiting middleware for FastAPI."""

from __future__ import annotations

import time
from collections import defaultdict
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple in-memory sliding window rate limiter."""

    def __init__(self, app, max_requests: int = 60, window_seconds: int = 60, exclude_paths: list[str] | None = None):
        super().__init__(app)
        self.max_requests = max_requests
        self.window = window_seconds
        self._requests: dict[str, list[float]] = defaultdict(list)
        self._exclude_paths = set(exclude_paths or [])

    async def dispatch(self, request: Request, call_next) -> Response:
        key = request.client.host if request.client else "unknown"

        # Skip rate limiting for excluded paths (e.g. progress polling)
        path = request.url.path
        for ep in self._exclude_paths:
            if path.startswith(ep):
                return await call_next(request)

        now = time.time()
        window_start = now - self.window

        # Prune old entries
        self._requests[key] = [t for t in self._requests[key] if t > window_start]

        if len(self._requests[key]) >= self.max_requests:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Rate limit exceeded",
                    "retry_after_seconds": round(self.window - (now - self._requests[key][0]), 1),
                },
                headers={"Retry-After": str(int(self.window))},
            )

        self._requests[key].append(now)
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(self.max_requests)
        response.headers["X-RateLimit-Remaining"] = str(max(0, self.max_requests - len(self._requests[key])))
        response.headers["X-RateLimit-Window"] = str(self.window)
        return response

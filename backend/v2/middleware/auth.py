"""API key authentication middleware for FastAPI."""

from __future__ import annotations

import time
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response


class AuthMiddleware(BaseHTTPMiddleware):
    """Validates API keys from the X-API-Key header or query param."""

    def __init__(self, app, api_keys: list[str], path_whitelist: Optional[list[str]] = None):
        super().__init__(app)
        self.api_keys = set(api_keys)
        self.path_whitelist = path_whitelist or [
            "/docs", "/openapi.json", "/redoc", "/health", "/healthcheck",
            "/metrics", "/favicon.ico", "/api/health", "/api/stats",
        ]

    async def dispatch(self, request: Request, call_next) -> Response:
        # Skip whitelisted paths
        if request.url.path in self.path_whitelist:
            return await call_next(request)

        # Extract API key
        api_key = (
            request.headers.get("x-api-key")
            or request.query_params.get("api_key")
            or request.query_params.get("X-API-Key")
        )

        if not api_key:
            return JSONResponse(
                status_code=401,
                content={"detail": "API key required. Provide via X-API-Key header or ?api_key= query param."},
            )

        if api_key not in self.api_keys:
            return JSONResponse(
                status_code=403,
                content={"detail": "Invalid API key."},
            )

        # Attach request_id for logging
        request.state.request_id = f"req_{int(time.time() * 1000)}"
        return await call_next(request)

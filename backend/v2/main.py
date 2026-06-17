"""
v2 Urdu OCR FastAPI application.

Usage:
    cd backend
    ./start-server.sh

Or directly:
    uvicorn v2.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload
"""

import sys
import os
from pathlib import Path

# Ensure the current directory (v2/) is on PYTHONPATH so we can
# import sibling modules (config, engine, middleware, etc.) regardless of cwd.
v2_dir = str(Path(__file__).resolve().parent)
if v2_dir not in sys.path:
    sys.path.insert(0, v2_dir)

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import (
    CORS_ORIGINS,
    AUTH_ENABLED,
    RATE_LIMIT_ENABLED,
    RATE_LIMIT_REQUESTS,
    RATE_LIMIT_WINDOW,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown hooks."""
    # Import here to ensure sys.path is set
    from middleware.logging import setup_logging
    from engine.loader import load_models
    from config import validate_config

    # Setup logging
    logger = setup_logging()
    logger.info("Starting Urdu OCR v2 backend ...")

    # Initialize metrics engine
    from engine.metrics import get_metrics
    metrics = get_metrics()

    # WebSocket broadcast init
    from services.websocket_manager import get_ws_manager as _get_ws_manager
    ws_mgr = _get_ws_manager()
    await ws_mgr.start_broadcast(lambda: metrics.live_stats)

    # Validate configuration
    warnings = validate_config()
    for w in warnings:
        logger.warning(w)

    # Load OCR models
    try:
        load_models()
        logger.info("Urdu OCR v2 backend started successfully.")
    except Exception as e:
        logger.error(f"Failed to load models: {e}")
        raise

    yield

    # Shutdown cleanup
    logger.info("Shutting down Urdu OCR v2 backend ...")


# ── App Factory ─────────────────────────────────────────────────────

def create_app() -> FastAPI:
    app = FastAPI(
        title="End-to-End Urdu OCR",
        description="Production-grade Urdu document text extraction using UTRNet + YOLOv8 — v2",
        version="2.1.0",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Rate limiting middleware
    if RATE_LIMIT_ENABLED:
        from middleware.rate_limit import RateLimitMiddleware
        app.add_middleware(
            RateLimitMiddleware,
            max_requests=RATE_LIMIT_REQUESTS,
            window_seconds=RATE_LIMIT_WINDOW,
            exclude_paths=["/api/v2/progress/"],
        )

    # Auth middleware
    if AUTH_ENABLED:
        from config import API_KEYS
        from middleware.auth import AuthMiddleware
        app.add_middleware(AuthMiddleware, api_keys=API_KEYS)

    # Metrics auto-instrumentation middleware
    from middleware.metrics import MetricsMiddleware
    app.add_middleware(
        MetricsMiddleware,
        endpoint_label=["/api/v2/ocr", "/api/v2/pdf"],
    )

    # Request ID middleware
    from middleware.metrics import RequestIdMiddleware
    app.add_middleware(RequestIdMiddleware)

    # Include routers
    from routes import ocr_router, pdf_router, export_router, system_router, realtime_router

    app.include_router(ocr_router)
    app.include_router(pdf_router)
    app.include_router(export_router)
    app.include_router(system_router)
    app.include_router(realtime_router)

    return app


app = create_app()

# Mount static files for docs assets if needed
STATIC_DIR = Path(__file__).parent / "static"
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

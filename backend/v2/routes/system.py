"""System API routes for v2 backend (health, stats, device, cache)."""

from __future__ import annotations

import time
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from config import DEFAULT_DEVICE

system_router = APIRouter(prefix="/api/v2", tags=["System"])


@system_router.get(
    "/health",
    summary="Health check",
    description="Check if OCR models are loaded and the service is ready.",
)
async def health_check():
    from engine.loader import _models_loaded, _device

    import torch
    gpu_mem_used = 0.0
    gpu_mem_total = 0.0
    if torch.cuda.is_available():
        gpu_mem_used = torch.cuda.memory_allocated() / (1024 ** 3)
        gpu_mem_total = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)

    return JSONResponse({
        "status": "healthy",
        "service": "Urdu OCR v2",
        "version": "2.1.0",
        "device": str(_device) if _models_loaded else "uninitialized",
        "default_device": DEFAULT_DEVICE,
        "cuda_available": torch.cuda.is_available(),
        "models_loaded": _models_loaded,
        "gpu_memory_used_gb": round(gpu_mem_used, 2),
        "gpu_memory_total_gb": round(gpu_mem_total, 2),
    })


@system_router.get(
    "/stats",
    summary="Usage statistics",
    description="Get live usage stats with metrics engine data.",
)
async def get_stats():
    from engine.metrics import get_metrics

    metrics = get_metrics()
    return JSONResponse(metrics.live_stats)


@system_router.post(
    "/device/switch",
    summary="Switch compute device",
    description="Switch between CPU and CUDA and reload models.",
)
async def switch_device(device: str = ""):
    from engine.loader import reload_models

    if device == "":
        requested = None  # auto-detect
    elif device not in ("cpu", "cuda"):
        return JSONResponse(
            status_code=400,
            content={"detail": "Device must be 'cpu', 'cuda', or empty for auto."},
        )
    else:
        requested = device

    try:
        metadata = reload_models(requested)
        return JSONResponse({"status": "ok", **metadata})
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": f"Failed to switch device: {e}"})


@system_router.get(
    "/cache/stats",
    summary="Cache statistics",
    description="Get cache hit/miss stats and entry count.",
)
async def get_cache_stats():
    from services.ocr_service import get_ocr_service
    svc = get_ocr_service()
    return JSONResponse({"cache": svc.cache.stats})


@system_router.post(
    "/cache/clear",
    summary="Clear cache",
    description="Clear all cached OCR results.",
)
async def clear_cache():
    from services.ocr_service import get_ocr_service
    svc = get_ocr_service()
    svc.cache.clear()
    return JSONResponse({"status": "ok", "message": "Cache cleared"})


@system_router.get(
    "/config",
    summary="Get server configuration",
    description="Return the current running configuration.",
)
async def get_config():
    import config as cfg

    return JSONResponse({
        "server": {
            "host": cfg.HOST,
            "port": cfg.PORT,
            "workers": cfg.WORKERS,
        },
        "model": {
            "default_device": cfg.DEFAULT_DEVICE,
            "conf_threshold": cfg.DEFAULT_CONF_THRESHOLD,
            "img_size": cfg.DEFAULT_IMG_SIZE,
        },
        "limits": {
            "max_file_size_mb": cfg.MAX_FILE_SIZE_MB,
            "max_batch_files": cfg.MAX_BATCH_FILES,
            "rate_limit_requests": cfg.RATE_LIMIT_REQUESTS,
            "rate_limit_window_sec": cfg.RATE_LIMIT_WINDOW,
        },
        "features": {
            "cache_enabled": cfg.CACHE_ENABLED,
            "cache_ttl_seconds": cfg.CACHE_TTL_SECONDS,
            "rate_limiting_enabled": cfg.RATE_LIMIT_ENABLED,
            "authentication_enabled": cfg.AUTH_ENABLED,
            "text_cleaning_enabled": cfg.TEXT_CLEANING_ENABLED,
        },
    })

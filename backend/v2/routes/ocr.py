"""OCR API routes for v2 backend."""

from __future__ import annotations

import io
import time
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Query
from fastapi.responses import JSONResponse

from config import (
    DEFAULT_CONF_THRESHOLD,
    DEFAULT_IMG_SIZE,
    MAX_BATCH_FILES,
    MAX_FILE_SIZE_MB,
    ALLOWED_IMAGE_EXTENSIONS,
    THUMB_WIDTH,
    THUMB_HEIGHT,
)
from engine.loader import load_models
from engine.metrics import get_metrics
from services.ocr_service import OCRService
from services.cache_service import ResultCache
from utils.file_utils import get_file_ext, validate_extension
from utils.image_utils import enhance_image, validate_file_size

# ── Router ────────────────────────────────────────────────────────

ocr_router = APIRouter(prefix="/api/v2", tags=["OCR"])

_ocr_service: Optional[OCRService] = None
_cache: Optional[ResultCache] = None


def _get_service() -> OCRService:
    global _ocr_service, _cache
    if _ocr_service is None:
        _cache = ResultCache(enabled=True, ttl_seconds=3600)
        _ocr_service = OCRService(cache=_cache)
    return _ocr_service


# ── Helpers ─────────────────────────────────────────────────────────

def _read_file(file: UploadFile) -> bytes:
    content = file.file.read() if hasattr(file.file, "read") else file.file.getvalue()
    if isinstance(content, (bytes, bytearray)):
        return bytes(content)
    return content


def _check_size_and_ext(file: UploadFile) -> tuple[bytes, str]:
    """Validate size and extension, return (data_bytes, ext)."""
    ext = get_file_ext(file.filename or "")

    # Extension check
    allowed = ALLOWED_IMAGE_EXTENSIONS | {"pdf"}
    valid, msg = validate_extension(file.filename or "", allowed)
    if not valid:
        raise HTTPException(status_code=400, detail=msg)

    data = _read_file(file)
    ok, msg = validate_file_size(data, MAX_FILE_SIZE_MB)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)

    return data, ext


# ── Endpoints ───────────────────────────────────────────────────────

@ocr_router.post(
    "/ocr",
    summary="Batch OCR (multi-file)",
    description="Upload one or more images/PDFs for text extraction.",
)
async def batch_ocr_endpoint(
    files: list[UploadFile] = File(..., description="Image or PDF files"),
    conf_threshold: float = Form(DEFAULT_CONF_THRESHOLD),
    img_size: int = Form(DEFAULT_IMG_SIZE),
    use_cache: bool = Form(True),
    text_cleaning: str = Form("true"),  # "true", "false", or JSON dict string
):
    load_models()

    ocr_svc = _get_service()

    # Parse text_cleaning
    if text_cleaning == "false":
        clean_opts = False
    elif text_cleaning == "true":
        clean_opts = True
    else:
        import json
        try:
            clean_opts = json.loads(text_cleaning)
            # Enable autocorrect if requested via text_cleaning options
            if isinstance(clean_opts, dict) and clean_opts.get("autocorrect"):
                clean_opts["autocorrect_mode"] = clean_opts.get("autocorrect_mode", "char")
        except Exception:
            clean_opts = True

    # Validate batch size
    if len(files) > MAX_BATCH_FILES:
        raise HTTPException(status_code=400, detail=f"Max {MAX_BATCH_FILES} files per batch.")

    results = []
    total_time = 0.0
    completed = 0
    failed = 0
    total_lines_in_batch = 0

    metrics = get_metrics()

    for file in files:
        t_start = time.perf_counter()
        filename = file.filename or "unnamed"
        data_bytes, ext = _check_size_and_ext(file)

        try:
            if ext == "pdf":
                page_results = ocr_svc.ocr_pdf_pages(
                    pdf_data=io.BytesIO(data_bytes),
                    filename=filename,
                    conf_threshold=conf_threshold,
                    img_size=img_size,
                    text_cleaning=clean_opts,
                    use_cache=use_cache,
                )
                for pr in page_results:
                    result_dict = pr.to_dict()
                    result_dict["page_number"] = len(results) + 1
                    results.append(result_dict)
            else:
                result = ocr_svc.ocr_image(
                    image_bytes=io.BytesIO(data_bytes),
                    filename=filename,
                    conf_threshold=conf_threshold,
                    img_size=img_size,
                    text_cleaning=clean_opts,
                    use_cache=use_cache,
                )
                # Generate thumbnail for the source image
                from PIL import Image as _Image
                img = _Image.open(io.BytesIO(data_bytes))
                img_resized = img.resize((THUMB_WIDTH, THUMB_HEIGHT), _Image.Resampling.LANCZOS)
                thumb_buf = io.BytesIO()
                img_resized.save(thumb_buf, format="PNG")
                import base64 as _b64
                result_dict = result.to_dict()
                result_dict["thumb_image_b64"] = _b64.b64encode(thumb_buf.getvalue()).decode("utf-8")
                result_dict["thumb_width"] = THUMB_WIDTH
                result_dict["thumb_height"] = THUMB_HEIGHT
                results.append(result_dict)

            completed += 1
            total_lines_in_batch += results[-1].get("detected_lines", 0)
        except Exception as e:
            failed += 1
            results.append({
                "filename": filename,
                "status": "error",
                "message": str(e),
                "processing_time_ms": round((time.perf_counter() - t_start) * 1000, 2),
            })

        total_time += time.perf_counter() - t_start

    # Record per-API metrics for this batch
    if completed > 0:
        metrics.api_ocr.record_success(files=completed, lines=total_lines_in_batch)
    if failed > 0:
        metrics.api_ocr.record_fail()
    latency_ms = total_time
    metrics.latency_global.record(latency_ms)
    metrics.latency_ocr.record(latency_ms)
    metrics.total_requests.inc(completed + failed)
    metrics.rps_global.inc()
    if completed > 0:
        metrics.rps_ocr.inc()
        metrics.ocr_success_count.inc(completed)

    return JSONResponse({
        "task_id": f"batch_{int(time.time())}",
        "total_files": len(files),
        "completed": completed,
        "failed": failed,
        "processing_time_ms": round(total_time * 1000, 2),
        "cache_stats": ocr_svc.cache.stats if _cache else None,
        "thumb_width": THUMB_WIDTH,
        "thumb_height": THUMB_HEIGHT,
        "results": results,
    })


@ocr_router.post(
    "/ocr/single",
    summary="Single image OCR with detailed output",
    description="Process a single image with full confidence data and export options.",
)
async def single_ocr_endpoint(
    file: UploadFile = File(...),
    conf_threshold: float = Form(DEFAULT_CONF_THRESHOLD),
    img_size: int = Form(DEFAULT_IMG_SIZE),
    text_cleaning: str = Form("true"),
):
    load_models()

    filename = file.filename or "unnamed"
    data_bytes, ext = _check_size_and_ext(file)

    ocr_svc = _get_service()

    if text_cleaning == "false":
        clean_opts = False
    elif text_cleaning == "true":
        clean_opts = True
    else:
        import json
        try:
            clean_opts = json.loads(text_cleaning)
            # Enable autocorrect if requested via text_cleaning options
            if isinstance(clean_opts, dict) and clean_opts.get("autocorrect"):
                clean_opts["autocorrect_mode"] = clean_opts.get("autocorrect_mode", "char")
        except Exception:
            clean_opts = True

    t_start = time.perf_counter()

    result = ocr_svc.ocr_image(
        image_bytes=io.BytesIO(data_bytes),
        filename=filename,
        conf_threshold=conf_threshold,
        img_size=img_size,
        text_cleaning=clean_opts,
    )

    # Generate thumbnail for the source image (always enabled with config defaults)
    from PIL import Image as _Image
    img = _Image.open(io.BytesIO(data_bytes))
    img_resized = img.resize((THUMB_WIDTH, THUMB_HEIGHT), _Image.Resampling.LANCZOS)
    thumb_buf = io.BytesIO()
    img_resized.save(thumb_buf, format="PNG")
    import base64 as _b64
    thumb_image_b64 = _b64.b64encode(thumb_buf.getvalue()).decode("utf-8")

    elapsed = (time.perf_counter() - t_start) * 1000

    response_data = result.to_dict()
    response_data["processing_time_ms"] = round(elapsed, 2)
    response_data["task_id"] = f"single_{int(time.time())}"
    response_data["cache_stats"] = ocr_svc.cache.stats if _cache else None
    response_data["thumb_image_b64"] = thumb_image_b64
    response_data["thumb_width"] = THUMB_WIDTH
    response_data["thumb_height"] = THUMB_HEIGHT

    # Record per-API metrics
    metrics = get_metrics()
    metrics.latency_global.record(elapsed)
    metrics.latency_ocr.record(elapsed)
    metrics.total_requests.inc()
    metrics.rps_global.inc()
    metrics.rps_ocr.inc()
    metrics.api_ocr.record_success(files=1, lines=result.detected_lines)
    metrics.ocr_success_count.inc()

    return JSONResponse(response_data)


@ocr_router.post(
    "/ocr/with-enhance",
    summary="OCR with image enhancement options",
    description="Process an image with optional preprocessing enhancements.",
)
async def enhanced_ocr_endpoint(
    file: UploadFile = File(...),
    conf_threshold: float = Form(DEFAULT_CONF_THRESHOLD),
    img_size: int = Form(DEFAULT_IMG_SIZE),
    auto_contrast: bool = Form(False),
    sharpen: bool = Form(False),
    denoise: bool = Form(False),
    normalize_background: bool = Form(False),
    brightness: Optional[float] = Form(None),
    contrast: Optional[float] = Form(None),
):
    load_models()

    filename = file.filename or "unnamed"
    data_bytes, ext = _check_size_and_ext(file)

    ocr_svc = _get_service()
    t_start = time.perf_counter()

    enhanced_img = enhance_image(
        io.BytesIO(data_bytes),
        options={
            "auto_contrast": auto_contrast,
            "sharpen": sharpen,
            "denoise": denoise,
            "normalize_background": normalize_background,
            "brightness": brightness,
            "contrast": contrast,
        },
    )

    from engine.pipeline import run_ocr_pipeline
    result = run_ocr_pipeline(enhanced_img, f"{filename}_enhanced", ext, conf_threshold, img_size)

    # Generate thumbnail (always enabled with config defaults)
    from PIL import Image as _Image
    img = _Image.open(io.BytesIO(data_bytes))
    img_resized = img.resize((THUMB_WIDTH, THUMB_HEIGHT), _Image.Resampling.LANCZOS)
    thumb_buf = io.BytesIO()
    img_resized.save(thumb_buf, format="PNG")
    import base64 as _b64
    thumb_image_b64 = _b64.b64encode(thumb_buf.getvalue()).decode("utf-8")

    elapsed = (time.perf_counter() - t_start) * 1000

    response_data = result.to_dict()
    response_data["processing_time_ms"] = round(elapsed, 2)
    response_data["task_id"] = f"enhanced_{int(time.time())}"
    response_data["thumb_image_b64"] = thumb_image_b64
    response_data["thumb_width"] = THUMB_WIDTH
    response_data["thumb_height"] = THUMB_HEIGHT

    # Record per-API metrics
    metrics = get_metrics()
    metrics.latency_global.record(elapsed)
    metrics.latency_ocr.record(elapsed)
    metrics.total_requests.inc()
    metrics.rps_global.inc()
    metrics.rps_ocr.inc()
    metrics.api_ocr.record_success(files=1, lines=result.detected_lines)
    metrics.ocr_success_count.inc()

    return JSONResponse(response_data)


@ocr_router.post(
    "/ocr/direct-tensor",
    summary="OCR with direct tensor input (advanced)",
    description="Pass raw image bytes with advanced options for programmatic use.",
)
async def direct_ocr_endpoint(
    file: UploadFile = File(...),
    conf_threshold: float = Form(DEFAULT_CONF_THRESHOLD),
    img_size: int = Form(DEFAULT_IMG_SIZE),
):
    """Direct OCR without caching or text cleaning — pure pipeline."""
    load_models()

    filename = file.filename or "unnamed"
    data_bytes, ext = _check_size_and_ext(file)

    from engine.pipeline import run_ocr_pipeline
    from PIL import Image

    image = Image.open(io.BytesIO(data_bytes)).convert("RGB")
    result = run_ocr_pipeline(image, filename, ext, conf_threshold, img_size)

    # Generate thumbnail (always enabled with config defaults)
    img_resized = image.resize((THUMB_WIDTH, THUMB_HEIGHT), Image.Resampling.LANCZOS)
    thumb_buf = io.BytesIO()
    img_resized.save(thumb_buf, format="PNG")
    import base64 as _b64
    thumb_image_b64 = _b64.b64encode(thumb_buf.getvalue()).decode("utf-8")

    # Record metrics
    metrics = get_metrics()
    metrics.latency_global.record(result.processing_time_ms / 1000)
    metrics.latency_ocr.record(result.processing_time_ms / 1000)
    metrics.total_requests.inc()
    metrics.rps_global.inc()
    metrics.rps_ocr.inc()
    metrics.api_ocr.record_success(files=1, lines=result.detected_lines)

    response = {
        "task_id": f"direct_{int(time.time())}",
        "filename": filename,
        "file_type": ext,
        "status": "success",
        "detected_lines": result.detected_lines,
        "full_text": result.full_text,
        "lines": [l.to_dict() for l in result.lines],
        "annotated_image_b64": result.annotated_image_b64,
        "processing_time_ms": round(result.processing_time_ms, 2),
        "confidence_stats": result.confidence_stats,
        "thumb_image_b64": thumb_image_b64,
        "thumb_width": THUMB_WIDTH,
        "thumb_height": THUMB_HEIGHT,
    }
    return JSONResponse(response)

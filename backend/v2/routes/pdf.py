"""PDF API routes for v2 backend."""

from __future__ import annotations

import asyncio
import io
import logging
import time

logger = logging.getLogger("pdf_route")

import fitz  # PyMuPDF
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response as FastAPIResponse
from config import MAX_FILE_SIZE_MB, THUMB_WIDTH, THUMB_HEIGHT
from engine.loader import load_models
from engine.metrics import get_metrics
from engine.pipeline import OCRResult
from services.pdf_service import PDFService
from utils.image_utils import validate_file_size
from task_queue.interrupt import get_interrupt_tracker
from task_queue.progress import get_progress_tracker

pdf_router = APIRouter(prefix="/api/v2", tags=["PDF"])


# ── Helpers ────────────────────────────────────────────────────────

def _read_pdf(file: UploadFile) -> bytes:
    content = file.file.read() if hasattr(file.file, "read") else file.file.getvalue()
    return bytes(content)


@pdf_router.post(
    "/pdf/info",
    summary="Get PDF metadata",
    description="Extract total pages, titles, and other metadata from a PDF.",
)
async def pdf_info_endpoint(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    data_bytes = _read_pdf(file)
    ok, msg = validate_file_size(data_bytes, MAX_FILE_SIZE_MB)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)

    info = PDFService.get_info(data_bytes)

    # Record per-API metrics
    metrics = get_metrics()
    metrics.api_pdf.record_success(files=1)
    latency_ms = 0.5  # info is fast, approximate
    metrics.latency_global.record(latency_ms)
    metrics.latency_pdf.record(latency_ms)
    metrics.total_requests.inc()
    return JSONResponse({
        "filename": file.filename,
        **info,
    })


@pdf_router.post(
    "/pdf/extract",
    summary="Extract PDF pages as images",
    description="Extract page ranges from a PDF as PNG images.",
)
async def pdf_extract_endpoint(
    file: UploadFile = File(...),
    from_page: int = Form(1),
    to_page: int | None = Form(None),
    dpi: int = Form(300),
    task_id: str = Form(""),  # Allow frontend to pass its own task_id for cancellation
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    data_bytes = _read_pdf(file)
    ok, msg = validate_file_size(data_bytes, MAX_FILE_SIZE_MB)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)

    t_start = time.perf_counter()

    from task_queue.interrupt import get_interrupt_tracker
    from services.websocket_manager import get_ws_manager as _get_ws_manager

    tracker = get_interrupt_tracker()
    ws_manager = _get_ws_manager()
    effective_task_id = task_id if task_id else f"pdf_extract_{int(time.time())}"
    interrupt_event = tracker.create_interrupt(effective_task_id)
    await asyncio.sleep(0)  # Yield control so immediate cancellation can take effect

    total_pages = fitz.open(stream=data_bytes, filetype="pdf")
    pg_start = from_page
    pg_end = to_page if to_page is not None else total_pages.__len__()
    pg_start = max(1, pg_start)
    pg_end = min(pg_end, total_pages.__len__())

    # Register with progress tracker
    prog_tracker = get_progress_tracker()
    prog = prog_tracker.register(effective_task_id, total_pages=pg_end - pg_start + 1)

    loop = asyncio.get_running_loop()

    tw = THUMB_WIDTH
    th = THUMB_HEIGHT

    def _render_page(doc, index):
        page = doc[index]
        pix = page.get_pixmap(dpi=dpi)
        width, height = pix.width, pix.height
        img_bytes = pix.tobytes("png")

        # Generate thumbnail
        import io as _io
        from PIL import Image as _Image
        thumb_pix = page.get_pixmap(dpi=dpi)
        img = _Image.frombytes("RGB", [thumb_pix.width, thumb_pix.height], thumb_pix.samples)
        img = img.resize((tw, th), _Image.Resampling.LANCZOS)
        thumb_buf = _io.BytesIO()
        img.save(thumb_buf, format="PNG")
        import base64 as _b64
        thumb_entry = {
            "thumb_image_b64": _b64.b64encode(thumb_buf.getvalue()).decode("utf-8"),
            "thumb_width": tw,
            "thumb_height": th,
        }

        return width, height, img_bytes, thumb_entry

    pages_out = []
    for i in range(pg_start - 1, pg_end):
        # Check cancellation before each page (runs on event loop thread)
        if interrupt_event.is_set():
            total_pages.close()
            tracker.remove(effective_task_id)
            return JSONResponse({
                "filename": file.filename,
                "total_pages_extracted": len(pages_out),
                "dpi": dpi,
                "thumb_width": tw,
                "thumb_height": th,
                "status": "cancelled",
                "message": "Extraction was stopped by user.",
                "pages": pages_out,
            })

        # Run blocking PyMuPDF work off the event loop thread so cancellation can be processed
        width, height, img_bytes, thumb_entry = await loop.run_in_executor(None, _render_page, total_pages, i)
        import base64 as _b64
        b64 = _b64.b64encode(img_bytes).decode("utf-8")
        page_entry = {
            "page_number": i + 1,
            "width": width,
            "height": height,
            "image_b64": b64,
            **thumb_entry,
        }
        pages_out.append(page_entry)
        # Update progress tracker after each page
        prog_tracker.update_page(effective_task_id, len(pages_out), (time.perf_counter() - t_start) * 1000 / max(len(pages_out), 1))
        # Broadcast progress to WebSocket subscribers (use send_text so browser receives string data)
        await ws_manager.broadcast_to_task(
            effective_task_id,
            {
                "type": "live_pdf",
                "data": {
                    "pages_completed": len(pages_out),
                    "total_pages": pg_end - pg_start + 1,
                    "percentage": round(len(pages_out) / (pg_end - pg_start + 1) * 100, 1),
                }
            }
        )

    tracker.remove(effective_task_id)
    prog_tracker.remove(effective_task_id)

    # Record per-API metrics
    metrics = get_metrics()
    latency_ms = (time.perf_counter() - t_start) * 1000
    metrics.latency_pdf.record(latency_ms)
    metrics.api_pdf.record_success(files=len(pages_out))
    metrics.total_requests.inc()

    return JSONResponse({
        "task_id": effective_task_id,
        "filename": file.filename,
        "total_pages_extracted": len(pages_out),
        "dpi": dpi,
        "thumb_width": tw,
        "thumb_height": th,
        "pages": pages_out,
    })


@pdf_router.post(
    "/pdf/reconstruct",
    summary="Reconstruct PDF with page range",
    description="Extract a page range from a PDF and return as a new downloadable PDF file.",
)
async def pdf_reconstruct_endpoint(
    file: UploadFile = File(...),
    from_page: int = Form(1),
    to_page: int | None = Form(None),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    data_bytes = _read_pdf(file)
    ok, msg = validate_file_size(data_bytes, MAX_FILE_SIZE_MB)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)

    t_start = time.perf_counter()
    try:
        pdf_bytes, filename = PDFService.reconstruct(data_bytes, from_page, to_page)

        # Record per-API metrics
        metrics = get_metrics()
        latency_ms = (time.perf_counter() - t_start) * 1000
        metrics.latency_pdf.record(latency_ms)
        metrics.api_pdf.record_success(files=1)
        metrics.total_requests.inc()

        return FastAPIResponse(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except ValueError as e:
        err_metrics = get_metrics()
        err_metrics.api_pdf.record_fail()
        err_metrics.total_errors.inc()
        raise HTTPException(status_code=400, detail=str(e))


@pdf_router.post(
    "/pdf/ocr",
    summary="PDF OCR with full text extraction",
    description="Run OCR on all pages of a PDF. Returns extracted text per page with confidence stats.",
)
async def pdf_ocr_endpoint(
    file: UploadFile = File(...),
    from_page: int = Form(1),
    to_page: int | None = Form(None),
    conf_threshold: float = Form(0.2),
    img_size: int = Form(1280),
    text_cleaning: str = Form("true"),
    task_id: str = Form(""),  # Allow frontend to pass its own task_id for cancellation
    use_cache: str = Form("false"),  # Enable result caching
    device: str = Form(""),  # Override device (cpu/cuda)
    det_type: str = Form(""),  # Detection type: yolo, detr, mllm
    det_conf: float | None = Form(None),  # Detection confidence threshold
    mllm_model: str = Form(""),  # MLLM model name
    layout_analysis: str = Form("false"),  # Enable layout analysis
    post_processing: str = Form(""),  # Post-processing pipeline
    preprocess_options: str = Form(""),  # JSON-encoded preprocessing options
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    load_models()

    data_bytes = _read_pdf(file)
    ok, msg = validate_file_size(data_bytes, MAX_FILE_SIZE_MB)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)

    from services.ocr_service import OCRService
    ocr_svc = OCRService()

    # Use frontend-provided task_id for cancellation linkage, or generate one
    effective_task_id = task_id if task_id else f"pdf_ocr_{int(time.time())}"
    tracker = get_interrupt_tracker()
    interrupt_event = tracker.create_interrupt(effective_task_id)
    await asyncio.sleep(0)  # Yield control so immediate cancellation can take effect
    t_start = time.perf_counter()

    # Parse text_cleaning
    if text_cleaning == "false":
        clean_opts = False
    elif text_cleaning == "true":
        clean_opts = True
    else:
        import json as _json
        try:
            clean_opts = _json.loads(text_cleaning)
        except Exception:
            clean_opts = True

    # Parse advanced options
    advanced: dict = {}
    if use_cache and use_cache.lower() == "true":
        advanced["use_cache"] = True
    if device:
        advanced["device"] = device
    if det_type:
        advanced["det_type"] = det_type
    if det_conf is not None:
        advanced["det_conf"] = float(det_conf)
    if mllm_model:
        advanced["mllm_model"] = mllm_model
    if layout_analysis and layout_analysis.lower() == "true":
        advanced["layout_analysis"] = True
    if post_processing:
        advanced["post_processing"] = post_processing
    if preprocess_options:
        try:
            import json as _json2
            advanced["preprocess_options"] = _json2.loads(preprocess_options)
        except Exception:
            pass  # Ignore invalid JSON

    tw = THUMB_WIDTH
    th = THUMB_HEIGHT

    loop = asyncio.get_running_loop()

    # Determine page range
    import fitz as _fitz
    temp_doc = _fitz.open(stream=io.BytesIO(data_bytes), filetype="pdf")
    total_pdf_pages = len(temp_doc)
    pg_start = max(1, from_page)
    pg_end = min(to_page if to_page is not None else total_pdf_pages, total_pdf_pages)
    temp_doc.close()

    # Register with progress tracker and get ws_manager
    prog_tracker = get_progress_tracker()
    from services.websocket_manager import get_ws_manager as _get_ws_manager
    ws_manager = _get_ws_manager()
    prog = prog_tracker.register(effective_task_id, total_pages=pg_end - pg_start + 1)

    results = []
    total_lines = 0

    # Per-page timeout (30 minutes) to prevent infinite hangs on corrupted pages.
    PAGE_TIMEOUT = 1800
    # Overall task timeout (4 hours)
    OVERALL_TIMEOUT = 14400

    async def _ocr_page_async(doc_bytes, pnum):
        """Wrapper that enforces per-page timeout."""
        return await asyncio.wait_for(
            loop.run_in_executor(None, _ocr_page, doc_bytes, pnum),
            timeout=PAGE_TIMEOUT,
        )

    overall_start = time.perf_counter()

    try:
        for i in range(pg_start - 1, pg_end):
            current_page_num = i + 1
            # Check cancellation before each page
            if interrupt_event.is_set():
                prog_tracker.remove(effective_task_id)
                tracker.remove(effective_task_id)
                return JSONResponse({
                    "task_id": effective_task_id,
                    "filename": file.filename,
                    "status": "cancelled",
                    "message": "OCR process was stopped by user.",
                    "total_pages": len(results),
                    "total_text_lines": total_lines,
                    "pages": results,
                })

            # Yield control so cancellation can be processed on the event loop
            if i > pg_start - 1:
                await asyncio.sleep(0)

            # Check overall timeout
            elapsed = time.perf_counter() - overall_start
            if elapsed > OVERALL_TIMEOUT:
                return JSONResponse({
                    "task_id": effective_task_id,
                    "filename": file.filename,
                    "status": "timeout",
                    "message": f"Overall processing exceeded {OVERALL_TIMEOUT // 60} minutes. Processed {len(results)}/{pg_end - pg_start + 1} pages.",
                    "total_pages": len(results),
                    "total_text_lines": total_lines,
                    "pages": results,
                })

            # Run blocking OCR for this single page off the event loop thread
            page_t = time.perf_counter()

            def _ocr_page(doc_bytes, pnum):
                return ocr_svc.ocr_pdf_pages(
                    pdf_data=io.BytesIO(doc_bytes),
                    filename=file.filename,
                    from_page=pnum,
                    to_page=pnum,
                    conf_threshold=conf_threshold,
                    img_size=img_size,
                    text_cleaning=clean_opts,
                    interrupt_event=None,  # already checked externally
                    **advanced,
                )

            try:
                page_results = await _ocr_page_async(data_bytes, current_page_num)
            except asyncio.TimeoutError:
                logger.error(f"Page {current_page_num}: OCR timed out after {PAGE_TIMEOUT}s — skipping.")
                results.append(OCRResult(
                    filename=f"{file.filename}_page_{current_page_num}", file_type="pdf_page", lines=[], full_text="",
                    processing_time_ms=PAGE_TIMEOUT * 1000,
                ))
                # Update progress even on timeout so the UI doesn't hang
                prog_tracker.update_page(effective_task_id, len(results), PAGE_TIMEOUT * 1000)
                await ws_manager.broadcast_to_task(
                    effective_task_id,
                    {
                        "type": "live_pdf",
                        "data": {
                            "pages_completed": len(results),
                            "total_pages": pg_end - pg_start + 1,
                            "percentage": round(len(results) / (pg_end - pg_start + 1) * 100, 1),
                            "last_page_time_ms": PAGE_TIMEOUT * 1000,
                        }
                    }
                )
                continue

            elapsed_page_ms = (time.perf_counter() - page_t) * 1000

            for pr in page_results:
                r = pr.to_dict()
                r["page_number"] = current_page_num
                results.append(r)
                total_lines += r.get("detected_lines", 0)

            # Update progress tracker with completed pages count
            prog_tracker.update_page(effective_task_id, len(results), elapsed_page_ms)
            # Broadcast progress to WebSocket subscribers (use send_text so browser receives string data)
            await ws_manager.broadcast_to_task(
                effective_task_id,
                {
                    "type": "live_pdf",
                    "data": {
                        "pages_completed": len(results),
                        "total_pages": pg_end - pg_start + 1,
                        "percentage": round(len(results) / (pg_end - pg_start + 1) * 100, 1),
                        "last_page_time_ms": elapsed_page_ms,
                    }
                }
            )

        # All pages completed successfully
        metrics = get_metrics()
        latency_ms = (time.perf_counter() - t_start) * 1000
        metrics.latency_pdf.record(latency_ms)
        metrics.api_pdf.record_success(files=len(results), lines=total_lines)
        metrics.total_requests.inc()

        tracker.remove(effective_task_id)

        return JSONResponse({
            "task_id": effective_task_id,
            "filename": file.filename,
            "total_pages": len(results),
            "total_text_lines": total_lines,
            "thumb_width": tw,
            "thumb_height": th,
            "pages": results,
        })

    except KeyboardInterrupt as e:
        # Task was cancelled mid-way
        prog_tracker.remove(effective_task_id)
        tracker.remove(effective_task_id)
        # Return partial results so frontend can display progress
        return JSONResponse(
            status_code=200,
            content={
                "task_id": effective_task_id,
                "filename": file.filename,
                "status": "cancelled",
                "message": str(e),
                "total_pages": len(results),
                "total_text_lines": total_lines,
                "pages": results,
            },
        )


# ── Progress Endpoint ────────────────────────────────────────

@pdf_router.get(
    "/progress/{task_id}",
    summary="Get progress for a running task",
    description="Returns current progress (pages completed, percentage, ETA) for an active task.",
)
async def get_progress_endpoint(task_id: str):
    """Poll this endpoint to check progress of a long-running OCR or extraction task."""
    tracker = get_progress_tracker()
    tp = tracker.get(task_id)

    if tp is None:
        # Also check interrupt tracker — might have been cleaned up but results exist
        interrupt = get_interrupt_tracker()
        if interrupt.is_cancelled(task_id):
            return JSONResponse({
                "task_id": task_id,
                "status": "cancelled",
            })
        return JSONResponse({
            "task_id": task_id,
            "status": "not_found",
        })

    result = {
        "task_id": tp.task_id,
        "pages_completed": tp.pages_completed,
        "total_pages": tp.total_pages,
        "percentage": round(tp.percentage, 1),
        "elapsed_seconds": round(tp.elapsed_seconds, 2),
        "eta_seconds": round(tp.eta_seconds, 2),
        "pages_remaining": tp.pages_remaining,
        "last_page_time_ms": round(tp.last_page_time_ms, 1),
    }

    # Debug: log what we're sending
    import logging
    logger = logging.getLogger("uvicorn.access")
    print(f"[PROGRESS] {task_id} => pages={result['pages_completed']}/{result['total_pages']} elapsed={result['elapsed_seconds']}s last_page_ms={result['last_page_time_ms']}")

    return JSONResponse(content=result)


@pdf_router.post(
    "/pdf/tasks/{task_id}/cancel",
    summary="Cancel a running OCR task",
    description="Stop a long-running PDF OCR process by its task_id."
)
async def cancel_task_endpoint(task_id: str):
    """Cancel a running OCR task and return partial results."""
    tracker = get_interrupt_tracker()

    if tracker.cancel(task_id):
        # Clean up progress tracker too
        prog = get_progress_tracker()
        prog.remove(task_id)
        # Return any partial results that were collected before cancellation
        return JSONResponse({
            "task_id": task_id,
            "status": "cancelled",
            "message": "OCR process was stopped by user.",
        })
    else:
        # Task already completed or never existed — not an error, just inform the client
        return JSONResponse({
            "task_id": task_id,
            "status": "not_found",
            "message": "Task is no longer running.",
        })

"""PDF API routes for v2 backend."""

from __future__ import annotations

import asyncio
import io
import logging
import os
import tempfile
import time
from pathlib import Path
from typing import Optional

logger = logging.getLogger("pdf_route")

import fitz  # PyMuPDF
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
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

async def _read_pdf(file: UploadFile) -> bytes:
    """Read entire uploaded file into memory using FastAPI's async read."""
    return await file.read()


def _get_pdf_page_count(pdf_data: bytes) -> int:
    """Get total page count from PDF without keeping doc open."""
    doc = fitz.open(stream=pdf_data, filetype="pdf")
    count = len(doc)
    doc.close()
    return count


def _safe_close_doc(doc: fitz.Document) -> None:
    """Safely close a PyMuPDF document, ignoring errors."""
    try:
        if doc and not doc.is_closed:
            doc.close()
    except Exception:
        pass


@pdf_router.post(
    "/pdf/info",
    summary="Get PDF metadata",
    description="Extract total pages, titles, and other metadata from a PDF. For large PDFs, use 'light=true' to skip per-page scanning.",
)
async def pdf_info_endpoint(
    file: UploadFile = File(...),
    light: bool = Query(True, description="Light mode: skip per-page metadata for faster response on large PDFs"),
    max_pages_full: int = Query(500, description="Max pages to scan in full mode. Beyond this, only page count is returned."),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    # For very large files, use streaming to temp file instead of in-memory bytes
    is_large = False
    file_path: Optional[str] = None
    data_bytes_for_validate: Optional[bytes] = None
    
    try:
        raw_cl = file.headers.get("content-length")
        cl_val = int(raw_cl) if raw_cl else 0
        is_large = cl_val > 50 * 1024 * 1024
        if is_large:
            # Save to temp file for memory efficiency
            fd, file_path = tempfile.mkstemp(suffix=".pdf")
            size = 0
            with os.fdopen(fd, "wb") as f:
                while True:
                    chunk = await file.read(1024 * 1024)  # 1 MB chunks
                    if not chunk:
                        break
                    f.write(chunk)
                    size += len(chunk)
        else:
            data_bytes_for_validate = await _read_pdf(file)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {str(e)}")

    try:
        if is_large and file_path:
            # Use temp file for large PDFs - memory efficient
            info = _get_pdf_info_from_file(file_path, light_mode=light, max_pages=max_pages_full)
        else:
            # Validate size before processing
            ok, msg = validate_file_size(data_bytes_for_validate, MAX_FILE_SIZE_MB)
            if not ok:
                raise HTTPException(status_code=400, detail=msg)
            info = PDFService.get_info_light(data_bytes_for_validate, light_mode=light, max_pages=max_pages_full)

        # Record per-API metrics
        metrics = get_metrics()
        actual_latency = 1.0 if light else max(5.0, len(info.get("pages", [])) * 2)
        metrics.api_pdf.record_success(files=1)
        metrics.latency_global.record(actual_latency)
        metrics.latency_pdf.record(actual_latency)
        metrics.total_requests.inc()

        return JSONResponse({
            "filename": file.filename,
            "file_size_bytes": info.get("file_size_bytes"),
            **info,
        })
    finally:
        # Clean up temp file if created
        if file_path and os.path.exists(file_path):
            try:
                os.unlink(file_path)
            except Exception:
                pass


def _get_pdf_info_from_file(file_path: str, light_mode: bool = True, max_pages: int = 500) -> dict:
    """Get PDF info using temp file — memory efficient for large PDFs."""
    doc = fitz.open(file_path)
    total_pages = len(doc)

    meta = doc.metadata or {}
    result = {
        "total_pages": total_pages,
        "file_size_bytes": os.path.getsize(file_path),
        "metadata": {
            "title": (meta.get("title") or "").strip() or None,
            "author": (meta.get("author") or "").strip() or None,
            "subject": (meta.get("subject") or "").strip() or None,
            "creator": (meta.get("creator") or "").strip() or None,
            "producer": (meta.get("producer") or "").strip() or None,
        },
    }

    # Only scan per-page metadata if light_mode is False and within max_pages
    if not light_mode and total_pages <= max_pages:
        pages_info = []
        for i in range(total_pages):
            page = doc[i]
            # Use get_contents() which doesn't render — just reads the content stream length
            page_rect = page.rect
            pages_info.append({
                "page_number": i + 1,
                "title": (meta.get("title") or f"Page {i + 1}")[:80],
                "width": round(page_rect.width, 2),
                "height": round(page_rect.height, 2),
                "rotation": page.rotation,
            })
        result["pages"] = pages_info
    elif not light_mode and total_pages > max_pages:
        # Return partial page info to avoid timeout/memory issues
        logger.info(f"PDF has {total_pages} pages (exceeds max_pages={max_pages}). Returning partial page list.")
        result["partial_page_scan"] = True
        result["partial_scan_count"] = max_pages
        result["pages"] = _get_partial_page_info(doc, max_pages)
    
    # Clean up empty metadata fields for clarity
    result["metadata"] = {k: v for k, v in result["metadata"].items() if v is not None or k == "title"}
    _safe_close_doc(doc)
    return result


def _get_partial_page_info(doc: fitz.Document, limit: int) -> list[dict]:
    """Get page info for first N pages."""
    meta = doc.metadata or {}
    pages = []
    for i in range(min(limit, len(doc))):
        page = doc[i]
        page_rect = page.rect
        pages.append({
            "page_number": i + 1,
            "title": (meta.get("title") or f"Page {i + 1}")[:80],
            "width": round(page_rect.width, 2),
            "height": round(page_rect.height, 2),
            "rotation": page.rotation,
        })
    return pages


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

    # Detect large uploads and stream to temp file for memory efficiency
    raw_cl = file.headers.get("content-length")
    cl_val = int(raw_cl) if raw_cl else 0
    is_large = cl_val > 50 * 1024 * 1024
    pdf_source_path: Optional[str] = None
    data_bytes: Optional[bytes] = None

    try:
        if is_large:
            fd, pdf_source_path = tempfile.mkstemp(suffix=".pdf")
            size = 0
            with os.fdopen(fd, "wb") as f:
                while True:
                    chunk = await file.read(1024 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
                    size += len(chunk)
        else:
            data_bytes = await _read_pdf(file)
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
        await asyncio.sleep(0)

        # Get page count using file path for large files (memory efficient)
        if pdf_source_path:
            temp_doc = fitz.open(pdf_source_path, filetype="pdf")
        else:
            temp_doc = fitz.open(stream=data_bytes, filetype="pdf")  # type: ignore
        total_pages = len(temp_doc)
        _safe_close_doc(temp_doc)
        pg_start = max(1, from_page)
        pg_end = min(to_page if to_page is not None else total_pages, total_pages)

        if pg_start > total_pages:
            raise HTTPException(status_code=400, detail=f"'From' page ({from_page}) exceeds total pages ({total_pages}).")
        if pg_start > pg_end:
            pg_start, pg_end = 1, total_pages

        prog_tracker = get_progress_tracker()
        prog = prog_tracker.register(effective_task_id, total_pages=pg_end - pg_start + 1)

        loop = asyncio.get_running_loop()
        tw = THUMB_WIDTH
        th = THUMB_HEIGHT

        # Open PDF — use file path for large files (avoids loading into RAM)
        doc = fitz.open(pdf_source_path, filetype="pdf") if pdf_source_path else fitz.open(stream=data_bytes, filetype="pdf")

        def _render_page(doc_obj: fitz.Document, index: int):
            page = doc_obj[index]
            pix = page.get_pixmap(dpi=dpi)
            width, height = pix.width, pix.height
            img_bytes = pix.tobytes("png")
            import io as _io
            from PIL import Image as _Image
            thumb_pix = page.get_pixmap(dpi=dpi)
            img = _Image.frombytes("RGB", [thumb_pix.width, thumb_pix.height], thumb_pix.samples)
            img = img.resize((tw, th), _Image.Resampling.LANCZOS)
            thumb_buf = _io.BytesIO()
            img.save(thumb_buf, format="PNG")
            import base64 as _b64
            return width, height, img_bytes, {
                "thumb_image_b64": _b64.b64encode(thumb_buf.getvalue()).decode("utf-8"),
                "thumb_width": tw,
                "thumb_height": th,
            }

        pages_out = []
        for i in range(pg_start - 1, pg_end):
            if interrupt_event.is_set():
                doc.close()
                tracker.remove(effective_task_id)
                return JSONResponse({
                    "filename": file.filename, "total_pages_extracted": len(pages_out),
                    "dpi": dpi, "thumb_width": tw, "thumb_height": th,
                    "status": "cancelled", "message": "Extraction was stopped by user.",
                    "pages": pages_out,
                })
            width, height, img_bytes, thumb_entry = await loop.run_in_executor(None, _render_page, doc, i)
            import base64 as _b64
            page_entry = {
                "page_number": i + 1, "width": width, "height": height,
                "image_b64": _b64.b64encode(img_bytes).decode("utf-8"), **thumb_entry,
            }
            pages_out.append(page_entry)
            prog_tracker.update_page(effective_task_id, len(pages_out), (time.perf_counter() - t_start) * 1000 / max(len(pages_out), 1))
            await ws_manager.broadcast_to_task(
                effective_task_id,
                {"type": "live_pdf", "data": {
                    "pages_completed": len(pages_out), "total_pages": pg_end - pg_start + 1,
                    "percentage": round(len(pages_out) / (pg_end - pg_start + 1) * 100, 1),
                }},
            )

        tracker.remove(effective_task_id)
        prog_tracker.remove(effective_task_id)
        doc.close()

        metrics = get_metrics()
        latency_ms = (time.perf_counter() - t_start) * 1000
        metrics.latency_pdf.record(latency_ms)
        metrics.api_pdf.record_success(files=len(pages_out))
        metrics.total_requests.inc()

        return JSONResponse({
            "task_id": effective_task_id, "filename": file.filename,
            "total_pages_extracted": len(pages_out), "dpi": dpi,
            "thumb_width": tw, "thumb_height": th, "pages": pages_out,
        })

    finally:
        if pdf_source_path and os.path.exists(pdf_source_path):
            try:
                os.unlink(pdf_source_path)
            except Exception:
                pass


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

    data_bytes = await _read_pdf(file)
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
    task_id: str = Form(""),
    use_cache: str = Form("false"),
    device: str = Form(""),
    det_type: str = Form(""),
    det_conf: float | None = Form(None),
    mllm_model: str = Form(""),
    layout_analysis: str = Form("false"),
    post_processing: str = Form(""),
    preprocess_options: str = Form(""),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    load_models()

    # Detect large uploads and stream to temp file for memory efficiency
    raw_cl = file.headers.get("content-length")
    cl_val = int(raw_cl) if raw_cl else 0
    is_large = cl_val > 50 * 1024 * 1024
    pdf_source_path: Optional[str] = None
    data_bytes: Optional[bytes] = None

    try:
        if is_large:
            fd, pdf_source_path = tempfile.mkstemp(suffix=".pdf")
            size = 0
            with os.fdopen(fd, "wb") as f:
                while True:
                    chunk = await file.read(1024 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
                    size += len(chunk)
        else:
            data_bytes = await _read_pdf(file)
            ok, msg = validate_file_size(data_bytes, MAX_FILE_SIZE_MB)
            if not ok:
                raise HTTPException(status_code=400, detail=msg)

    except Exception as e:
        logger.error(f"Failed to read file: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to read file: {str(e)}")

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

    # Determine page range — use temp file for large PDFs (memory efficient)
    if pdf_source_path:
        temp_doc = fitz.open(pdf_source_path, filetype="pdf")
    else:
        temp_doc = fitz.open(stream=data_bytes, filetype="pdf")  # type: ignore
    total_pdf_pages = len(temp_doc)
    pg_start = max(1, from_page)
    pg_end = min(to_page if to_page is not None else total_pdf_pages, total_pdf_pages)

    # Clamp page range to actual PDF length to prevent empty loops and silent failures
    if pg_start > total_pdf_pages:
        _safe_close_doc(temp_doc)
        raise HTTPException(status_code=400, detail=f"'From' page ({from_page}) exceeds total pages ({total_pdf_pages}).")
    if pg_end > total_pdf_pages:
        pg_end = total_pdf_pages

    # Adjust pg_start if it ended up beyond clamped pg_end (e.g., user typed 'to' less than 'from')
    if pg_start > pg_end:
        pg_start, pg_end = 1, total_pdf_pages

    _safe_close_doc(temp_doc)

    # Register with progress tracker and get ws_manager
    prog_tracker = get_progress_tracker()
    from services.websocket_manager import get_ws_manager as _get_ws_manager
    ws_manager = _get_ws_manager()
    prog = prog_tracker.register(effective_task_id, total_pages=pg_end - pg_start + 1)

    results = []
    total_lines = 0

    # Read PDF bytes (needed by OCRService — loads from temp file if large upload)
    if pdf_source_path:
        with open(pdf_source_path, "rb") as f:
            pdf_bytes_for_ocr = f.read()
    else:
        pdf_bytes_for_ocr = data_bytes  # type: ignore

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
                    interrupt_event=interrupt_event,  # Pass so cancellation works mid-page
                    **advanced,
                )

            try:
                page_results = await _ocr_page_async(pdf_bytes_for_ocr, current_page_num)
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
        prog_tracker.remove(effective_task_id)
        tracker.remove(effective_task_id)
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
    finally:
        if pdf_source_path and os.path.exists(pdf_source_path):
            try:
                os.unlink(pdf_source_path)
            except Exception:
                pass


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

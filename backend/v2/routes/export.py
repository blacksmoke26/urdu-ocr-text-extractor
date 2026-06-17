"""Export API routes for v2 backend."""

from __future__ import annotations

import time

from fastapi import APIRouter, HTTPException

from engine.metrics import get_metrics
from services.export_service import ExportService

export_router = APIRouter(prefix="/api/v2", tags=["Export"])


async def export_json_endpoint(result: dict):
    metrics = get_metrics()
    t0 = time.perf_counter()
    resp = {"format": "json", "data": ExportService.export_json(result)}
    metrics.api_export.record_success(files=1)
    metrics.latency_global.record((time.perf_counter() - t0) * 1000)
    metrics.total_requests.inc()
    return resp


@export_router.post(
    "/export/txt",
    summary="Export OCR result as plain text",
    description="Extract raw text from an OCR result.",
)
async def export_txt_endpoint(result: dict):
    metrics = get_metrics()
    t0 = time.perf_counter()
    resp = {"format": "txt", "data": ExportService.export_txt(result)}
    metrics.api_export.record_success(files=1)
    metrics.latency_global.record((time.perf_counter() - t0) * 1000)
    metrics.total_requests.inc()
    return resp


@export_router.post(
    "/export/csv",
    summary="Export OCR result as CSV",
    description="Convert OCR lines to CSV format.",
)
async def export_csv_endpoint(result: dict):
    metrics = get_metrics()
    t0 = time.perf_counter()
    resp = {"format": "csv", "data": ExportService.export_csv(result)}
    metrics.api_export.record_success(files=1)
    metrics.latency_global.record((time.perf_counter() - t0) * 1000)
    metrics.total_requests.inc()
    return resp


@export_router.post(
    "/export/docx",
    summary="Export OCR result as Word document (.docx)",
    description="Generate a formatted .docx document from OCR results.",
)
async def export_docx_endpoint(result: dict):
    try:
        metrics = get_metrics()
        t0 = time.perf_counter()
        data_bytes = ExportService.export_docx(result)
        resp = {"format": "docx", "data_b64": __import__("base64").b64encode(data_bytes).decode()}
        metrics.api_export.record_success(files=1)
        metrics.latency_global.record((time.perf_counter() - t0) * 1000)
        metrics.total_requests.inc()
        return resp
    except ImportError as e:
        raise HTTPException(status_code=501, detail=str(e))


@export_router.post(
    "/export/searchable-pdf",
    summary="Export OCR result as searchable PDF",
    description="Create a searchable PDF with the annotated image and embedded invisible text layer.",
)
async def export_searchable_pdf_endpoint(result: dict):
    try:
        metrics = get_metrics()
        t0 = time.perf_counter()
        data_bytes = ExportService.export_searchable_pdf(result)
        resp = {"format": "pdf", "data_b64": __import__("base64").b64encode(data_bytes).decode()}
        metrics.api_export.record_success(files=1)
        metrics.latency_global.record((time.perf_counter() - t0) * 1000)
        metrics.total_requests.inc()
        return resp
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

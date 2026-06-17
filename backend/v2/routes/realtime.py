"""Realtime API routes — SSE streaming and WebSocket for live stats."""

from __future__ import annotations

import asyncio
import json
import time
from contextlib import asynccontextmanager

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse, HTMLResponse
from starlette.websockets import WebSocket, WebSocketDisconnect, WebSocketState

from engine.metrics import get_metrics

realtime_router = APIRouter(prefix="/api/v2", tags=["Realtime"])


# ── SSE Live Stats Stream ────────────────────────────────────────

@realtime_router.get(
    "/live-stats/sse",
    summary="Live stats via Server-Sent Events (SSE)",
    description="Stream live server stats in real-time. Clients connect and receive JSON events every 1s.",
)
async def live_stats_sse():
    """SSE endpoint — continuous JSON stream of live server statistics."""

    async def event_stream():
        metrics = get_metrics()
        while True:
            stats = metrics.live_stats
            data = json.dumps({"type": "live_stats", "data": stats}, ensure_ascii=False)
            yield f"data: {data}\n\n"
            await asyncio.sleep(1.0)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


@realtime_router.get(
    "/live-stats/ocr",
    summary="Live OCR stats via SSE",
    description="Stream only OCR-specific metrics in real-time.",
)
async def live_ocr_stats_sse():
    """SSE endpoint — stream only OCR-relevant metrics."""

    async def event_stream():
        metrics = get_metrics()
        while True:
            stats = metrics.live_stats
            ocr_only = {
                "type": "live_ocr",
                "data": {
                    "requests_per_second": stats["requests_per_second"],
                    "ocr_requests_per_second": stats["ocr_requests_per_second"],
                    "total_lines_extracted": stats["total_lines_extracted"],
                    "ocr_success": stats["ocr_success"],
                    "ocr_failures": stats["ocr_failures"],
                    "latency": stats.get("latency_ocr", {}),
                    "gpu_memory_used_gb": stats["gpu_memory_used_gb"],
                },
            }
            yield f"data: {json.dumps(ocr_only, ensure_ascii=False)}\n\n"
            await asyncio.sleep(1.0)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@realtime_router.get(
    "/live-stats/pdf",
    summary="Live PDF API stats via SSE",
    description="Stream per-API live statistics for the PDF endpoint.",
)
async def live_pdf_stats_sse():
    """SSE — live stats for /api/v2/pdf/* endpoints."""

    async def event_stream():
        metrics = get_metrics()
        while True:
            api_stats = metrics.live_stats.get("per_api", {})
            pdf_stats = api_stats.get("pdf")
            data = {
                "type": "live_pdf",
                "data": {
                    "success_count": pdf_stats["success_count"] if pdf_stats else 0,
                    "fail_count": pdf_stats["fail_count"] if pdf_stats else 0,
                    "files_processed": pdf_stats["files_processed"] if pdf_stats else 0,
                    "lines_extracted": pdf_stats["lines_extracted"] if pdf_stats else 0,
                    "latency": pdf_stats.get("latency", {}),
                },
            }
            yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
            await asyncio.sleep(1.0)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@realtime_router.get(
    "/live-stats/export",
    summary="Live Export API stats via SSE",
    description="Stream per-API live statistics for the export endpoint.",
)
async def live_export_stats_sse():
    """SSE — live stats for /api/v2/export/* endpoints."""

    async def event_stream():
        metrics = get_metrics()
        while True:
            api_stats = metrics.live_stats.get("per_api", {})
            export_stats = api_stats.get("export")
            data = {
                "type": "live_export",
                "data": {
                    "success_count": export_stats["success_count"] if export_stats else 0,
                    "fail_count": export_stats["fail_count"] if export_stats else 0,
                    "files_processed": export_stats["files_processed"] if export_stats else 0,
                    "latency": export_stats.get("latency", {}),
                },
            }
            yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
            await asyncio.sleep(1.0)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@realtime_router.get(
    "/live-stats/events",
    summary="Live OCR processing events via SSE",
    description="Stream individual OCR processing events (each image finishes → event emitted).",
)
async def live_processing_events_sse():
    """SSE endpoint — emits an event each time an OCR job completes."""

    # Event queue shared across all connections
    _event_queue: asyncio.Queue = asyncio.Queue()

    async def publish_event(event_data: dict):
        await _event_queue.put(event_data)

    # Register the publish function globally for hooks
    global _ocr_event_publisher
    _ocr_event_publisher = publish_event

    async def event_stream():
        while True:
            try:
                event_data = await asyncio.wait_for(_event_queue.get(), timeout=30.0)
                yield f"data: {json.dumps(event_data, ensure_ascii=False)}\n\n"
            except asyncio.TimeoutError:
                # Heartbeat — no events in 30s
                yield f": heartbeat\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


# Global OCR event publisher hook
_ocr_event_publisher = None


def emit_ocr_event(event_data: dict):
    """Call this from service code to emit a real-time processing event."""
    if _ocr_event_publisher is not None:
        try:
            asyncio.get_running_loop().create_task(_ocr_event_publisher(event_data))
        except RuntimeError:
            pass  # No running loop


# ── WebSocket Live Stats ─────────────────────────────────────────

@realtime_router.websocket("/ws/task/{task_id}")
async def websocket_task_progress(ws: WebSocket, task_id: str):
    """WebSocket endpoint — subscribe to progress events for a specific PDF OCR / Extract task."""
    from services.websocket_manager import get_ws_manager

    ws_manager = get_ws_manager()
    await ws.accept()  # Accept the WS connection before subscribing
    await ws_manager.subscribe_task(task_id, ws)

    try:
        while True:
            # Check if client still connected or requests to unsubscribe
            data = await ws.receive_text()
            if data == "unsubscribe":
                await ws_manager.unsubscribe_task(task_id, ws)
                await ws.close()
                break
    except WebSocketDisconnect:
        await ws_manager.unsubscribe_task(task_id, ws)


@realtime_router.websocket("/ws/stats")
async def websocket_stats(ws: WebSocket):
    """WebSocket endpoint — connect to receive live stats every 1s."""
    from services.websocket_manager import get_ws_manager

    ws_manager = get_ws_manager()
    # Accept WS from any origin (CORS for WebSocket)
    await ws.accept()
    await ws_manager.connect(ws)

    # Start broadcast loop if not already running
    metrics = get_metrics()
    await ws_manager.start_broadcast(lambda: metrics.live_stats)

    try:
        while True:
            # Check if client still connected
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))
            elif data == "unsubscribe":
                await ws_manager.disconnect(ws)
                await ws.close()
                break
    except WebSocketDisconnect:
        await ws_manager.disconnect(ws)


@realtime_router.get(
    "/live-stats/api/{api_name}",
    summary="Live per-API stats (HTTP)",
    description="Get live statistics for a specific API endpoint (ocr | pdf | export).",
)
async def api_live_stats(api_name: str):
    """GET /api/v2/live-stats/api/ocr — returns current per-API counters + latency."""
    metrics = get_metrics()
    data = metrics.get_api_stats(api_name)
    if not data:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Unknown API: {api_name}. Valid: ocr, pdf, export")
    return JSONResponse({"type": f"live_{api_name}", "data": data})


# ── Server-Sent Events Dashboard (HTML) ─────────────────────────

@realtime_router.get(
    "/live-stats/dashboard",
    summary="Live stats dashboard",
    description="A minimal HTML page with live real-time stats visualization via SSE.",
)
async def sse_dashboard():
    return HTMLResponse(content=_DASHBOARD_HTML)


@realtime_router.get(
    "/metrics/prometheus",
    summary="Prometheus-compatible metrics",
    description="Export metrics in Prometheus exposition format for scraping.",
)
async def prometheus_metrics():
    """Prometheus endpoint — returns metrics in OpenMetrics/Prometheus format."""
    from engine.metrics import get_metrics

    metrics = get_metrics()
    stats = metrics.live_stats

    lines = [
        '# HELP ocr_uptime_seconds Server uptime in seconds',
        '# TYPE ocr_uptime_seconds gauge',
        f'ocr_uptime_seconds {stats["uptime_seconds"]}',
        '',
        '# HELP ocr_total_requests_total Total HTTP requests served',
        '# TYPE ocr_total_requests_total counter',
        f'ocr_total_requests_total {stats["total_requests"]}',
        '',
        '# HELP ocr_total_files_processed_total Total files processed by OCR',
        '# TYPE ocr_total_files_processed_total counter',
        f'ocr_total_files_processed_total {stats["total_files_processed"]}',
        '',
        '# HELP ocr_total_lines_extracted_total Total text lines extracted',
        '# TYPE ocr_total_lines_extracted_total counter',
        f'ocr_total_lines_extracted_total {stats["total_lines_extracted"]}',
        '',
        '# HELP ocr_total_errors_total Total errors encountered',
        '# TYPE ocr_total_errors_total counter',
        f'ocr_total_errors_total {stats["total_errors"]}',
        '',
        '# HELP ocr_ocr_success_total Total successful OCR operations',
        '# TYPE ocr_ocr_success_total counter',
        f'ocr_ocr_success_total {stats["ocr_success"]}',
        '',
        '# HELP ocr_ocr_failures_total Total failed OCR operations',
        '# TYPE ocr_ocr_failures_total counter',
        f'ocr_ocr_failures_total {stats["ocr_failures"]}',
        '',
        '# HELP ocr_requests_per_second Current requests per second',
        '# TYPE ocr_requests_per_second gauge',
        f'ocr_requests_per_second {stats["requests_per_second"]}',
        '',
        '# HELP ocr_ocr_requests_per_second OCR requests per second',
        '# TYPE ocr_ocr_requests_per_second gauge',
        f'ocr_ocr_requests_per_second {stats["ocr_requests_per_second"]}',
        '',
        '# HELP ocr_latency_avg_ms Average OCR latency in milliseconds',
        '# TYPE ocr_latency_avg_ms gauge',
        f'ocr_latency_avg_ms {stats["latency"].get("avg_ms", 0)}',
        '',
        '# HELP ocr_latency_p50_ms 50th percentile OCR latency',
        '# TYPE ocr_latency_p50_ms gauge',
        f'ocr_latency_p50_ms {stats["latency"].get("p50_ms", 0)}',
        '',
        '# HELP ocr_latency_p95_ms 95th percentile OCR latency',
        '# TYPE ocr_latency_p95_ms gauge',
        f'ocr_latency_p95_ms {stats["latency"].get("p95_ms", 0)}',
        '',
        '# HELP ocr_latency_p99_ms 99th percentile OCR latency',
        '# TYPE ocr_latency_p99_ms gauge',
        f'ocr_latency_p99_ms {stats["latency"].get("p99_ms", 0)}',
        '',
        '# HELP ocr_gpu_memory_used_gb GPU memory used in gigabytes',
        '# TYPE ocr_gpu_memory_used_gb gauge',
        f'ocr_gpu_memory_used_gb {stats["gpu_memory_used_gb"]}',
        '',
        '# HELP ocr_gpu_memory_total_gb Total GPU memory in gigabytes',
        '# TYPE ocr_gpu_memory_total_gb gauge',
        f'ocr_gpu_memory_total_gb {stats["gpu_memory_total_gb"]}',
        '',
        '# HELP ocr_pdf_pages_processed_total Total PDF pages processed',
        '# TYPE ocr_pdf_pages_processed_total counter',
        f'ocr_pdf_pages_processed_total {stats["pdf_pages_processed"]}',
        '',
        # ── Per-API metrics ────────────────────────────
        '# HELP ocr_api_ocr_success Total successful OCR API calls',
        '# TYPE ocr_api_ocr_success counter',
        f'ocr_api_ocr_success{stats["per_api"]["ocr"]["success_count"]}',
        '',
        '# HELP ocr_api_ocr_fail_total Failed OCR API calls',
        '# TYPE ocr_api_ocr_fail_total counter',
        f'ocr_api_ocr_fail{stats["per_api"]["ocr"]["fail_count"]}',
        '',
        '# HELP ocr_api_ocr_files Total files processed by OCR API',
        '# TYPE ocr_api_ocr_files counter',
        f'ocr_api_ocr_files_total{stats["per_api"]["ocr"]["files_processed"]}',
        '',
        '# HELP ocr_api_ocr_lines Total lines extracted by OCR API',
        '# TYPE ocr_api_ocr_lines counter',
        f'ocr_api_ocr_lines_total{stats["per_api"]["ocr"]["lines_extracted"]}',
        '',
        '# HELP ocr_api_ocr_latency_avg Average latency per OCR API call (ms)',
        '# TYPE ocr_api_ocr_latency_avg gauge',
        f'ocr_api_ocr_latency_avg_ms{stats["per_api"]["ocr"]["latency"].get("avg_ms", 0)}',
        '',
        '# HELP ocr_api_pdf_success Total successful PDF API calls',
        '# TYPE ocr_api_pdf_success counter',
        f'ocr_api_pdf_success{stats["per_api"]["pdf"]["success_count"]}',
        '',
        '# HELP ocr_api_pdf_fail_total Failed PDF API calls',
        '# TYPE ocr_api_pdf_fail_total counter',
        f'ocr_api_pdf_fail{stats["per_api"]["pdf"]["fail_count"]}',
        '',
        '# HELP ocr_api_export_success Total successful Export API calls',
        '# TYPE ocr_api_export_success counter',
        f'ocr_api_export_success{stats["per_api"]["export"]["success_count"]}',
        '',
        '# HELP ocr_api_export_fail_total Failed Export API calls',
        '# TYPE ocr_api_export_fail_total counter',
        f'ocr_api_export_fail{stats["per_api"]["export"]["fail_count"]}',
    ]

    return StreamingResponse(
        iter(["\n".join(lines) + "\n"]),
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )


_DASHBOARD_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Urdu OCR v2 — Live Stats</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }
  h1 { text-align: center; margin-bottom: 1.5rem; font-size: 1.5rem; color: #38bdf8; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; max-width: 960px; margin: 0 auto; }
  .card { background: #1e293b; border-radius: 8px; padding: 1.25rem; text-align: center; border: 1px solid #334155; transition: border-color 0.3s; }
  .card.flash { border-color: #38bdf8; box-shadow: 0 0 12px rgba(56,189,248,0.3); }
  .label { font-size: 0.75rem; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
  .value { font-size: 1.8rem; font-weight: 700; color: #f8fafc; font-variant-numeric: tabular-nums; }
  .unit { font-size: 0.75rem; color: #64748b; margin-top: 0.25rem; }
  .bar-container { background: #334155; border-radius: 4px; height: 8px; margin-top: 0.75rem; overflow: hidden; }
  .bar { height: 100%; background: linear-gradient(90deg, #38bdf8, #818cf8); transition: width 0.5s ease; border-radius: 4px; }
  .footer { text-align: center; margin-top: 2rem; color: #475569; font-size: 0.7rem; }
</style>
</head>
<body>
<h1>🔍 Urdu OCR v2 — Live Stats</h1>
<div class="grid" id="cards">
  <div class="card"><div class="label">Uptime</div><div class="value" id="uptime">—</div><div class="unit">seconds</div></div>
  <div class="card"><div class="label">Total Requests</div><div class="value" id="total_req">—</div></div>
  <div class="card"><div class="label">Requests/sec</div><div class="value" id="rps">—</div></div>
  <div class="card"><div class="label">OCR Success</div><div class="value" id="ocr_success">—</div></div>
  <div class="card"><div class="label">OCR Failures</div><div class="value" id="ocr_fail">—</div><div class="unit" style="color:#f87171" id="ocr_fail_badge"></div></div>
  <div class="card"><div class="label">Lines Extracted</div><div class="value" id="lines">—</div></div>
  <div class="card"><div class="label">Avg Latency</div><div class="value" id="lat_avg">—</div><div class="unit">ms</div>
    <div class="bar-container"><div class="bar" id="lat_bar" style="width:0%"></div></div>
  </div>
  <div class="card"><div class="label">GPU Memory</div><div class="value" id="gpu_mem">—</div><div class="unit">GB used / total</div></div>
</div>
<div class="footer">Urdu OCR v2 — Server-Sent Events — auto-refresh every 1s</div>

<script>
const sse = new EventSource('/api/v2/live-stats/sse');
sse.onmessage = (e) => {
  try {
    const d = JSON.parse(e.data).data;
    document.getElementById('uptime').textContent = d.uptime_seconds;
    document.getElementById('total_req').textContent = d.total_requests.toLocaleString();
    document.getElementById('rps').textContent = d.requests_per_second;
    document.getElementById('ocr_success').textContent = d.ocr_success.toLocaleString();
    const failEl = document.getElementById('ocr_fail');
    failEl.textContent = d.ocr_failures.toLocaleString();
    const badge = document.getElementById('ocr_fail_badge');
    if (d.live_errors_last_sec > 0) {
      badge.textContent = `⚠ ${d.live_errors_last_sec} errs/sec`;
      failEl.style.color = '#f87171';
    } else {
      badge.textContent = '';
      failEl.style.color = '';
    }
    document.getElementById('lines').textContent = d.total_lines_extracted.toLocaleString();
    const lat = d.latency;
    if (lat && lat.avg_ms !== undefined) {
      document.getElementById('lat_avg').textContent = lat.avg_ms.toFixed(1);
      const barW = Math.min(lat.max_ms / 50, 100);
      document.getElementById('lat_bar').style.width = barW + '%';
    }
    if (d.cuda_available) {
      document.getElementById('gpu_mem').textContent = `${d.gpu_memory_used_gb} / ${d.gpu_memory_total_gb}`;
    } else {
      document.getElementById('gpu_mem').textContent = 'N/A (CPU)';
    }
    // Flash cards on update
    document.querySelectorAll('.card').forEach(c => { c.classList.add('flash'); setTimeout(() => c.classList.remove('flash'), 300); });
  } catch(err) {}
};
sse.onerror = () => { console.warn('SSE connection lost'); };
</script>
</body>
</html>"""

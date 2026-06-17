# Urdu OCR Backend v2 — High-End Production API

## New Features in v2

### Core Enhancements
| Feature | Description |
|---------|-------------|
| **Modular Architecture** | Separated engine, services, routes, middleware, and queue into distinct layers |
| **Result Caching** | In-memory + disk-persisted cache with TTL (default 1hr) to avoid reprocessing identical images |
| **Text Cleaning Pipeline** | Arabic reshaping, Alef normalization, tatil normalization, diacritic removal, whitespace normalization |
| **Confidence Scoring** | Per-line confidence stats (mean/min/max/median) via CTC probability estimation |
| **Image Enhancement** | Preprocessing options: auto-contrast, sharpening, denoising, background normalization, brightness/contrast control |
| **Structured Logging** | Rotating file + console logging with configurable log levels |
| **API Key Authentication** | Optional authentication via `X-API-Key` header or query parameter |
| **Rate Limiting** | Sliding-window rate limiter (default: 60 req/min per IP) |
| **Config-Driven** | All settings via environment variables — no code changes needed for deployment |
| **Task Queue** | Background task queue with progress tracking for long-running operations |
| **Live Metrics Engine** | Thread-safe counters, latency histograms (p50/p95/p99), and per-endpoint rates |
| **Real-Time SSE Streaming** | Server-Sent Events for live server stats and OCR processing events |
| **WebSocket Live Stats** | WebSocket hub that broadcasts stats to all subscribers every 1s |
| **Prometheus Export** | `/metrics/prometheus` endpoint in OpenMetrics format for Grafana/Prometheus scraping |
| **Auto-Instrumentation** | Metrics middleware automatically records latency and counts on every request |
| **Live Dashboard** | Built-in HTML dashboard at `/api/v2/live-stats/dashboard` with real-time visualization |

### New Endpoints

#### OCR (`/api/v2`)
- `POST /ocr` — Batch multi-file OCR (images + PDFs)
- `POST /ocr/single` — Single image OCR with confidence data
- `POST /ocr/with-enhance` — OCR with preprocessing options (sharpen, denoise, etc.)
- `POST /ocr/direct-tensor` — Raw pipeline call (no caching/cleaning)

#### PDF (`/api/v2`)
- `POST /pdf/info` — Get PDF metadata (pages, titles, dimensions)
- `POST /pdf/extract` — Extract page images from PDF
- `POST /pdf/reconstruct` — Reconstruct PDF with selected page range (downloadable)
- `POST /pdf/ocr` — Full PDF OCR across all pages

#### Export (`/api/v2`)
- `POST /export/json` → Formatted JSON output
- `POST /export/txt` → Raw text extraction
- `POST /export/csv` → Line-by-line CSV with bbox data
- `POST /export/docx` → Word document with headings, tables, and confidence stats
- `POST /export/searchable-pdf` → PDF with invisible text overlay layer

#### System (`/api/v2`)
- `GET /health` — Service health check + GPU memory
- `GET /stats` — Live stats powered by metrics engine (requests/sec, latency percentiles, GPU, errors)
- `GET /config` — Current server configuration
- `GET /cache/stats` — Cache hit/miss metrics
- `POST /cache/clear` — Clear cache
- `POST /device/switch` — Switch CPU/CUDA at runtime

#### Real-Time (`/api/v2`) — New in this update
- **`GET /live-stats/sse`** — SSE stream of all live server stats (JSON every 1s)
- **`GET /live-stats/ocr`** — SSE stream of OCR-specific metrics only (RPS, latency, GPU)
- **`GET /live-stats/pdf`** — SSE stream of per-API PDF endpoint statistics
- **`GET /live-stats/export`** — SSE stream of per-API export endpoint statistics
- **`GET /live-stats/api/{ocr|pdf|export}`** — HTTP snapshot of live per-API counters + latency
- **`GET /live-stats/events`** — SSE stream per-OCR-completion events (with heartbeat on idle)
- **`WS /ws/stats`** — WebSocket connection for live stats broadcast + ping/pong support
- **`GET /live-stats/dashboard`** — Built-in HTML dashboard with real-time visualization
- **`GET /metrics/prometheus`** — Prometheus-compatible metrics endpoint (includes per-API metrics)

## Quick Start

```bash
cd backend/v2

# Copy env config (optional)
cp config.example.env .env

# Install deps (shared with root requirements.txt)
pip install -r ../requirements.txt

# Run server
uvicorn main:app --reload
# or
./start-v2-server.sh
```

API docs available at `http://localhost:8000/docs`

## Environment Variables

See `config.example.env` for all options. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `OCR_DEVICE` | `auto` | `cpu`, `cuda`, or `auto` |
| `OCR_CONF_THRESHOLD` | `0.2` | YOLO detection confidence |
| `OCR_IMG_SIZE` | `1280` | Input image size for YOLO |
| `OCR_MAX_FILE_SIZE_MB` | `500` | Max upload file size |
| `OCR_CACHE_ENABLED` | `true` | Enable result caching |
| `OCR_CACHE_TTL` | `3600` | Cache TTL in seconds |
| `OCR_RATE_LIMIT_ENABLED` | `true` | Enable rate limiting |
| `OCR_API_KEYS` | *(empty)* | Comma-separated API keys |
| `OCR_LOG_LEVEL` | `INFO` | Log level (DEBUG/INFO/WARN/ERROR) |

## Architecture

```
backend/v2/
├── main.py              # FastAPI app factory + lifespan hooks
├── config.py            # Environment-driven configuration
├── models/              # Pydantic request/response schemas
│   ├── __init__.py
│   ├── ocr.py           # OCR schemas (line results, task status)
│   └── pdf.py           # PDF schemas (page info, metadata)
├── engine/              # Core OCR processing
│   ├── __init__.py
│   ├── loader.py        # Singleton model loader
│   ├── pipeline.py      # Detection + recognition pipeline
│   ├── text_cleaner.py  # Urdu/Arabic text normalization
│   └── metrics.py       # Thread-safe metrics engine (counters, histograms, rates)
├── services/            # Business logic layer
│   ├── __init__.py
│   ├── ocr_service.py   # OCR orchestration + caching
│   ├── pdf_service.py   # PDF extraction/info/reconstruction
│   ├── cache_service.py # Result cache with TTL + disk persistence
│   ├── export_service.py # JSON/TXT/CSV/DOCX/searchable-PDF export
│   └── websocket_manager.py # WebSocket connection registry + broadcast hub
├── routes/              # API route handlers
│   ├── __init__.py
│   ├── ocr.py           # OCR endpoints
│   ├── pdf.py           # PDF endpoints
│   ├── export.py        # Export endpoints
│   ├── system.py        # Health, stats, config, cache management
│   └── realtime.py      # SSE streams, WebSocket, Prometheus metrics, live dashboard
├── middleware/          # Cross-cutting concerns
│   ├── __init__.py
│   ├── auth.py          # API key authentication
│   ├── rate_limit.py    # Sliding-window rate limiting
│   ├── logging.py       # Structured rotating-file logging
│   └── metrics.py       # Auto-instrumentation + request ID middleware
├── queue/               # Background task management
│   ├── __init__.py
│   └── task_queue.py    # Async task queue with progress tracking
├── utils/               # Helpers
│   ├── __init__.py
│   ├── image_utils.py   # Image enhancement + validation
│   └── file_utils.py    # File extension + size helpers
├── config.example.env   # Example environment configuration
├── requirements_v2.txt  # v2-specific dependency list
├── start-v2-server.sh   # Launch script with env loading
└── README.md            # This file
```

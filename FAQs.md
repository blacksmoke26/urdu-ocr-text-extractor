# Frequently Asked Questions — Urdu OCR

> **Tip:** Use `Ctrl+F` / `Cmd+F` to search within this file. Each section is organized by topic for quick navigation.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Installation & Setup](#installation--setup)
- [Docker & Deployment](#docker--deployment)
- [Model & Hardware](#model--hardware)
- [OCR Processing](#ocr-processing)
- [Image Enhancement](#image-enhancement)
- [PDF Processing](#pdf-processing)
- [Spell Check](#spell-check)
- [AI Analysis](#ai-analysis)
- [Export Formats](#export-formats)
- [API & Developer](#api--developer)
- [System & Monitoring](#system--monitoring)
- [Performance & Troubleshooting](#performance--troubleshooting)
- [MCP Server](#mcp-server)

---

## Getting Started

### What is Urdu OCR?

Urdu OCR is an open-source end-to-end document intelligence platform for extracting, correcting, analyzing, and exporting Urdu text from images and PDFs. It combines YOLOv8 (text region detection) and UTRNet (character recognition) models with a hybrid Urdu spell-checking engine.

### What languages does it support?

The primary focus is **Urdu** script. However, the system also handles English text embedded within Urdu documents (code-switched content), numbers, punctuation, and common mixed-script passages. The spell checker can optionally protect English words from being "corrected."

### Is this free to use?

Yes. This project is licensed under the **MIT License** — free for both personal and commercial use.

### Where do I start?

1. Download trained models: `cd backend && ./download-models.sh`
2. Start the backend: `./start-server.sh`
3. Install frontend deps: `cd frontend && npm install`
4. Run the frontend: `npm run dev`
5. Open `http://localhost:5174`

---

## Installation & Setup

### What Python version do I need?

Python **3.10 or higher**. The project uses type hints and f-string features available from 3.10+.

### What Node.js version is required for the frontend?

Node.js **18+** (ideally 20 LTS). The project uses modern React 19 with Vite.

### Do I need to install CUDA / GPU drivers?

No. The app runs on **CPU out of the box**. A CUDA-enabled GPU and NVIDIA drivers are optional — they just make inference significantly faster. You can switch between CPU and GPU at runtime via the System page or `POST /api/v2/device/switch`.

### Where do I set OCR_API_KEYS for authentication?

Set the `OCR_API_KEYS` environment variable as a comma-separated list of keys. Authentication is enabled automatically when the variable is non-empty. Example:

```bash
export OCR_API_KEYS="key1,key2,admin-key"
```

Then include the header `Authorization: Bearer <your-key>` in requests.

### How do I change the server host and port?

Use environment variables:

| Variable | Default | Description |
|---|---|---|
| `OCR_HOST` | `localhost` | Bind address |
| `OCR_PORT` | `8000` | HTTP port |
| `OCR_WORKERS` | `1` | Uvicorn worker count |

Example: `OCR_HOST=0.0.0.0 OCR_PORT=9000 ./start-server.sh`

---

## Docker & Deployment

### How do I run the full stack with Docker?

```bash
docker compose up --build
```

This starts both services:
- **Backend** on port `8000` (FastAPI)
- **Frontend** on port `80` (nginx proxying `/api/*` → backend)

Open `http://localhost` to access the app.

### How do I run in development mode with hot reload?

The `docker-compose.override.yml` file is loaded automatically and mounts source directories as volumes:

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml up --build
```

Backend code changes trigger Uvicorn's auto-reload. Frontend uses Vite's dev server with hot-module replacement.

### How do I disable rate limiting in Docker?

```bash
OCR_RATE_LIMIT_ENABLED=false docker compose up
```

### Can I use GPU containers?

Yes. Set `OCR_DEVICE=cuda` and ensure your Docker runtime supports NVIDIA GPUs:

```bash
OCR_DEVICE=cuda nvidia-docker compose up --build
```

### What volumes does the compose file create?

| Volume | Purpose |
|---|---|
| `backend-cache` | Cached OCR results (by content hash) |
| `backend-results` | Generated export files |
| `backend-logs` | Application logs |

### What's in the `.dockerignore` file?

The `.dockerignore` excludes: `.git`, `node_modules`, `venv`, `__pycache__`, `*.egg-info`, `dist`, logs, caches, uploads, exports, OS files (`.DS_Store`, `Thumbs.db`), `.env` files, IDE configs, docs, tests, and screenshots.

---

## Model & Hardware

### What models does this use?

| Model | Purpose | File |
|---|---|---|
| **YOLOv8m** | Detects text-line bounding boxes in documents | `yolov8m_UrduDoc.pt` |
| **UTRNet** | Recognizes Urdu characters within each detected region | `best_norm_ED.pth` |

### Where are the models stored?

Inside `backend/models/`. Download them with `./download-models.sh` from the backend directory.

### Can I use a different detection model?

The config reads `DETECTION_MODEL_PATH` and `RECOGNITION_MODEL_PATH` from `config.py`. You can point these to alternative model files, but they must be trained/fine-tuned for Urdu text extraction.

### What's the recommended hardware for production?

| Use Case | CPU | GPU (Recommended) |
|---|---|---|
| Single image OCR | 2+ cores, 4 GB RAM | NVIDIA T4 or better |
| Batch PDF (50+ pages) | 8+ cores, 16 GB RAM | NVIDIA A10 / A100 |
| Real-time processing | Not ideal | RTX 3060+ with CUDA 12 |

### How much VRAM does the model need?

UTRNet + YOLOv8 together use approximately **2–4 GB VRAM** on GPU. On CPU, expect 4–8 GB RAM for smooth operation.

### Does the device switch at runtime require a restart?

No. Use `POST /api/v2/device/switch` to hot-swap between `cpu` and `cuda` without restarting the server. The new device applies to subsequent requests.

---

## OCR Processing

### How does the OCR pipeline work?

```
Input Image → YOLOv8 Bounding Boxes → UTRNet Recognition → Text Cleaning → Spell Correction → Final Output
```

1. **YOLOv8** detects text line bounding boxes
2. **UTRNet** recognizes Urdu text within each box
3. **Text Cleaning** applies Unicode normalization, Arabic reshaping, character correction, and more
4. **Spell Check** runs the hybrid correction engine as a final pass

### What image formats are supported?

JPG, JPEG, PNG, BMP, TIFF, TIF, WebP, GIF, SVG — all with configurable DPI. The maximum file size is **500 MB** (configurable via `OCR_MAX_FILE_SIZE_MB`).

### Why are some lines unrecognized or garbled?

Common causes:
- Low image quality or blur (try image enhancement)
- Unusual fonts not in the training data
- Text density too high (overlapping lines)
- Low confidence areas — check the confidence bars per line

### How does confidence scoring work?

Each recognized text line gets a confidence score (0–1). The UI displays this as a colored bar: green = high confidence, yellow = moderate, red = low. You can filter results by confidence threshold.

### Can I OCR handwritten Urdu?

The models are trained on **printed** Urdu documents. Handwritten text accuracy will vary significantly depending on handwriting style and legibility. There is no dedicated handwritten Urdu model in this release.

### What is "direct tensor" OCR?

`ocr_direct_tensor` bypasses caching, text cleaning, and spell correction — it runs pure YOLOv8 + UTRNet inference and returns the raw output. Useful for debugging or custom post-processing pipelines.

### How does the beam search improve accuracy?

UTRNet uses a **beam search decoder** with configurable width (default: 5). Wider beams explore more character sequences and generally produce better results at the cost of speed. Adjust via `BEAM_SEARCH_WIDTH`.

---

## Image Enhancement

### What enhancement filters are available?

| Filter | Description |
|---|---|
| **Auto-contrast** | Equalizes histogram for better text-background separation |
| **Sharpen** | Enhances edges between text and background |
| **Denoise** | Reduces noise/grain in low-quality images |
| **Background Normalization** | Flattens uneven lighting across the page |
| **Saturation Boost** | Increases color intensity for faded documents |
| **Blur Removal** | Applies deconvolution to reduce motion/defocus blur |

### Can I fine-tune enhancements?

Yes. Each filter has adjustable sliders:
- **Brightness** — lightness/darkness offset
- **Contrast** — difference between light and dark areas
- **Gamma** — non-linear brightness correction
- **Edge Enhancement Intensity** — strength of the sharpening effect

### Do I need to enhance images before OCR?

Not always. If your image is clear, high-contrast, and well-lit, skip enhancement. Toggle it on when:
- The document is scanned from a low-quality source
- There's uneven lighting or shadows
- Text looks faint or blurred

---

## PDF Processing

### How does multi-page PDF processing work?

Each page is rendered as an image at configurable DPI (default **300**), then processed individually through the OCR pipeline. Results include per-page breakdowns with page-number separators.

### What DPI should I use for PDF OCR?

| DPI | Use Case | Quality vs Speed |
|---|---|---|
| 150 | Quick preview / good quality scans | Fast, moderate accuracy |
| **300** (default) | General purpose | Balanced |
| 400+ | Poor quality / small text | Slow, high accuracy |

Configure via `OCR_PDF_DPI`.

### Can I extract only specific pages from a PDF?

Yes. Specify start and end page ranges in the OCR request. Pages are processed sequentially with real-time progress tracking.

### How long does PDF OCR take for a 100-page document?

Approximately **2–5 seconds per page** on CPU (single worker), or **0.5–1 second per page** on GPU. You can monitor live progress via the WebSocket endpoint or `GET /api/v2/progress/{task_id}`.

### Can I cancel an ongoing PDF task?

Yes. Call `POST /api/v2/pdf/cancel/{task_id}` while processing is underway. The partial results for completed pages are retained.

### What's the difference between PDF Extract and PDF OCR?

- **PDF Extract** (`pdf_extract`) — extracts page images as base64 PNGs without running OCR
- **PDF OCR** (`pdf_ocr`) — renders pages to images AND runs text recognition on each page

---

## Spell Check

### How does the Urdu spell checker work?

The spell checker uses a **hybrid engine** combining:

| Strategy | Description |
|---|---|
| Character Confusion Tables | Maps commonly confused Urdu characters (د/ڈ, ذ/ز, etc.) |
| Levenshtein Distance | Computes edit distance between words in the dictionary |
| Phonetic Matching | Finds sound-alike corrections using phonetic rules |
| Compound Decomposition | Splits misjoined compound words into components |
| N-gram Scoring | Context-aware word frequency from `urduhack` |
| UrduHack Pass | Final correction pass using the UrduHack library |

### What spell check modes are available?

| Mode | Aggressiveness | Description |
|---|---|---|
| `char` | Conservative | Only corrects character confusions |
| `distance` | Moderate | Adds Levenshtein distance matching |
| `hybrid` (default) | Balanced | Combines all strategies |
| `aggressive` | Maximum | Applies every strategy with lower thresholds |

### Can I add custom words to the dictionary?

Yes. Use **User Dictionary** on the Spell Check page or call `POST /api/v2/spell/user-dict/add`. Words added here are never auto-corrected, which is useful for proper nouns, technical terms, and names.

### Does spell check work without OCR?

Yes! The Spell Check page works on **any pasted Urdu text**, fully independent of the OCR pipeline. It also supports batch correction across multiple texts simultaneously.

### What are the six dedicated spell check tools?

1. **Auto-correct** — one-click full correction with selectable mode
2. **Analyze errors** — shows what's wrong without fixing
3. **Word suggestions** — top-N candidates per word
4. **Batch correction** — correct multiple texts at once
5. **Roman transcription** — convert Urdu to Latin alphabet
6. **User Dictionary** — manage custom never-corrected words

### How do I tune spell check sensitivity?

Environment variables:

| Variable | Default | Description |
|---|---|---|
| `SPELL_CHECK_MAX_DISTANCE` | `3` | Max Levenshtein distance |
| `SPELL_CHECK_CONFIDENCE_THRESHOLD` | `0.35` | Min correction score (0–1) |
| `SPELL_CHECK_USE_WORD_FREQ` | `true` | Enable n-gram frequency weighting |
| `SPELL_CHECK_SENTENCE_AWARE` | `true` | Consider context between sentences |
| `SPELL_CHECK_PROTECT_ENGLISH` | `true` | Don't correct English words |
| `SPELL_CHECK_PHONETIC_ENABLED` | `true` | Enable phonetic matching |
| `SPELL_CHECK_COMPOUND_DECOMPOSITION` | `true` | Split compound words |

---

## AI Analysis

### What kind of analysis is available post-OCR?

| Tool | Description |
|---|---|
| **Language Detection** | Confirms detected language(s) in OCR output |
| **Document Classification** | Classifies as receipt, letter, form, table, handwritten, etc. |
| **Extractive Summarization** | Pulls key sentences and extracts keywords + suggested title |
| **Table Detection** | Detects table structures within OCR lines (rows/columns/cells) |
| **Enhancement Recommendations** | Analyzes image quality and suggests specific filters to improve accuracy |

### How accurate is the document classification?

The classifier identifies common document types: receipt, letter, form, table, handwritten note, and general text. Accuracy depends on document structure clarity and text density. Edge cases (mixed-format documents) may produce lower confidence scores.

---

## Export Formats

### What export formats are supported?

| Format | Extension | Use Case |
|---|---|---|
| Plain Text | `.txt` | Simple text extraction, copy-paste friendly |
| JSON | `.json` | Programmatic use, structured data exchange |
| CSV | `.csv` | Spreadsheet import, tabular results |
| Word Document | `.docx` | Professional document preparation |
| Searchable PDF | `.pdf` | Full-page PDF with invisible text layer overlaid on images |

### What's the difference between single-image and PDF OCR exports?

- **Single-image exports** (`export_json`, `export_txt`, etc.) — apply to a single image OCR result
- **PDF OCR exports** (`export_pdf_json`, `export_pdf_txt`, etc.) — include per-page breakdowns with page-number separators for multi-page documents

### Can I customize the export JSON structure?

The JSON output includes: extracted text, confidence scores per line, bounding box coordinates, language detection results, AI analysis metadata, and processing timestamps. See the API response schema in Swagger UI (`/docs`).

---

## API & Developer

### Where are the interactive API docs?

- **Swagger UI**: `http://localhost:8000/docs` — live test forms for all endpoints
- **ReDoc**: `http://localhost:8000/redoc` — alternative documentation layout
- **OpenAPI schema**: `http://localhost:8000/openapi.json` — machine-readable spec

### How many API endpoints are there?

**30+ endpoints** across 7 route groups: OCR, PDF, Export, Spell Check, Analysis, System, and Realtime (WebSocket).

### What's the base path for all API routes?

All routes use `/api/v2/` prefix. Examples:
- `POST /api/v2/ocr/single` — single image OCR
- `GET /api/v2/health` — health check
- `GET /api/v2/config` — running configuration

### How do I authenticate API requests?

Set the `Authorization` header to `Bearer <your-key>` for each request. Keys are configured via the `OCR_API_KEYS` environment variable. Without this variable set, authentication is disabled.

### What WebSocket features are available?

- **Live progress updates** during long PDF OCR tasks
- **Real-time stats streaming** — request counts, latency, GPU utilization
- Use `ws://localhost:8000/api/v2/ws/{task_id}` for task-specific streams
- Or connect to the live-stats endpoint for global metrics

### Can I use this as a library in my own Python project?

Yes. The backend is a standard FastAPI application with clean module boundaries (`engine/`, `services/`, `utils/`). You can import core functions directly or run the API and consume it over HTTP.

---

## System & Monitoring

### How do I check server health?

- **Endpoint**: `GET /api/v2/health` — returns model status, device info, uptime
- **UI**: System page — visual health dashboard with color-coded status indicators
- **Docker**: Healthcheck is configured in `docker-compose.yml` (curl to `/api/v2/health`)

### What metrics are tracked?

| Metric | Description |
|---|---|
| Request count per endpoint | Total requests since startup |
| Latency histograms | P50, P95, P99 response times |
| Success/failure rates | Per-endpoint error ratios |
| RPS (requests per second) | Current throughput |
| GPU utilization | Memory and compute usage on CUDA devices |
| Cache hit/miss ratio | Effectiveness of result caching |

### Are metrics Prometheus-compatible?

Yes. Metrics are auto-instrumented at every endpoint and available at `GET /api/v2/metrics/prometheus` in Prometheus exposition format.

### How do I clear the result cache?

- **UI**: System page → "Clear Cache" button
- **API**: `POST /api/v2/cache/clear`
- **Config**: `get_cache_stats` endpoint shows hit/miss ratio and total cached entries

### What's the default cache TTL?

**3600 seconds (1 hour)**, configurable via `OCR_CACHE_TTL`. Results are cached by content hash — processing the same file again returns the cached result instantly.

### How do I view processing history?

`GET /api/v2/analysis/history` returns a list of recent operations with:
- Timestamp
- Input type (image/PDF)
- Line count
- Average confidence score
- Processing duration

---

## Performance & Troubleshooting

### Why is my OCR result slow?

Common causes and fixes:

| Issue | Fix |
|---|---|
| CPU-only processing | Switch to CUDA GPU via System page |
| Single worker | Increase `OCR_WORKERS` (e.g., `OCR_WORKERS=4`) |
| High DPI PDFs | Lower `OCR_PDF_DPI` for faster processing |
| Large batch files | Process in smaller batches (max 10 per request) |
| Cache disabled | Enable cache with `OCR_CACHE_ENABLED=true` |

### Why are OCR results inconsistent between runs?

If caching is enabled (`OCR_CACHE_ENABLED=true`), identical inputs return cached results. To force re-processing, disable cache or use `ocr_direct_tensor` which bypasses caching entirely.

### The app crashes on startup with "model not found"

Run `./download-models.sh` in the backend directory to download `yolov8m_UrduDoc.pt` and `best_norm_ED.pth`. Verify they exist in `backend/models/`.

### PDF OCR tasks time out on large documents

Increase the task timeout or process fewer pages per request. For very large PDFs, use `pdf_extract` to get page images first, then process them individually with `ocr_batch`.

### Image upload fails for valid files

Check:
- File extension is in the allowed list (JPG, PNG, BMP, TIFF, WebP, GIF, SVG, PDF)
- MIME type matches the extension
- File size ≤ `OCR_MAX_FILE_SIZE_MB` (default 500 MB)

### I get CORS errors from the frontend

Set `OCR_CORS_ORIGINS` to your frontend URL:

```bash
OCR_CORS_ORIGINS="http://localhost:5174,https://myapp.com"
```

Or use `"*"` for development (all origins).

### How do I debug OCR issues?

1. Check the log file at `backend/logs/ocr_v2.log`
2. Use Swagger UI (`/docs`) to test individual endpoints
3. Inspect confidence bars in the UI — low-confidence lines indicate recognition issues
4. Try `ocr_direct_tensor` to isolate pipeline stages
5. Enable debug logging: `OCR_LOG_LEVEL=DEBUG ./start-server.sh`

### The spell checker doesn't catch certain errors

This is expected with:
- **Proper nouns or names** — add them to the User Dictionary as protected words
- **Domain-specific jargon** — technical terms may not be in the training dictionary
- **Very low confidence OCR output** — corrupted characters beyond correction range

---

## MCP Server

### What is the MCP server?

The MCP (Model Context Protocol) server in `mcp-server/` exposes the entire Urdu OCR backend as **MCP tools, resources, and prompts**. This lets Claude Desktop, VS Code, or any MCP-compatible client call OCR, spell check, analysis, and export functions directly in conversation.

### How do I install the MCP server?

```bash
cd mcp-server
pip install -e .
```

### How do I run the MCP server?

**stdio transport** (Claude Desktop, VS Code):
```bash
uv run server
```

**streamable-http transport** (remote hosting):
```bash
uv run server --transport streamable-http --host 0.0.0.0 --port 8765
```

### What tools does the MCP server expose?

- **42 MCP tools** covering OCR, PDF, export, spell check, analysis, and system management
- **3 resources** (`urdu-ocr://health`, `urdu-ocr://config`, `urdu-ocr://spell-info`) for URI-based reads
- **15 prompts** including workflow chains like `ocr_workflow`, `document_quality_audit`, `export_pipeline`, and more

### How do I configure Claude Desktop to use the MCP server?

See [`mcp-server/README.md`](../mcp-server/README.md) for full setup instructions. The config goes under `mcpServers.urdu-ocr` with command `uv` and args pointing to the server module.

### Can I call MCP tools programmatically?

Yes. The MCP server implements the standard MCP protocol. Any MCP SDK (Python, TypeScript, etc.) can connect to it via stdio or HTTP transport and invoke tools directly.

---

## General & Misc

### What version of this project am I on?

The API reports version `2.1.0`. Check with `GET /api/v2/config` or the Swagger UI home page.

### Can I contribute to this project?

Yes! This is open source under MIT. Feel free to submit issues, feature requests, or pull requests. See the upstream repo for contribution guidelines.

### Where do I report bugs?

File an issue on the [GitHub repository](https://github.com/blacksmoke26/urdu-ocr-text-extractor) with:
- Steps to reproduce
- Input file (if possible)
- Expected vs actual output
- Environment details (OS, GPU/CPU, model version)

### How is this different from commercial OCR APIs?

This is a fully local, self-hosted solution — no data leaves your machine. Commercial APIs require sending documents to their servers, which raises privacy and compliance concerns for sensitive documents. This gives you the same capabilities with complete data control.

# End-to-End Urdu OCR Backend API

> **Version:** 2.1.0  
> **Framework:** FastAPI + PyTorch + YOLOv8  
> **Server Docs:** [Swagger UI](http://localhost:8000/docs) | [ReDoc](http://localhost:8000/redoc)

---

## Overview

Production-grade Urdu document text extraction service supporting both image files and PDF documents. The engine combines YOLOv8-based text line detection with a custom UTRNet recognition model, followed by intelligent Urdu/Arabic text cleaning and automatic spell correction.

**What it does:** Upload an image or PDF and get back extracted Urdu text with per-line bounding boxes, confidence scores, annotated images, and optional auto-corrected output — all through a REST API with WebSocket/SSE live progress streaming.

---

## System Requirements

### Minimum

| Component | Requirement |
|---|---|
| **CPU** | 4+ cores (Intel i5 / AMD Ryzen 5 or equivalent) |
| **RAM** | 8 GB |
| **GPU** | None required (runs fully on CPU) |
| **Disk** | 2 GB for models + dependencies (~500 MB runtime) |
| **OS** | Windows 10+, Ubuntu 20.04+, macOS 12+ |
| **Python** | 3.10 – 3.12 |
| **CUDA** | Not required (CPU fallback available) |

Expected performance on minimum hardware: ~15–30 seconds per image page, ~60–120 seconds per PDF page (CPU-only inference).

### Recommended

| Component | Requirement |
|---|---|
| **CPU** | 8+ cores (Intel i7 / AMD Ryzen 7 or better) |
| **RAM** | 16 GB+ |
| **GPU** | NVIDIA GPU with CUDA support (GTX 1060+ / RTX 3060+ recommended; 4+ GB VRAM) |
| **Disk** | SSD (NVMe preferred for model loading speed) |
| **OS** | Ubuntu 22.04+ (best CUDA driver compatibility) or Windows 10/11 with WSL2 |
| **Python** | 3.11 – 3.12 |
| **CUDA Toolkit** | 11.8+ (for PyTorch CUDA backend) |

Expected performance on recommended hardware: ~1–5 seconds per image page, ~5–15 seconds per PDF page (CUDA acceleration).

### GPU Notes

- YOLOv8 detection benefits most from GPU; recognition (UTRNet) is lighter and runs acceptably on CPU
- Automatic CUDA kernel compatibility check at startup prevents silent failures — falls back to CPU if kernels are incompatible
- Hot-swap between CPU and CUDA at runtime without restart via the System Management API

---

## Quick Start

```bash
cd backend
./install.sh          # Install dependencies
./start-server.sh     # Start the server (http://localhost:8000)
```

Or run directly:

```bash
uvicorn v2.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload
```

---

## Authentication

Protect your API by setting the `OCR_API_KEYS` environment variable (comma-separated):

```env
OCR_API_KEYS=sk-key1,sk-key2,sk-key3
```

Include the key in requests via the `X-API-Key` header or `api_key` query parameter. When no keys are set, authentication is disabled and all endpoints are publicly accessible. Whitelisted paths (`/docs`, `/redoc`, `/health`, `/metrics`) skip auth regardless of configuration.

---

## Configuration

All settings are controlled via environment variables with sensible defaults. No `.env` file is required to start.

### Server & Deployment

| Variable | Default | Description |
|---|---|---|
| `OCR_HOST` | `localhost` | Server bind address |
| `OCR_PORT` | `8000` | Server port |
| `OCR_WORKERS` | `1` | Uvicorn worker count |
| `OCR_RELOAD` | `false` | Enable auto-reload (development only) |
| `OCR_LOG_LEVEL` | `INFO` | Logging level (`DEBUG`, `INFO`, `WARNING`, `ERROR`) |

### Compute & Inference

| Variable | Default | Description |
|---|---|---|
| `OCR_DEVICE` | `auto` | Recognition model device (`auto` / `cpu` / `cuda`) |
| `OCR_YOLO_DEVICE` | `auto` | YOLO detection device (`auto` / `cpu` / `cuda`) |
| `OCR_CONF_THRESHOLD` | `0.2` | Detection confidence threshold (0–1) |
| `OCR_IMG_SIZE` | `1280` | Inference image size in pixels |
| `BEAM_SEARCH_WIDTH` | `5` | Beam search width for CTC decoding |

### File Handling

| Variable | Default | Description |
|---|---|---|
| `OCR_MAX_FILE_SIZE_MB` | `500` | Maximum upload file size (MB) |
| `OCR_MAX_BATCH_FILES` | `10` | Max files per batch request |
| `OCR_PDF_DPI` | `300` | PDF page rendering DPI |

### Caching & Performance

| Variable | Default | Description |
|---|---|---|
| `OCR_CACHE_ENABLED` | `true` | Enable result caching (in-memory + disk) |
| `OCR_CACHE_TTL` | `3600` | Cache TTL in seconds |

### Rate Limiting & Security

| Variable | Default | Description |
|---|---|---|
| `OCR_RATE_LIMIT_ENABLED` | `true` | Enable rate limiting |
| `OCR_RATE_LIMIT_REQUESTS` | `60` | Max requests per window |
| `OCR_RATE_LIMIT_WINDOW` | `60` | Rate limit window (seconds) |
| `OCR_API_KEYS` | *(empty)* | Comma-separated API keys for authentication |
| `OCR_CORS_ORIGINS` | `*` | CORS allowed origins (comma-separated) |

### Text Cleaning & Spell Correction

| Variable | Default | Description |
|---|---|---|
| `OCR_TEXT_CLEANING_ENABLED` | `true` | Enable text cleaning pipeline |
| `URDUTEXT_AUTOCORRECT_ENABLED` | `true` | Enable automatic spell correction |
| `URDUTEXT_AUTOCORRECT_MODE` | `hybrid` | Correction mode (`char`, `distance`, `hybrid`, `aggressive`) |
| `SPELL_CHECK_MAX_DISTANCE` | `3` | Maximum Levenshtein distance for corrections |
| `SPELL_CHECK_USE_WORD_FREQ` | `true` | Use word frequency in scoring |
| `SPELL_CHECK_CONFIDENCE_THRESHOLD` | `0.35` | Minimum correction score (0–1) |
| `SPELL_CHECK_SENTENCE_AWARE` | `true` | Split by sentences before correcting |
| `SPELL_CHECK_PROTECT_ENGLISH` | `true` | Protect English words and URLs from correction |
| `SPELL_CHECK_PHONETIC_ENABLED` | `true` | Enable phonetic (sound-alike) character matching |
| `SPELL_CHECK_COMPOUND_DECOMPOSITION` | `true` | Decompose compound/misjoined Urdu words |
| `SPELL_CHECK_URDUHACK_FINAL_PASS` | `true` | Run UrduHack as final correction pass |

### Image Enhancement & Detection

| Variable | Default | Description |
|---|---|---|
| `AUTO_ENHANCE_ENABLED` | `true` | Enable automatic image enhancement |
| `AUTO_DEBLUR_ENABLED` | `true` | Enable automatic deblurring |
| `BBOX_PADDING_PERCENT` | `10` | Percentage to expand detected bounding boxes |

### Thumbnails

| Variable | Default | Description |
|---|---|---|
| `OCR_THUMB_WIDTH` | `300` | Thumbnail generation width (pixels) |
| `OCR_THUMB_HEIGHT` | `425` | Thumbnail generation height (pixels) |

---

## Core Features

### 1. Image OCR (Single & Batch)

Extract Urdu text from image files with high accuracy. Supports **JPEG, PNG, BMP, TIFF, WebP, GIF, and SVG** formats. Each response includes the full extracted text per detected line, bounding box coordinates, confidence scores, and an annotated image showing detection regions.

**Capabilities:**
- Automatic text line detection using YOLOv8 object detection model
- Per-line confidence scoring with statistical summary (mean, min, max)
- Source image thumbnail embedded as base64 in the response for visual verification
- Optional automatic text cleaning and spell correction pipeline
- Result caching to skip redundant processing of identical inputs
- Batch processing of up to 10 files in a single request with aggregate timing

**Response includes:** task ID, detected line count, full text, per-line details (index, text, confidence, bounding box), annotated image, processed confidence statistics, and cache performance data.

### 2. Enhanced Image OCR

Preprocess images with optional enhancement steps before OCR to improve accuracy on poor-quality inputs such as low-contrast scans or noisy photographs:

| Enhancement | Effect | When to Use |
|---|---|---|
| **Auto Contrast** | Equalizes histogram for low-contrast images | Faded or underexposed documents |
| **Sharpen** | Applies Sharpen filter for blurry text | Out-of-focus photos or degraded scans |
| **Denoise** | Median filtering to remove noise artifacts | Grainy photos or noisy scanner output |
| **Normalize Background** | Histogram equalization per channel for uneven lighting | Documents with shadows or gradient backgrounds |
| **Brightness Control** | Manual brightness multiplier (0.5–2.0 range) | Too-dark or too-bright source images |
| **Contrast Control** | Manual contrast multiplier (0.5–2.0 range) | Flat or low-contrast document text |

Enhanced images are always converted to grayscale (L mode) before passing to the OCR pipeline for consistent feature extraction.

### 3. PDF Processing

Full PDF pipeline with page-level extraction, OCR, and reconstruction:

**PDF Information** — Get document metadata including title, author, subject, creator, producer, total pages, rotation, and per-page dimensions at 72 DPI.

**Page Extraction** — Convert PDF pages to PNG images at configurable DPI (default 300) with real-time progress tracking and task cancellation support. Returns page number, dimensions, full image as base64, and thumbnail as base64.

**PDF OCR** — Extract text from all or selected pages with per-page timeout (30 min), overall timeout (4 hours), live WebSocket progress updates, and partial result return on cancellation. Each page produces the same output format as single-image OCR.

**PDF Reconstruction** — Extract a page range from a PDF and return as a new compressed PDF file (garbage collection level 4, deflate compression).

**Advanced PDF OCR Options:**
- Device override (`cpu`/`cuda`) per-request
- Detection type selection (YOLO, DETR, MLLM)
- Custom confidence thresholds
- Layout analysis toggle
- MLLM model name for enhanced detection
- Configurable preprocessing parameters via JSON

### 4. Export Formats

Convert OCR results into multiple output formats through dedicated endpoints:

| Format | Description | Data Returned |
|---|---|---|
| **JSON** | Full structured data with per-line details and metadata | JSON string |
| **Plain Text** | Raw extracted text only | String |
| **CSV** | Tabular data with columns: index, text, confidence, bounding_box | CSV string |
| **Word (.docx)** | Formatted document with headings, paragraphs, and line detail table | Base64-encoded binary |
| **Searchable PDF** | Annotated image with invisible text layer overlay for full text search | Base64-encoded binary |

PDF-specific exports (JSON, TXT, CSV, DOCX) include per-page aggregation with page numbers for multi-page documents. The Word export generates proper document structure with headings (`OCR Result`, `Full Text`, `Line Details`) and a formatted table of all detected lines. The Searchable PDF embeds invisible text at the exact bounding box coordinates of each detected line.

### 5. Urdu Spell Check & Auto-Correction

Standalone multi-strategy spell checking engine specifically designed for Urdu text. Works on any extracted or raw Urdu text, independent of the OCR pipeline.

**Correction Modes:**

| Mode | Strategy | Speed | Best For |
|---|---|---|---|
| `char` | Character confusion map only (e.g., ت→ب, چ→ج) | Fastest | Quick corrections, low-latency needs |
| `distance` | Dictionary lookup with Levenshtein distance scoring | Balanced | Good accuracy without full context analysis |
| `hybrid` | Confusion map + dictionary + n-gram context + UrduHack | Quality-focused | Production-grade output, best accuracy |
| `aggressive` | Maximum corrections with lower confidence threshold | Thorough | Heavy corruption, low-confidence OCR results |

**Engine Features:**
- Character-level confusion map covering 15+ common Urdu OCR error pairs (ب/ت/ث, چ/ج/ژ, ک/گ, ی/ئ, ة/ہ, و/ؤ)
- Dictionary-based correction using a built-in Urdu word database with bigrams and trigrams for context-aware scoring
- Context-aware n-gram scoring for word-level corrections across sentence boundaries
- Phonetic matching for sound-alike character detection (e.g., گ↔ك, ے/ه confusion)
- Compound word decomposition for misjoined or incorrectly split Urdu words
- Sentence-aware processing to preserve grammatical context during correction
- English text protection to avoid correcting URLs, emails, and technical terms
- Optional UrduHack integration for advanced linguistic corrections (final pass)
- Custom user dictionary API — add words that should never be corrected

**Additional Spell Check Operations:**
- **Analyze** — Detect errors without auto-correcting (ideal for UI highlighting with inline red-underlined suggestions)
- **Suggest** — Get top-N correction candidates per word for manual selection in the UI
- **Batch** — Correct multiple texts in one request with aggregated statistics across all inputs
- **Romanize** — Approximate Roman (Latin) transcription of Urdu text for phonetic lookup
- **User Dictionary** — Add/remove words that should always be considered valid (`/spell/user-dict/add`, `/spell/user-dict/remove`, `/spell/user-dict`)
- **Analytics** — Detailed session statistics including correction rate, strategy usage breakdown, grammar flags, script detection confidence, and per-character correction distribution

### 6. Document Analysis

AI-powered analysis engine for extracted OCR content:

**Language Detection** — Identify primary language(s) in the text (Urdu, Arabic, Persian, English) with proportion breakdowns using Unicode range analysis of 8 character categories. Detects mixed-language documents when multiple scripts exceed 10% threshold.

**Document Type Classification** — Classify documents into categories: receipt, letter, book page, form, handwritten, or table document. Uses keyword matching across Urdu and English terms plus structural heuristics (line count, number density, colon usage ratio).

**Content Analysis** — Word count, sentence count, average word length, vocabulary uniqueness ratio, character count, line count, numeric presence detection, and number density per character.

**Table Detection** — Automatically detect table-like structures in OCR output lines by analyzing tab/pipe-delimited cell patterns across consecutive lines. Returns table start row, dimensions, and cell contents (up to 10 rows sampled).

**Text Summarization** — Extractive summarization using positional scoring (first sentence gets +0.3 bonus as typical title/intro, last two sentences get +0.15 as typical conclusions) combined with TF-IDF-like word frequency weighting. Respects Urdu and English stop word lists. Returns summary text, top 8 keywords with scores, detected title/headline, and confidence score.

**Smart Enhancement Recommendations** — Analyze image quality metrics (contrast standard deviation, sharpness via Laplacian variance, brightness mean, noise level) and produce scored recommendations for auto-contrast intensity, sharpen strength, denoise kernel size, and brightness adjustment when the source image would benefit from preprocessing.

### 7. Real-Time Features

Live updates for long-running operations via multiple transport methods:

**WebSocket Connections** — Connect to `/ws` endpoint to receive live statistics broadcast every second (global system metrics: requests per second, file counts, GPU memory, cache performance). Also supports task-specific subscriptions via `/ws/progress/{task_id}` for page-by-page progress during PDF extraction and OCR operations.

**Server-Sent Events (SSE)** — Stream live events over HTTP long-polling with dedicated endpoints for general monitoring (`/live-stats`), OCR progress (`/live-ocr-stats`), PDF processing (`/live-pdf-stats`), export operations (`/live-export-stats`), and processing event logs (`/live-events`). Each stream delivers JSON-formatted event objects.

**Prometheus Metrics** — Export machine-readable metrics in Prometheus exposition format at `/metrics/prometheus` for integration with Grafana, Datadog, or any time-series monitoring system. Exposes all counters and histograms documented in the Metrics section below.

### 8. System Management

Operational endpoints for monitoring and managing the service:

**Health Check** — Verify service readiness, model loading status, default device configuration, CUDA availability, actual compute device being used, and GPU memory allocation (used vs. total GB). Returns `healthy` or error state.

**Live Statistics** — Real-time system metrics snapshot including uptime seconds, total requests/files processed/lines extracted/errors, live per-second approximations, request-per-second rates (global + OCR), latency histograms with p50/p95/p99/max percentiles, per-API stats (OCR, PDF, Export) with success/fail counts and file/line totals, GPU memory, CPU/RAM usage percentage, model loaded status, cache enabled flag, and rate limiting status.

**Device Switching** — Hot-swap between CPU and CUDA at runtime with automatic model reload. Passing an empty string triggers auto-detection. Returns new device label, vocabulary size, and GPU memory after switch.

**Cache Management** — View cache statistics (enabled/disabled, TTL in seconds, current entry count, hit count, miss count, hit rate percentage) via the stats endpoint. Clear all cached results (in-memory and disk-persisted) via the clear endpoint.

**Configuration Dump** — Retrieve the complete running configuration including server settings, model parameters, file limits, rate limiting, caching, text cleaning, autocorrect mode, spell check thresholds, and feature flags for debugging and auditing.

### 9. Processing History

Automatic tracking of all OCR operations with detailed in-memory metadata (configurable: max 500 entries, 1-hour TTL):

**Recorded Per-Operation:** event ID, timestamp, operation type (ocr_single, ocr_batch, pdf_ocr, export, etc.), filename, success/error status, detected lines count, processing time in milliseconds, mean and minimum confidence scores, detected language, document classification, file size in KB, compute device used.

**Query Capabilities:** get recent entries (last N operations), filter by operation type with per-operation statistics. Returns reversed chronological order for newest-first display.

**Aggregated Statistics:** total operations count, breakdown by status (success vs. error), breakdown by operation type, total lines extracted across all operations, total processing time, average processing time per operation, average confidence score across recent operations, unique file count, and configured time window.

### 10. Task Management & Cancellation

Support for long-running PDF/OCR tasks with graceful cancellation:

**Progress Tracking** — Real-time per-page progress updates via dedicated `/progress/{task_id}` endpoint. Each update includes pages completed, total pages, percentage complete, and elapsed time per page.

**Task Cancellation** — Cancel ongoing extraction or OCR operations mid-processing by calling the cancel endpoint with the task ID. The service stops at the next page boundary, returns all results from completed pages plus a cancellation status message. Partial results are always returned so the UI can show what was processed.

**Per-Page Timeout** — 30-minute timeout per individual page to prevent infinite hangs on corrupted or malformed PDF pages. Timed-out pages produce an empty OCR result entry with processing time set to the timeout value, allowing continuation of remaining pages.

**Overall Task Timeout** — 4-hour global timeout for extended batch operations. After exceeding this threshold, returns all results accumulated so far with a timeout status message including pages processed vs. total expected.

---

## Pipeline Architecture

```
Image/PDF Input
       │
       ▼
┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│ YOLOv8 Detection│→ │ Text Cropping │→ │ UTRNet OCR    │
│  (Line BBoxes)  │    │ & Enhance    │    │ (Recognition) │
└──────────────┘     └─────────────┘     └──────────────┘
                                              │
                                              ▼
                                     ┌─────────────────┐
                                     │ Text Cleaning &  │
                                     │ Auto-Correct     │
                                     └─────────────────┘
                                              │
                                              ▼
                                       OCR Result (JSON)
```

### Step-by-Step Pipeline

1. **Text Line Detection** — YOLOv8 model (`yolov8m_UrduDoc.pt`) detects bounding boxes for each text line in the document. Configurable confidence threshold and image resolution control detection sensitivity.

2. **Line Cropping & Enhancement** — Detected regions are cropped to individual line images. Optional image enhancement (auto-contrast, sharpen, denoise, background normalization, brightness/contrast tuning) can be applied per-request before recognition.

3. **Text Recognition** — UTRNet model (`best_norm_ED.pth`) with UNet feature extractor (encoder-decoder: 32→64→128→256→512 channels with skip connections), Bidirectional LSTM sequence modeling processing features from 5 dropout layers via weighted averaging, and CTC decoder for text index to character mapping.

4. **Text Cleaning** — Arabic script reshaping (for correct visual rendering), diacritic removal (tashkeel stripping), Alef normalization (merging مەدہ/میں/م onto single form), tatil character normalization (Persian/Kaf/Gha'in standardization), whitespace normalization (removing zero-width spaces and non-breaking spaces).

5. **Auto-Correction** — Multi-strategy spell correction based on configured mode: character confusion map, Levenshtein dictionary lookup, n-gram context scoring, phonetic matching, compound word decomposition, with optional UrduHack final pass.

6. **Result Caching** — SHA-256 hashed cache keys from (filename + confidence threshold + image size + cleaning flag) for deterministic lookup. In-memory LRU with disk-persisted fallback. Results served instantly for identical parameters without re-running the pipeline.

---

## Supported Image Formats

| Extension | MIME Type(s) |
|---|---|
| `.jpg` / `.jpeg` | `image/jpeg` |
| `.png` | `image/png` |
| `.bmp` | `image/bmp`, `application/x-ms-bmp` |
| `.tiff` / `.tif` | `image/tiff` |
| `.webp` | `image/webp` |
| `.gif` | `image/gif` |
| `.svg` | `image/svg+xml` |

Maximum file size: **500 MB** (configurable via `OCR_MAX_FILE_SIZE_MB`). Minimum file size: 100 bytes (rejects empty or corrupted uploads).

---

## Metrics & Monitoring

The backend exposes comprehensive metrics through three channels simultaneously:

### Live Stats (JSON Endpoint)

Real-time system dashboard returned as JSON. Includes uptime in seconds, total requests/files processed/lines extracted/errors, live per-second approximations, global and OCR-specific request-per-second rates, latency histograms with p50/p95/p99/max percentiles for both global and OCR paths, per-API stats (OCR, PDF, Export) each with success count, fail count, files processed, lines extracted, and latency histogram, CUDA availability and GPU memory (used/total GB), CPU and RAM usage percentages, model loaded status, active compute device label, cache enabled flag, and rate limiting enabled flag.

### Prometheus Format (Text Endpoint)

Machine-readable metrics at `/metrics/prometheus` in standard Prometheus exposition format. Exposes all counters and histograms documented above including `total_requests`, `total_files_processed`, `ocr_success_count`, `latency_ocr_seconds_bucket`, `gpu_memory_used_bytes`, `cache_hit_rate_percent`, and per-API variants. Compatible with Grafana dashboards, Prometheus alerting rules, and Datadog integrations.

### Processing History (JSON Endpoint)

Query recent operations via `/analysis/history` with optional limit (1–200 entries) and operation type filter. Returns reversed chronological list of entries plus aggregated statistics: total operations, success/error breakdowns, per-operation-type counts, total lines extracted, total processing time, average processing time, average confidence, unique file count, and active time window.

---

## Spell Checker Dictionary

The built-in spell checker uses a comprehensive Urdu dictionary loaded from the `urdu-dict` data directory with no external network dependencies:

| Resource | Purpose |
|---|---|
| **Word List** | Core Urdu vocabulary for candidate generation during Levenshtein distance matching |
| **Bigrams** | Two-word sequence frequencies for context-aware scoring and n-gram evaluation |
| **Trigrams** | Three-word sequence frequencies for advanced language modeling of longer phrases |
| **All Unique Tokens** | Full token set used as the universe of valid words during correction search |

The dictionary is loaded into memory at startup. The spell checker also supports a runtime user dictionary (in-memory, persisted across sessions) for adding domain-specific terms — names, technical terms, or brand names that should never be corrected regardless of dictionary scoring.

---

## Dependencies

| Category | Package | Version |
|---|---|---|
| **Web Server** | FastAPI, Uvicorn (standard), python-multipart, Jinja2 | `>=0.104.0` / `>=0.24.0` / `>=0.0.6` / `>=3.1.2` |
| **Deep Learning** | PyTorch, Ultralytics (YOLOv8) | `>=2.0.0` / `>=8.0.0` |
| **Image Processing** | NumPy, Pillow, PyMuPDF | `>=1.26.0,<2.0` / `>=10.0.0` / `>=1.23.0` |
| **Urdu/Arabic NLP** | arabic-reshaper, PyArabic, urduhack | `>=3.0.0` / `>=0.6.0` / `>=1.0.0` |
| **Document Export** | python-docx (optional) | `>=0.8.11` |

All core OCR model architectures (UTRNet, CTCLabelConverter, UNet feature extractor, BidirectionalLSTM) are embedded directly in the codebase — no external model definition files or weights beyond the two `.pth` and `.pt` weight files.

---

## Reliability Features

| Feature | Details |
|---|---|
| **Result Caching** | Two-tier: in-memory LRU + disk-persisted JSON files. Deduplicates identical requests (same filename + parameters). Configurable TTL with automatic eviction on expiry. Hit rate tracked and reported in metrics. |
| **Rate Limiting** | Per-IP sliding window limiter (default 60 req/min). Returns HTTP `429 Too Many Requests` with `Retry-After` header and JSON body explaining remaining window. Excludes health, progress, live-stats, WebSocket, and Prometheus endpoints. Response includes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Window` headers. |
| **API Key Auth** | Optional authentication via `X-API-Key` header or `api_key` query parameter. Whitelisted paths skip auth. Returns `401 Unauthorized` (no key provided) or `403 Forbidden` (invalid key). |
| **CORS** | Configurable cross-origin policy for browser-based clients. Allows all methods and headers when enabled. |
| **Structured Logging** | Dual output: console handler (stdout) + rotating file handler (10 MB max, 5 backups, UTF-8 encoded). Log format includes timestamp, level, logger name, and message. Configurable via `OCR_LOG_LEVEL`. |
| **Request ID** | Every response includes `X-Request-ID` header (UUID-based) for request tracing across logging, metrics, and debugging. |
| **Latency Header** | All responses include `X-Processing-Time-Ms` header showing exact server-side processing time in milliseconds for performance monitoring. |
| **Per-Page Timeout** | 30-minute timeout per individual page prevents infinite hangs on corrupted PDF pages. Timed-out pages return empty results and processing continues with remaining pages. |
| **Overall Task Timeout** | 4-hour global timeout for extended batch PDF/OCR operations. Returns accumulated partial results with timeout status when exceeded. |
| **Task Cancellation** | Graceful mid-processing cancellation via dedicated cancel endpoint. Stops at next page boundary, returns all completed pages plus cancellation metadata. |
| **GPU Kernel Check** | Validates CUDA kernel compatibility at startup by running a dummy inference pass. Falls back to CPU automatically if kernels are incompatible with the detected GPU model, preventing silent hangs during actual OCR work. |
| **Broken Page Handling** | PDF pages that fail to render (corrupted streams) are logged as warnings and skipped rather than halting the entire document processing. |

---

## Architecture Notes

- All core OCR components (UTRNet model architecture, CTCLabelConverter, text recognizer function) are embedded in `engine/loader.py` for zero external dependency on model definition files beyond weights
- The UNet feature extractor uses a standard encoder-decoder architecture: input(1) → inc(32) → down1(64) → down2(128) → down3(256) → down4(512) → up1(256) → up2(128) → up3(64) → up4(32) → outc(n_classes=512) with skip connections at each level
- Bidirectional LSTM sequence modeling processes features from 5 dropout layers (per-pixel dropout during training, deterministic during inference) via weighted averaging to produce contextual feature vectors
- Result cache keys are SHA-256 hashed from (filename + conf_threshold + img_size + clean flag) for deterministic lookup across requests
- PDF page rendering uses PyMuPDF pixmap renderer at configurable DPI with LANCOS thumbnail resizing for preview images
- Export formats include both text-only output and structured document generation with proper Markdown headings, paragraphs, and formatted tables
- Processing history and metrics engine use thread-safe dataclasses with per-datastructure locks for concurrent request handling without race conditions
- The spell checker supports lazy initialization — the UrduSpellChecker is only instantiated on first request, avoiding startup overhead when only serving health check or config endpoints

# API Test Suite — Urdu OCR v2 Backend

## Overview

Node.js test scripts that comprehensively verify all backend API routes (`/api/v2/*`).

Each script tests every route endpoint, validates HTTP status codes, checks response field shapes, and prints a color-coded summary.

## Setup

1. **Ensure the backend server is running:**
   ```bash
   cd backend/v2
   python -m uvicorn main:app --host 127.0.0.1 --port 8000
   ```

2. **(Optional) Override the API base URL:**
   ```bash
   # Default is http://localhost:8000/api/v2
   export API_BASE_URL=http://custom-host:9000/api/v2
   ```

## Running Tests

### Run all test groups (recommended):
```bash
cd frontend
npm test
# or
node tests/run-all-tests.js
```

### Run individual test group:
```bash
cd frontend/tests

node test-system-routes.js      # Health, stats, device switch, cache, config
node test-ocr-routes.js         # Batch OCR, single, enhanced, direct-tensor
node test-pdf-routes.js         # PDF info, extract, reconstruct, OCR
node test-export-routes.js      # TXT, CSV, DOCX, searchable PDF export
node test-realtime-routes.js    # Progress tracking, task cancellation, SSE streams, per-API stats, Prometheus metrics
```

### From npm scripts:
```bash
cd frontend
npm test                    # All groups
npm run test:system         # System routes only
npm run test:ocr            # OCR routes only
npm run test:pdf            # PDF routes only
npm run test:export         # Export routes only
npm run test:realtime       # Realtime/Realtime routes only
```

## What Each Script Tests

### `test-system-routes.js` (6 endpoints)
| Endpoint | Method | What's verified |
|----------|--------|-----------------|
| `/health` | GET | Status 200, healthy status, service info, model state, GPU memory |
| `/stats` | GET | Metrics engine data: requests, RPS, latency histograms, OCR counters |
| `/device/switch` | POST | Auto-detect, invalid device rejection (400), CPU switch |
| `/cache/stats` | GET | Cache object structure: entries, hits, misses, hit rate |
| `/cache/clear` | POST | Clear confirmation with status "ok" |
| `/config` | GET | Server/model/limits/features sections with correct field types |

### `test-ocr-routes.js` (6 tests across 4 endpoints)
| Endpoint | Method | What's verified |
|----------|--------|-----------------|
| `/ocr` (batch) | POST | task_id prefix, file counters, results array, processing time |
| `/ocr/single` | POST | Status 200, line shapes, confidence stats, cache_stats, field structure |
| `/ocr/with-enhance` | POST | Enhanced task_id, response shape with enhancement flags |
| `/ocr/direct-tensor` | POST | Direct pipeline output: filename, file_type, lines, confidence stats |
| text_cleaning=json | POST | JSON-formatted cleaning options parsing |
| invalid extension | POST | Error handling for unsupported file types |

### `test-pdf-routes.js` (5 tests across 4 endpoints)
| Endpoint | Method | What's verified |
|----------|--------|-----------------|
| `/pdf/info` | POST | Page count, metadata object, pages array |
| `/pdf/extract` | POST | Extracted pages with dimensions, DPI |
| `/pdf/reconstruct` | POST | Binary PDF response, invalid page range handling (400) |
| `/pdf/ocr` | POST | Per-page OCR results, task_id prefix, lines per page |
| invalid file type | POST | Error responses for non-PDF input |

### `test-realtime-routes.js` (10+ tests across 8 endpoints)
| Endpoint | Method | What's verified |
|----------|--------|-----------------|
| `/progress/{task_id}` | GET | Unknown task → not_found status, response shape |
| `/pdf/tasks/{task_id}/cancel` | POST | Non-existent task handling, response shape |
| `/live-stats/api/{ocr,pdf,export}` | GET | Per-API stats with success/fail counts, latency data; invalid API → 404 |
| `/live-stats/sse` | GET (SSE) | HTTP 200, text/event-stream content-type, live_stats event type |
| `/live-stats/ocr` | GET (SSE) | HTTP 200, text/event-stream, live_ocr event type |
| `/live-stats/pdf` | GET (SSE) | HTTP 200, text/event-stream, live_pdf event type |
| `/live-stats/export` | GET (SSE) | HTTP 200, text/event-stream, live_export event type |
| `/live-stats/events` | GET (SSE) | HTTP 200, heartbeat/data events |
| `/metrics/prometheus` | GET | HTTP 200, text/plain, HELP/TYPE comments, expected metric names, numeric values |
| `/live-stats/dashboard` | GET | HTTP 200, HTML content-type, HTML body |

### `test-export-routes.js` (6 tests across 5 endpoints)
| Endpoint | Method | What's verified |
|----------|--------|-----------------|
| `/export/txt` | POST | Text format, data string with content |
| `/export/csv` | POST | CSV format with comma-separated values |
| `/export/docx` | POST | Returns 200 (with python-docx) or 501 (without) with detail message |
| `/export/searchable-pdf` | POST | Base64 PDF output or error for missing PyMuPDF |
| empty result | POST | Graceful handling of minimal/empty OCR results |
| missing body | POST | FastAPI validation (422) for missing required JSON body |

## Test Infrastructure

- **`shared.js`** — shared utilities: `apiRequest()`, `hasField()`, `createTestPng()`, `createTestPdf()`, colored output helpers
- **`run-all-tests.js`** — main runner that executes all 5 scripts in sequence and prints a final summary
- **`test-realtime-routes.js`** — Realtime routes: progress tracking, task cancellation, SSE streams, per-API stats, Prometheus metrics
- Test files (`test_image.png`, `test_file.pdf`) are auto-generated on each run

## Exit Codes

- `0` — All tests passed
- `1` — One or more checks failed

## Notes

- File-upload routes (OCR, PDF) need the backend server running with OCR models loaded for full pass
- Without models, those endpoints return 500 — the test suite accepts this as "returns JSON error" rather than connection failure
- Export routes use mock JSON payloads and should pass even without a live server if they handle missing dependencies gracefully

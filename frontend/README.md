# Urdu OCR WebApp Frontend

A modern, feature-rich React frontend for end-to-end Urdu OCR processing. Built with **React 19**, **TypeScript**, **Vite 8**, and **Tailwind CSS v4** — styled with **Radix UI Themes** and **Lucide icons**. Provides a polished dark/light interface for image PDF OCR, spell checking, document analysis, real-time analytics, export, and system monitoring.

---

## Features Overview

| Feature | Description |
|---|---|
| Image OCR | Upload one or more images (JPEG, PNG, WebP, BMP, TIFF, GIF) to extract Urdu text via the v2 API. Supports batch processing, image enhancement toggles/sliders, live confidence stats, and AI-powered document insights (language detection, document type, summarization, table detection). |
| PDF OCR & Tools | Upload PDFs for metadata info extraction, page-by-page image extraction with thumbnail viewer, PDF reconstruction, and full-page OCR. Includes advanced options (device CPU/CUDA, detection model YOLO/DETR/MLLM, confidence threshold, layout analysis, post-processing, caching). |
| Spell Checker v4 | Seven-tab spell-checking workspace: **Correct** (auto-correct Urdu text), **Analyze** (error detection with script identification), **Suggest** (top-N word-level candidates with confidence), **Batch** (multi-text correction), **Romanize** (Urdu-to-Latin transcription), **User Dictionary** (add/remove/custom words), and **Analytics** (session-wide correction rates and strategy usage). |
| AI Insights | Dashboard showing processing history, operation breakdowns, average confidence, total lines extracted, average processing time per operation, and a recent-activity feed with confidence color-coding. |
| Export | Five export formats — JSON (structured metadata), Plain Text, CSV (per-line bounding boxes), Word (.docx) rich document, Searchable PDF (invisible text layer). Works with both image OCR and PDF OCR results. Includes aggregated stats visualization and mini bar charts. |
| Real-Time Stats | Three data-source modes for live server metrics: **SSE Stream**, **WebSocket** (with SSE fallback), and **Polling**. Displays uptime, total requests, OCR requests/sec, failure count, GPU memory, RAM usage, CPU load, global/OCR latency percentiles (p50, p95, p99, max), and per-endpoint success/failure/file counts. |
| System Monitor | Health check polling every 5 s, server config snapshot, cache hit/miss stats with clear-cache action, runtime CPU/CUDA device switching, and processing history table. |

---

## Tech Stack

- **React 19** with TypeScript — component-based UI with strict typing for all API shapes
- **Vite 8** — fast dev server and optimized production builds
- **Tailwind CSS v4** — utility-first styling with custom `@theme` tokens, animations, glass-card utilities, RTL support, gradient text, shimmer effects, floating particles, and dark/light variants
- **Radix UI Themes** — accessible primitive components; accent color set to `violet`
- **Lucide React** — consistent icon library across the entire app
- **Axios** — HTTP client with interceptors (error normalization, 120 s timeout), FormData upload with progress callbacks, and binary download support
- **React Context** — shared state for theme (`dark`/`light` persisted in `localStorage`) and toast notifications

---

## Project Structure

```
frontend/
├── public/                    # Static assets
├── src/
│   ├── main.tsx               # App entry — wraps <App /> with ThemeProvider, ToastProvider, Radix Theme
│   ├── App.tsx                # Shell layout (sidebar nav, header, footer) + InsightsPage
│   ├── index.css              # Global styles — Tailwind import, @theme custom tokens, animations, glass-card, gradient-border-glow, shimmer-effect, RTL/LTR utilities, scrollbar styling
│   ├── components/
│   │   └── ui/                # 25 reusable UI primitives (Badge, Button, Card, Dialog, ProgressBar, Toast, Popover, SelectAdvanced, ScrollArea, Tooltip, Switch, Tabs, Input, Textarea, Checkbox, ConfirmDialog, Forms, Alert, Loading, PdfViewerModal, AdvanceInput, AdvancedTextarea, Label)
│   ├── context/
│   │   ├── ThemeContext.tsx   # dark/light theme toggle with localStorage persistence
│   │   └── ToastContext.tsx   # Toast notification system (success/error/info/warning) with auto-dismiss after 4 s
│   ├── hooks/
│   │   ├── useDebounce.ts     # Debounced value hook for input handling
│   │   └── useRealtime.ts     # Real-time data hooks — useHealthPoll, useSseLiveStats, useWsLiveStats, useStatsPoll
│   ├── lib/
│   │   └── utils.ts           # cn() class merger (clsx + tailwind-merge) and formatBytes utility
│   ├── pages/
│   │   ├── OcrPage.tsx        # Image OCR page — file upload (drag & drop / paste / button), multi-file batch, enhancement toggles/sliders, spell-check integration, confidence stats bars, AI insights panel, per-result export (copy text, download TXT)
│   │   ├── PdfPage.tsx        # PDF tools page — 4 tabs: Info, Extract Pages, Reconstruct, OCR. Page range picker with auto-detection from metadata, thumbnail viewer modal, full-screen image viewer, progress tracking (elapsed time, ETA), line-level spell correction preview
│   │   ├── SpellPage.tsx      # Spell checker v4 — 7 sub-tabs: Correct, Analyze, Suggest, Batch, Romanize, User Dict, Analytics. Full CRUD on user dictionary, analytics dashboard with strategy usage bars
│   │   ├── StatsPage.tsx      # Live metrics page — KPI cards (uptime, requests, RPS, failures), GPU/RAM/CPU resource gauges with color-coded progress bars, latency percentile bars (p50/p95/p99/max), per-endpoint success/failure counts
│   │   ├── SystemPage.tsx     # System monitor — health polling, config display, cache stats with clear action, device switcher (CPU/CUDA), processing history table
│   │   └── ExportPage.tsx     # Export page — format cards for JSON, TXT, CSV, DOCX, PDF. Aggregated stats from last OCR run, confidence distribution bar chart, sparkline mini-charts, direct download triggers
│   ├── types/
│   │   └── api.ts             # 50+ TypeScript interfaces covering all API response/request shapes (OcrResult, BatchOcrResponse, PdfOcrResponse, SpellCheckResponse, AnalyzeResponse, SuggestResponse, LiveStats, HealthCheck, ServerConfig, HistoryEntry, UserDictEntry, etc.)
│   └── utils/
│       ├── apiClient.ts       # Axios instance — baseURL `/api/v2`, error interceptors, upload() with progress callback, postJson(), get(), downloadBinary()
│       ├── api/
│       │   ├── ocr.ts         # ocrSingle, ocrBatch, ocrEnhanced, ocrDirect
│       │   ├── pdf.ts         # pdfInfo, pdfExtract, pdfOcr, cancelPdfOcr
│       │   ├── spell.ts       # spellCheck, getSpellInfo, analyzeText, suggestWord, batchCorrect, romanizeText, getSpellAnalytics, addUserDictWord, removeUserDictWord, getUserDict
│       │   ├── system.ts      # fetchHealth, fetchStats, fetchConfig, fetchCacheStats, clearCache, switchDevice
│       │   ├── export.ts      # exportJson, exportTxt, exportCsv, exportDocx, exportSearchablePdf, exportPdfJson, exportPdfTxt, exportPdfCsv, exportPdfDocx, downloadBase64File, downloadTextFile
│       │   └── analysis.ts    # getHistory, clearHistory
│       ├── datetime.ts        # formatUptime(), formatTime()
│       ├── file.ts            # formatBytes(), isImageFile()
│       └── realtime.ts        # connectSse<T>(), connectLiveStats(), connectOcrStats(), connectPdfStats(), connectExportStats(), connectWsStats()
├── tests/                     # Integration test scripts for each route area
├── dist/                      # Production build output
├── vite.config.ts             # Vite config — React plugin, Tailwind v4 plugin, path alias (# -> src), dev proxy to backend
├── tsconfig*.json              # TypeScript configuration
├── package.json               # Dependencies and scripts
└── eslint.config.js            # ESLint rules
```

---

## Pages & Navigation

The app uses a single `Shell` component with sidebar navigation (6 tabs). The sidebar collapses on smaller screens, showing only icons until lg breakpoint.

| Tab | Route Equivalent | Description |
|---|---|---|
| **OCR** | `/ocr` | Image OCR — upload, enhance, process |
| **PDF** | `/pdf` | PDF tools — info, extract, reconstruct, OCR |
| **Spell** | `/spell` | Spell checker v4 — 7 sub-tabs |
| **Insights** | `/insights` | AI insights dashboard & history |
| **Stats** | `/stats` | Real-time server metrics |
| **System** | `/system` | Server health, config, cache |

---

## Image OCR Features (`OcrPage`)

### Upload Methods
- **Drag & Drop** — drag image files onto the upload zone
- **Click to Browse** — opens file picker for single or multi-file selection
- **Clipboard Paste** — paste images from clipboard via `Ctrl+V` (supports JPEG, PNG, WebP, BMP, GIF)

### Processing Modes
| Mode | Trigger | API Endpoint |
|---|---|---|
| Single Image | 1 file uploaded | `/api/v2/ocr/single` |
| Batch OCR | 2+ files, no enhancement toggles | `/api/v2/ocr` |
| Enhanced OCR | Any number of files with active toggles/sliders | `/api/v2/ocr/with-enhance` |
| Direct Pipeline | Raw pipeline call (no caching/cleaning) | `/api/v2/ocr/direct-tensor` |

### Image Enhancement Controls
Six toggleable preprocessing options:

| Toggle | Description |
|---|---|
| **Auto Contrast** | Adjust brightness and contrast automatically |
| **Sharpen** | Enhance edge clarity |
| **Denoise** | Reduce image noise |
| **Normalize BG** | Uniform background normalization |
| **Saturation** | Boost color intensity (1.5x multiplier) |
| **Deblur** | Reduce motion blur |

Four adjustable sliders:

| Slider | Range | Step |
|---|---|---|
| Brightness | -100 to 100 | 5 |
| Contrast | -100 to 100 | 5 |
| Gamma | 20 to 200 | 10 |
| Edge Enhance | 0 to 100 | 5 |

Toggles also generate CSS filter previews in real-time on the image preview.

### Spell Check Integration
Within OCR page, spell settings can be enabled per-request:
- **Mode**: Character Map, Dictionary (Levenshtein), or Hybrid (best quality)
- **Max Distance**: Edit distance threshold for corrections
- **Word Frequency**: Whether to use word frequency in suggestions

### AI Document Insights Panel
Available as a collapsible panel on each OCR result:
- **Language Detection** — primary language with confidence percentage, plus all detected languages with proportions (Urdu, Arabic, English, Persian, Mixed)
- **Document Type Classification** — auto-detects receipts, letters, book pages, forms, handwritten text, table documents; displays with contextual icons
- **Content Statistics** — word count, sentence count, average word length, uniqueness ratio
- **AI Summary** — generated title, summary paragraph, and top keywords with badges
- **Table Detection** — if a table is found, shows row/column dimensions

### Result Display
Each result card includes:
- Original image preview with enhancement filter overlay
- Extracted text in RTL Urdu-capable typography (Noto Nastaliq Urdu / Jameel Noori Nastaleeq)
- Per-line confidence with color coding: green (>= 70%), amber (>= 40%), red (< 40%)
- Confidence stats bars — Mean, Median, Min, Max with gradient fills
- Per-line correction preview with spell-check highlights
- Copy-to-clipboard button for extracted text
- Download as `.txt` file

### Batch Processing Progress
- Animated SVG progress ring with gradient stroke (violet -> blue -> emerald)
- Floating particle animation overlay
- Percentage display and per-file counter (`image 3 of 7`)
- Status bar below the ring

---

## PDF Features (`PdfPage`)

### Four Tabbed Sections

#### Info Tab
Displays PDF metadata: filename, total pages, title, author, subject, creator, producer, creation/modification dates, page dimensions. Auto-loaded on file selection.

#### Extract Pages Tab
- Extracts each page as a separate image with configurable DPI
- Thumbnail grid with click-to-view full-size modal
- Page range picker (from/to) with auto-fill from metadata
- Live progress tracking during extraction
- Cancel button for long-running jobs

#### Reconstruct Tab
Rebuilds PDFs from extracted images with the specified page range.

#### OCR Tab
Full multi-page PDF OCR:
- **Basic Options**: confidence threshold, image size (1280px default), text cleaning toggle
- **Advanced Options** (expandable):
  - Use cache (on/off)
  - Device: CPU or CUDA
  - Detection type: YOLO, DETR, or MLLM
  - Detection confidence threshold
  - Layout analysis (on/off)
  - Post-processing (on/off)
- **Live Progress**: pages completed counter, elapsed time, per-page timing, estimated remaining time
- **WebSocket Streaming**: real-time results as each page is processed, with partial result display
- **Line-Level Spell Correction Preview**: on-demand spell check on any line with highlighted corrections

---

## Spell Checker v4 (`SpellPage`)

### 7 Sub-Tabs

#### Correct
Type or paste Urdu text and auto-correct it in one click. Shows corrected text side-by-side with original, correction count, and individual correction details (from/to words with position highlighting).

#### Analyze
Scan text for errors without modifying it. Returns:
- Detected script (Urdu, Arabic, Mixed)
- Structured error list with word, position, length, suggestions array, confidence score, and reason
- Total error count with visual severity indicators

#### Suggest
Get top-N correction candidates for each problematic word. Each candidate includes the suggestion text, confidence score (0–1), and reasoning. Configurable `N` value.

#### Batch
Process multiple text blocks in a single API call. Add/remove individual text blocks dynamically. Shows per-text results with error status indicators.

#### Romanize
Convert Urdu text to approximate Latin transcription. Displays word-by-word mapping (Urdu -> Latin) plus the full transcription string.

#### User Dictionary
Manage custom vocabulary:
- Add words to persistent user dictionary
- Remove previously added words
- View current dictionary size and full word list
- Server-side storage with `added_at` timestamps

#### Analytics
Session-level spell-checking statistics:
- Total corrections made, texts processed, correction rate percentage
- Average confidence score
- Strategy usage breakdown (which correction strategies were used most)
- Dictionary stats (word count, bigrams, trigrams, unique tokens)

---

## AI Insights Dashboard (`InsightsPage`)

Aggregates processing history from the backend analysis API:

### Summary KPI Cards
- **Total Operations** — cumulative number of all OCR/export operations
- **Average Confidence** — mean confidence across all results (percentage)
- **Total Lines Extracted** — count of all text lines across all runs
- **Average Processing Time** — mean time in milliseconds per operation

### Operations Breakdown
Grid showing counts grouped by operation type (image_ocr, pdf_ocr, export, etc.) with styled cards.

### Recent Activity Feed
Last 10 operations displayed as rows showing:
- File name (truncated)
- Operation type and processing time
- Confidence percentage color-coded (green >= 70%, amber >= 40%, red < 40%)
- Timestamp in HH:MM format

---

## Real-Time Stats (`StatsPage`)

### Data Source Selector
Three modes displayed as toggle buttons:
1. **SSE Stream** — Server-Sent Events for low-latency updates (~1 s)
2. **WebSocket** — bidirectional with auto-reconnect; falls back to polling
3. **Polling** — HTTP polling at 2-second intervals

### Hero KPI Row
Four large metric cards:

| Metric | Description | Color Theme |
|---|---|---|
| Uptime | Server uptime (days, hours, minutes) | Emerald with pulse indicator |
| Total Requests | All handled requests | Violet |
| OCR RPS | Requests per second for OCR operations | Blue |
| Failures | Failed OCR operations count | Red (with "Needs attention" when > 0) |

### Resource Usage Row
Three side-by-side resource monitors with animated gradient progress bars:

| Resource | Displayed Values | Color Gradient |
|---|---|---|
| GPU Memory | GB used / total GB, percentage | Blue -> Cyan |
| RAM Usage | GB used / total GB, percentage | Purple -> Pink |
| CPU Usage | Percentage with color-coded label (green/amber/red based on threshold) | Emerald/Green -> Amber/Yellow -> Red/Rose |

### Latency Cards
Two cards showing percentile breakdowns for:
- **Global Latency** — all endpoint latencies
- **OCR Latency** — OCR-specific latencies

Each displays p50, p95, p99, and Max in milliseconds with proportional gradient bars.

### Per-Endpoint Metrics
Detailed table of every API endpoint showing success count (green dot), error count (red dot), and files processed count.

---

## Export Page (`ExportPage`)

### Supported Formats

| Format | Description | Icon Color | Use Case |
|---|---|---|---|
| **JSON** | Structured data with lines, confidence scores, and bounding box metadata | Violet | Programmatic processing, integration |
| **Plain Text** | Clean extracted text, copy or download ready | Emerald | Reading, copying, pasting |
| **CSV** | Tabular export with per-line bounding box coordinates (x1, y1, x2, y2) | Blue | Spreadsheet analysis |
| **Word (.docx)** | Rich document with formatted text and metadata | Sky blue | Document creation, printing |
| **Searchable PDF** | Image-based PDF with invisible overlaid text layer for search functionality | Rose | Archival, sharing with text search |

### Data Source
Automatically detects the last OCR or PDF OCR result. Shows source filename and type indicator.

### Visual Elements
- Aggregated stats from last run: total detected lines, average confidence, total pages, character count
- Confidence distribution histogram (bucketed bars)
- Per-line sparkline mini-charts showing confidence trajectory across all extracted lines
- One-click export card for each format with loading states and download triggers

---

## System Page (`SystemPage`)

### Server Status Card
Health endpoint polled every 5 seconds:
- Service name, version string
- Active device (CPU/CUDA) vs default device
- CUDA availability indicator
- Model loaded status
- GPU memory used / total with percentage
- Color-coded status indicators (green = healthy, red = issues)

### Configuration Card
Reads and displays server configuration:
- Server host, port, worker count
- Default model device, confidence threshold, image size
- Rate limiting settings (requests per window)
- Feature flags: cache enabled, rate limiting, authentication, text cleaning, autocorrect mode

### Cache Statistics
Displays hit/miss counts and total cache entries with a clear-cache button.

### Device Switcher
Runtime CPU/CUDA device switching with immediate health refresh after switch.

### Processing History Table
Table of recent operations with columns for timestamp, operation type, filename, status, detected lines, processing time, confidence mean, language, document type, file size (formatted), and device used. Includes history clear action.

---

## UI Components Library (`src/components/ui`)

| Component | Purpose |
|---|---|
| **Badge** | Status/category labels with color variants |
| **Button** | Styled buttons with loading spinner support |
| **Card** | Container with optional header, title, description |
| **Dialog** | Modal overlay system with backdrop blur |
| **ConfirmDialog** | Confirmation modal for destructive actions |
| **ProgressBar** | Linear progress bar with indeterminate mode |
| **Popover** | Floating content positioned relative to trigger |
| **SelectAdvanced** | Searchable dropdown with multi-select support |
| **ScrollArea** | Custom styled scrollbar container |
| **Tooltip** | Hover-triggered text hints |
| **TooltipMini** | Compact tooltip variant |
| **Switch** | Toggle switch for boolean options |
| **Tabs** | Tabbed interface component |
| **Input** | Text input with label and validation states |
| **Textarea** | Multi-line text input with label |
| **AdvanceInput** | Extended input with prefix/suffix slots |
| **AdvancedTextarea** | Extended textarea with character count |
| **Checkbox** | Checkbox with custom styling |
| **Alert** | Alert banners (success, error, warning, info) |
| **Forms** | Form field utilities and validation helpers |
| **Label** | Accessible form label component |
| **Loading** | Spinner/loading state components |
| **PdfViewerModal** | PDF page preview modal viewer |

---

## Real-Time Hooks (`src/hooks/useRealtime.ts`)

| Hook | Data Source | Update Interval | Fallback |
|---|---|---|---|
| `useHealthPoll` | `/health` | 5 s (configurable) | None |
| `useSseLiveStats` | SSE `/live-stats/sse` | Server-driven (~1 s) | None |
| `useWsLiveStats` | WebSocket `/ws/stats` | Server-driven | `useStatsPoll` at 5 s |
| `useStatsPoll` | `/stats` | 2 s (configurable) | None |

All hooks use axios for HTTP requests, handle cancellation on unmount via cleanup flags and interval clearing, and gracefully handle errors without crashing.

### Real-Time Utilities (`src/utils/realtime.ts`)
- `connectSse<T>()` — generic SSE connection factory with typed events
- `connectLiveStats()` — live stats SSE connection
- `connectOcrStats()` — OCR-specific SSE stream
- `connectPdfStats()` — PDF-specific SSE stream
- `connectExportStats()` — Export-specific SSE stream
- `connectWsStats()` — WebSocket connection with subscription/unsubscription protocol, binary frame decoding, pong message filtering, and automatic cleanup

---

## Theming System

### Dark Mode (Default)
- Background: `#0b0f19`
- Text: `#e2e8f0`
- Glass cards: `rgba(30, 41, 59, 0.35)` with blur
- Accent: Violet (`#8b5cf6`)

### Light Mode
- Background: `#f1f5f9`
- Text: `#0f172a`
- Glass cards: `rgba(255, 255, 255, 0.7)` with blur
- Accent: Violet (`#8b5cf6`)

Theme preference persists in `localStorage` under key `ocr-theme`. Toggles between adding/removing `.dark` class on the `<html>` element and setting `data-theme` attribute.

### CSS Custom Tokens
Defined in `@theme` block within `index.css`:
- Color tokens for backgrounds, borders, accents (violet, blue, emerald, amber, rose)
- Font families: Inter/Sans-serif for UI, Noto Nastaliq Urdu/Jameel Noori Nastaleeq for Urdu text
- 15 custom animations: shimmer, fadeIn, slideInLeft, pulse-glow, gradientShift, floatUp, countUp, spinRing, float, slideUp, shimmerAnim, breathe, cardFloatIn, particleDrift, gradientBorder

### Glass Card System
Reusable glass-morphism utility class (`glass-card`) with hover states that respond to dark/light theme:
- Dark: semi-transparent slate background with blur, violet border on hover
- Light: white translucent background with blur, violet border on hover

---

## Styling Details

### Typography
- **UI text**: Inter / SF Pro Display / -apple-system font stack
- **Urdu text**: Noto Nastaliq Urdu / Jameel Noori Nastaleeq serif font stack
- **RTL support**: `.rtl` and `.ltr` utility classes for direction control

### Animations
- Staggered animation delays (`stagger-1` through `stagger-5`)
- Floating particle system with configurable position, duration, and delay via CSS custom properties
- Processing ring with SVG gradient stroke animation
- Shimmer loading placeholders
- Card float-in animations with cubic-bezier easing

### Scrollbar Customization
Thin 6px scrollbars with theme-aware thumb colors that change on hover.

---

## API Client (`src/utils/apiClient.ts`)

Axios instance configured at `baseURL: '/api/v2'` with:
- Default headers: `Content-Type: application/json`
- Timeout: 120 seconds (extended to 300 s for uploads)
- Response interceptor normalizes error shapes to `{ status, message }`

### Key Functions
| Function | Purpose |
|---|---|
| `upload<T>(url, file, fieldKey, params, onProgress)` | FormData upload with progress callback (0–100%) |
| `postJson<T>(url, body)` | JSON POST request |
| `get<T>(url)` | GET request returning typed data |
| `downloadBinary(url, file, params, filename)` | Binary download triggering browser save dialog |
| `toUrl(route)` | URL builder for relative routes (e.g., `'ocr/single'` -> `/api/v2/ocr/single`) |

---

## Development Scripts

```bash
npm run dev        # Start Vite dev server (localhost:5173)
npm run build      # TypeScript check + production build to dist/
npm run preview    # Preview production build locally
npm run lint       # ESLint check
npm run test       # Run all integration tests
npm run test:system   # Test system routes only
npm run test:ocr      # Test OCR routes only
npm run test:pdf      # Test PDF routes only
npm run test:export   # Test export routes only
npm run test:realtime # Test realtime routes only
```

---

## Configuration

### Vite Dev Server
- Proxy `/api` requests to the backend (configurable via `VITE_API_WS_HOST` env variable, defaults to `localhost:8000`)
- Path alias `#` maps to `src/` directory for clean imports (e.g., `#/utils/api/ocr`)

### TypeScript
- Strict mode enabled
- JSX: `react-jsx` reactiveness
- Path resolution: `#/*` -> `./src/*`
- Composite project references across tsconfig files

### ESLint
- ESLint v10 with flat config
- React Hooks plugin for rules around hooks usage
- React Refresh plugin for fast HMR
- TypeScript ESLint for type-aware linting

---

## Type Safety

All API responses are fully typed via `src/types/api.ts` — over 50 interfaces covering:
- OCR results (single, batch, enhanced, per-line with confidence and bounding boxes)
- PDF results (info, extraction, per-page OCR, full document)
- Spell checker v4 (corrections, analysis, suggestions, batch, romanization, analytics, user dictionary)
- System health, configuration, cache stats, device switch responses
- Live statistics (GPU/RAM/CPU metrics, latency percentiles, per-API counters)
- Server-Sent Events envelopes and message types
- Export format responses (text data and base64 binary)

---

## Toast Notifications

System-wide toast notifications at `top-right` corner (`z-index 10000`):
- **Success** — green border-left, checkmark icon
- **Error** — red border-left, alert circle icon
- **Info** — blue border-left, info icon
- **Warning** — amber border-left, bell icon

Auto-dismiss after 4 seconds. Manual dismiss via X button. Accessible with `aria-live="polite"`.

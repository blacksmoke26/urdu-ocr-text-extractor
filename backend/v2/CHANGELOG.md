# Changelog - Urdu OCR Engine v2 Improvements

## [v2.1.1] — 2026-06-17

### 🐛 Critical Fix: Zero Detections After Enhancement Rewrite

The initial enhancement rewrite caused **zero text line detections** on all pages. Root cause analysis revealed:

- `ImageOps.equalize()` globally redistributes ALL pixel values, destroying the high-contrast black-on-white pattern that YOLO's detection model was trained on
- Double-pass sharpening created halo artifacts that fragmented Urdu stroke patterns
- The adaptive pipeline ran BEFORE detection — enhancing the image made it look nothing like training data

**Fix**: Detection now ALWAYS runs on raw grayscale (preserving trained features). Enhancement is applied ONLY after detection, for recognition only. Enhancement thresholds are conservative (`contrast < 30` instead of `< 80`). No histogram equalization — only mild brightness/contrast adjustments.

## [v2.1.0] — 2026-06-17

### 🐛 Critical Bug Fixes

- **Fixed dropout during inference** (`loader.py`): The custom `dropout_layer` was applying random dropout even when `model.eval()` was called, causing non-deterministic OCR results on every run. Now respects PyTorch's train/eval mode via `self.training`.
- **Fixed duplicate code** in annotated image generation — now generated once in `preprocess_image()` instead of twice.

### ✨ New Features

#### Urdu Text Auto-Correction (Toggle via ENV)
- New character-level confusion map for common Urdu OCR errors:
  - ب/ت/ث (same shape, different dots)
  - چ/ج (different dot counts)
  - ک/گ (Persian vs Urdu Kaf/Gaf)
  - ی/ئ (Yeh vs Hamza on Yeh)
  - ة/ہ (Teh Marbuta vs Heh Ghunna)
  - و/ؤ (Waw variants)
- Context-aware word-level dictionary correction for common misspellings
- Two modes: `char` (character substitution) and `context` (dictionary-based)
- **ENV**: `URDUTEXT_AUTOCORRECT_ENABLED=true/false` (default: `false`)
- **ENV**: `URDUTEXT_AUTOCORRECT_MODE=char|context` (default: `char`)
- Can also be toggled per-request via JSON text_cleaning: `{"autocorrect": true, "autocorrect_mode": "char"}`

#### Improved Text Detection
- **Bounding box padding**: YOLO boxes are now expanded by 10% (configurable via `BBOX_PADDING_PERCENT`) to capture full character context including Urdu ascenders/descenders
- **Smart bounding box visualization**: Green for high-confidence detections (>0.5), red for low confidence

#### Improved Text Recognition
- **Beam search decoding** (`BEAM_SEARCH_WIDTH` config, default: 5): Instead of greedy single-path decoding, the engine now evaluates top-k beam candidates and selects the highest-scoring path via log-probability scoring
- **Per-character confidence**: Each line now includes `char_confidences` — an array of per-position confidence scores
- **Enhanced confidence statistics**: `confidence_stats` now includes `char_mean` and `char_std` for granular quality assessment

#### Automatic Image Enhancement
- **Quality detection engine**: Analyzes incoming images for contrast, sharpness (Laplacian variance), brightness, and noise level — all without requiring OpenCV dependency
- **Adaptive preprocessing pipeline**: Applies targeted enhancements based on detected quality:
  - Low contrast → histogram equalization or moderate contrast boost
  - Blur → multi-pass sharpening + unsharp mask deblur
  - Noise → median denoising filter
  - Incorrect brightness → automatic normalization to ~140 mid-gray
- **ENV**: `AUTO_ENHANCE_ENABLED=true/false` (default: `true`)
- **ENV**: `AUTO_DEBLUR_ENABLED=true/false` (default: `true`)

### ⚙️ Configuration Changes

New environment variables added to `config.py`:

| Variable | Default | Description |
|----------|---------|-------------|
| `URDUTEXT_AUTOCORRECT_ENABLED` | `false` | Enable Urdu auto-correction |
| `URDUTEXT_AUTOCORRECT_MODE` | `char` | Correction mode: `char` or `context` |
| `BBOX_PADDING_PERCENT` | `10` | % to expand detected bounding boxes |
| `AUTO_ENHANCE_ENABLED` | `true` | Enable automatic image enhancement |
| `AUTO_DEBLUR_ENABLED` | `true` | Enable automatic deblurring |
| `BEAM_SEARCH_WIDTH` | `5` | Beam search width for recognition decoding |

### 📝 API Changes

- OCR result lines now include `char_confidences` field (array of per-character confidence values)
- Confidence stats now include `char_mean` and `char_std` fields
- Auto-correction can be enabled via text_cleaning JSON parameter:
  ```json
  {"autocorrect": true, "autocorrect_mode": "char"}
  ```

### 🔧 Code Quality

- Removed duplicate annotated image code
- All OCR components now use unified preprocessing path
- Added clear documentation in `pipeline.py` header describing the improvements

## [v2.2.0] — 2026-06-17

### 🤖 AI-Powered Document Analysis (New)

#### Language Detection & Document Classification
- Automatic detection of predominant script/language (Urdu, Arabic, English, Persian, Mixed)
- Document type classification: receipt, letter, book page, form, handwritten, table document
- Content analysis: word count, sentence count, reading difficulty heuristics
- Returned on every OCR endpoint under `ai_analysis` field

#### Text Summarization (New Endpoint)
- Extractive summarization using TF-IDF-like scoring with positional weights
- Title/headline extraction from detected text
- Keyword extraction with frequency-based scoring
- Urdu and English stop-word aware
- **POST** `/api/v2/analysis/summarize` — summarize any extracted text

#### Smart Enhancement Recommendations (New Endpoint)
- Analyzes image quality metrics and recommends optimal preprocessing
- Returns quality score (0–1), specific feature recommendations with reasoning
- **POST** `/api/v2/analysis/recommend` — get enhancement suggestions

#### Table Detection (New Endpoint)
- Detects table-like structures in OCR output lines
- Identifies row/column boundaries from text patterns
- **POST** `/api/v2/analysis/table-detect` — analyze OCR lines for tables

#### Processing History (New Service + Endpoints)
- In-memory, thread-safe tracking of all OCR/PDF operations
- Stores: operation type, filename, status, lines detected, processing time, confidence, language
- Aggregated stats: total ops, by-status breakdown, avg confidence, unique files
- **GET** `/api/v2/analysis/history` — recent operations log + stats
- **GET** `/api/v2/analysis/history?operation=ocr_single` — filter by type
- **POST** `/api/v2/analysis/history/clear` — clear history

### New API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v2/analysis/document` | Full document analysis (language + type + content) |
| POST | `/api/v2/analysis/summarize` | Generate text summary with keywords |
| POST | `/api/v2/analysis/recommend` | Smart enhancement recommendations |
| POST | `/api/v2/analysis/table-detect` | Detect table structures in OCR lines |
| GET | `/api/v2/analysis/history` | Processing history log + aggregated stats |
| POST | `/api/v2/analysis/history/clear` | Clear processing history |

### Enhanced OCR Responses

Every OCR endpoint (`/ocr/single`, `/ocr/with-enhance`, `/ocr/direct-tensor`, `/ocr`) now returns additional fields:
- `ai_analysis` — language detection, document type, content metrics
- `summary` — extractive text summary + keywords (if text is long enough)
- `recommendations` — smart enhancement suggestions
- `table_detection` — detected table structures in OCR output

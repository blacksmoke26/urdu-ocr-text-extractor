# Urdu OCR MCP Server

MCP (Model Context Protocol) server that wraps the [End-to-End Urdu OCR Backend API](../backend/) as MCP **Tools**, **Resources**, and **Prompts**.

## Quick Reference — All MCP Tools

### OCR Tools

| MCP Tool Name | Backend Endpoint | Description |
|---|---|---|
| `ocr_single` | `POST /api/v2/ocr/single` | Single image OCR with full details, AI analysis |
| `ocr_batch` | `POST /api/v2/ocr` | Batch OCR for multiple images/PDFs (up to 10 files) |
| `ocr_with_enhance` | `POST /api/v2/ocr/with-enhance` | OCR with image enhancement (contrast, sharpen, denoise, etc.) |
| `ocr_direct_tensor` | `POST /api/v2/ocr/direct-tensor` | Direct OCR — no caching/cleaning, pure pipeline |

### PDF Tools

| MCP Tool Name | Backend Endpoint | Description |
|---|---|---|
| `pdf_info` | `POST /api/v2/pdf/info` | Get PDF metadata (pages, title, author, etc.) |
| `pdf_extract` | `POST /api/v2/pdf/extract` | Extract PDF pages as PNG images (base64) |
| `pdf_reconstruct` | `POST /api/v2/pdf/reconstruct` | Extract page range as new PDF file |
| `pdf_ocr` | `POST /api/v2/pdf/ocr` | Full PDF OCR with per-page text extraction |
| `cancel_pdf_task` | `POST /api/v2/pdf/cancel/{task_id}` | Cancel ongoing PDF task |
| `get_task_progress` | `GET /api/v2/progress/{task_id}` | Check long-running task progress |

### Export Tools (OCR results)

| MCP Tool Name | Backend Endpoint | Description |
|---|---|---|
| `export_json` | `POST /api/v2/export/json` | Export OCR result as JSON |
| `export_txt` | `POST /api/v2/export/txt` | Export OCR result as plain text |
| `export_csv` | `POST /api/v2/export/csv` | Export OCR result as CSV |
| `export_docx` | `POST /api/v2/export/docx` | Export OCR result as Word (.docx) |
| `export_searchable_pdf` | `POST /api/v2/export/searchable-pdf` | Export as searchable PDF with invisible text layer |

### Export Tools (PDF OCR results)

| MCP Tool Name | Backend Endpoint | Description |
|---|---|---|
| `export_pdf_json` | `POST /api/v2/export/pdf-json` | Export PDF OCR result as JSON |
| `export_pdf_txt` | `POST /api/v2/export/pdf-txt` | Export PDF OCR result as plain text |
| `export_pdf_csv` | `POST /api/v2/export/pdf-csv` | Export PDF OCR result as CSV with page numbers |
| `export_pdf_docx` | `POST /api/v2/export/pdf-docx` | Export PDF OCR result as Word (.docx) |

### Spell Check Tools

| MCP Tool Name | Backend Endpoint | Description |
|---|---|---|
| `spell_check` | `POST /api/v2/spell/check` | Auto-correct Urdu text (char, distance, hybrid, aggressive modes) |
| `spell_analyze` | `POST /api/v2/spell/analyze` | Analyze errors without auto-correcting |
| `spell_suggest` | `POST /api/v2/spell/suggest` | Get top-N correction candidates per word |
| `spell_batch` | `POST /api/v2/spell/batch` | Batch correct multiple texts |
| `spell_romanize` | `POST /api/v2/spell/romanize` | Roman (Latin) transcription of Urdu text |
| `spell_add_user_word` | `POST /api/v2/spell/user-dict/add` | Add word to user dictionary (never corrected) |
| `spell_remove_user_word` | `POST /api/v2/spell/user-dict/remove` | Remove word from user dictionary |
| `spell_list_user_dict` | `GET /api/v2/spell/user-dict` | List all words in user dictionary |
| `spell_analytics` | `GET /api/v2/spell/analytics` | Detailed spell-check session analytics |
| `spell_info` | `GET /api/v2/spell/info` | Spell checker config and dictionary stats |

### Analysis Tools

| MCP Tool Name | Backend Endpoint | Description |
|---|---|---|
| `analyze_document` | `POST /api/v2/analysis/document` | Language detection, document classification, content analysis |
| `summarize_text` | `POST /api/v2/analysis/summarize` | Extractive summarization with keywords and title |
| `recommend_enhancements` | `POST /api/v2/analysis/recommend` | Image quality analysis + enhancement recommendations |
| `detect_table` | `POST /api/v2/analysis/table-detect` | Detect table structures in OCR lines |
| `get_processing_history` | `GET /api/v2/analysis/history` | Recent processing operations log |
| `clear_processing_history` | `POST /api/v2/analysis/history/clear` | Clear processing history |

### System / Management Tools

| MCP Tool Name | Backend Endpoint | Description |
|---|---|---|
| `health_check` | `GET /api/v2/health` | Service health and model status |
| `get_stats` | `GET /api/v2/stats` | Live usage statistics (requests, latency, GPU, etc.) |
| `switch_device` | `POST /api/v2/device/switch` | Hot-swap CPU/CUDA at runtime |
| `get_cache_stats` | `GET /api/v2/cache/stats` | Cache hit/miss statistics |
| `clear_cache` | `POST /api/v2/cache/clear` | Clear all cached OCR results |
| `get_config` | `GET /api/v2/config` | Full running configuration dump |

### Resources (URI-based read)

| Resource URI | Description |
|---|---|
| `urdu-ocr://health` | Read-only health check |
| `urdu-ocr://config` | Read-only server configuration |
| `urdu-ocr://spell-info` | Read-only spell checker info |

## Available Prompts

The MCP server ships with **3 built-in workflow prompts** that orchestrate multi-step tool chains. You can also reference any of the 42 tools directly in conversation.

### Built-in Workflow Prompts

| Prompt Name | Description | Key Tools Used |
|---|---|---|
| `ocr-workflow` | Complete OCR + analysis pipeline | `ocr_single`/`ocr_batch`, `analyze_document`, `summarize_text`, `export_txt`/`export_csv` |
| `spell-check-workflow` | Urdu text correction with audit trail | `spell_analyze`, `spell_suggest`, `spell_check` |
| `pdf-ocr-workflow` | Full PDF processing and export | `pdf_info`, `pdf_ocr`, `analyze_document`, `export_pdf_txt`, `export_pdf_csv` |
| `document-quality-audit` | Quality-assured OCR with enhancement check | `recommend_enhancements`, `ocr_with_enhance`, `spell_check`, `summarize_text` |
| `export-pipeline` | Multi-format document export (all 6 formats) | `ocr_single`, all `export_*` tools |
| `pdf-to-structured-data` | Convert PDF to tabular structured data | `pdf_ocr`, `detect_table`, `export_pdf_json`, `export_pdf_csv` |
| `spelling-audit-report` | Deep spelling analysis with candidates | `spell_analyze`, `spell_suggest(n=5)`, `spell_check(aggressive)` |
| `large-document-batch` | Batch processing with custom vocabulary | `ocr_batch`, `spell_add_user_word`, `spell_list_user_dict`, `spell_analytics` |
| `system-health-check` | Full system diagnostics suite | `health_check`, `get_stats`, `get_cache_stats`, `get_config` |
| `bilingual-comparative` | Urdu + Roman transcription reference table | `ocr_single`, `spell_check`, `spell_romanize`, `summarize_text` |
| `pdf-reconstruction` | Selective page extraction with re-OCR | `pdf_info`, `pdf_extract`, `ocr_with_enhance`, `export_txt` |
| `research-document` | Academic document processing with findings | `ocr_single`/`pdf_ocr`, `analyze_document`, `summarize_text`, `detect_table` |
| `real-time-monitoring` | Active task progress monitoring loop | `get_task_progress`, `health_check`, `cancel_pdf_task` |
| `content-management` | Full document lifecycle — process to archive | `ocr_batch`, `spell_check`, `analyze_document`, multi-format export |
| `performance-optimization` | Pipeline optimization audit | `get_stats`, `get_cache_stats`, `switch_device`, `clear_cache` |

**How to use prompts:** Ask Claude Desktop or any MCP client: *"Run the ocr-workflow prompt"* — the client will invoke the template automatically.

### Quick Prompts (Use in Conversation)

These are short, natural-language prompts you can type directly to your MCP client. Each maps to one or more tool calls.

#### OCR & Text Extraction

| Prompt | What It Does | Underlying Tools |
|---|---|---|
| "Extract Urdu text from this image" | Single-pass OCR | `ocr_single` |
| "Batch-process these images for Urdu text" | Multi-image OCR in one go | `ocr_batch` |
| "Enhance and OCR this image" | Improve image quality then extract text | `ocr_with_enhance` |
| "Run fast OCR without caching" | Direct tensor pipeline (no overhead) | `ocr_direct_tensor` |

#### PDF Processing

| Prompt | What It Does | Underlying Tools |
|---|---|---|
| "What's in this PDF?" | Show metadata — pages, title, author | `pdf_info` |
| "Extract images from these PDF pages" | Convert PDF pages to PNG (base64) | `pdf_extract` |
| "Extract pages 5-10 from this PDF as a new file" | Reconstruct page range | `pdf_reconstruct` |
| "OCR this entire PDF for Urdu text" | Full per-page text extraction | `pdf_ocr` |
| "How far along is my PDF task?" | Check long-running task progress | `get_task_progress` |
| "Cancel the current PDF operation" | Stop a running PDF task | `cancel_pdf_task` |

#### Export & Formatting

| Prompt | What It Does | Underlying Tools |
|---|---|---|
| "Export OCR result as JSON" | Structured JSON output | `export_json` |
| "Export OCR result as plain text" | Clean plain text file | `export_txt` |
| "Export OCR result as CSV" | Tabular format with bounding boxes | `export_csv` |
| "Export OCR result as Word docx" | Microsoft Word document | `export_docx` |
| "Create a searchable PDF" | Invisible text layer over images | `export_searchable_pdf` |
| "Export PDF OCR as JSON/CSV/TXT/DOCX" | Export from full PDF OCR pipeline | `export_pdf_json`, `export_pdf_csv`, etc. |

#### Spell Check & Correction

| Prompt | What It Does | Underlying Tools |
|---|---|---|
| "Correct the spelling in this Urdu text" | Auto-correct with hybrid mode | `spell_check` |
| "Analyze errors in this text (don't fix yet)" | Show error breakdown only | `spell_analyze` |
| "Suggest corrections for misspelled words" | Top-N candidates per word | `spell_suggest` |
| "Correct these multiple texts at once" | Batch spelling correction | `spell_batch` |
| "Transcribe this Urdu text in Roman/Latin script" | Romanization | `spell_romanize` |
| "Add this word to my never-correct list" | User dictionary management | `spell_add_user_word` / `spell_remove_user_word` |
| "What words are in my user dictionary?" | List custom dictionary | `spell_list_user_dict` |
| "Show spell-check statistics for this text" | Analytics on correction patterns | `spell_analytics` |
| "Show spell checker config and dict size" | Dictionary stats and thresholds | `spell_info` |

#### Document Analysis

| Prompt | What It Does | Underlying Tools |
|---|---|---|
| "What language and type is this document?" | Language detection + classification | `analyze_document` |
| "Summarize this extracted text" | Extractive summary with keywords | `summarize_text` |
| "How good is the image quality? What should I fix?" | Image enhancement recommendations | `recommend_enhancements` |
| "Detect tables in these OCR lines" | Table structure detection | `detect_table` |

#### System & Diagnostics

| Prompt | What It Does | Underlying Tools |
|---|---|---|
| "Is the OCR service healthy?" | Health check with model status | `health_check` |
| "Show system stats — GPU, requests, latency" | Live metrics dashboard | `get_stats` |
| "Switch OCR to GPU/CPU" | Hot-swap compute device | `switch_device` |
| "How much cache is being used?" | Cache hit/miss rates | `get_cache_stats` |
| "Clear the OCR result cache" | Reset cached outputs | `clear_cache` |
| "Dump the full server configuration" | All running config values | `get_config` |

### Complex Workflow Prompts

These multi-step prompts combine several tools for advanced tasks. Type these verbatim in your MCP client:

#### Complete Document Pipeline
> "Process this document end-to-end: OCR it, analyze the language and document type, summarize the content, correct any spelling errors, and export as both TXT and CSV."

**Tools used:** `ocr_single` → `analyze_document` → `summarize_text` → `spell_check` → `export_txt` → `export_csv`

#### PDF-to-Structured-Data Pipeline
> "Extract Urdu text from this PDF, detect any tables within it, and export the results as JSON with page numbers."

**Tools used:** `pdf_info` → `pdf_ocr` → `detect_table` → `export_pdf_json`

#### Quality-Guided OCR
> "Check if this image needs enhancement before OCR. If yes, enhance it first, then extract text and compare the results."

**Tools used:** `recommend_enhancements` → `ocr_with_enhance` (or `ocr_single`)

#### Spelling Audit Report
> "Analyze this Urdu text for spelling errors, show correction suggestions for each misspelled word, apply corrections using aggressive mode, and explain what changed."

**Tools used:** `spell_analyze` → `spell_suggest` → `spell_check(mode="aggressive")`

#### Large Document Batch Processing
> "Process these 5 images with batch OCR, then create a user dictionary from all unique proper nouns (words that don't need correction), and show the final statistics."

**Tools used:** `ocr_batch` → `spell_analyze` → `spell_add_user_word` (per word) → `spell_list_user_dict` → `spell_analytics`

## Total Coverage: 42 MCP tools, 3 resources, 15 prompts

**All 20+ backend API endpoints covered across:**
- 7 OCR endpoints → 4 MCP tools
- 5 PDF endpoints → 6 MCP tools (including cancel + progress)
- 9 Export endpoints → 9 MCP tools (grouped by type)
- 8 Spell Check endpoints → 10 MCP tools (grouped by function)
- 6 Analysis endpoints → 6 MCP tools
- 6 System endpoints → 6 MCP tools

## Setup

### Prerequisites

```bash
# Python 3.10+ required
python --version  # should be >= 3.10

# Ensure the backend API is running first:
cd ../backend
./start-server.sh  # or: uvicorn v2.main:app --host 0.0.0.0 --port 8000
```

### Install Dependencies

```bash
cd mcp-server
uv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
uv pip install "mcp[cli]" httpx
```

Or with `uv` directly:

```bash
uv run --with "mcp[cli]" --with httpx python server.py
```

### Run the MCP Server

#### Option 1: stdio transport (Claude Desktop, VS Code, local CLI)

```bash
# Default — uses stdio
uv run server.py

# With custom backend URL
OCR_API_BASE_URL=http://your-server.com/api/v2 uv run server.py
```

#### Option 2: streamable-http transport (remote hosting)

```bash
uv run server.py --transport streamable-http --host 127.0.0.1 --port 9000
# Server available at http://127.0.0.1:9000/mcp
```

### Claude Desktop Configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS/Linux) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "urdu-ocr": {
      "command": "uv",
      "args": [
        "--directory", "/ABSOLUTE/PATH/TO/urdu-ocr-text-extractor/mcp-server",
        "run", "server.py"
      ]
    }
  }
}
```

On Windows (using forward slashes in paths):

```json
{
  "mcpServers": {
    "urdu-ocr": {
      "command": "uv",
      "args": [
        "--directory", "/ABSOLUTE/PATH/TO/urdu-ocr-text-extractor/mcp-server",
        "run", "server.py"
      ]
    }
  }
}
```

## Testing

### Run the Test Suite

```bash
python -m pytest test_server.py -v
# Result: 45 tests passing (42 original + 3 bugfixes)
```

The test suite covers:
- Tool registration and schema validation
- URL construction for every endpoint category
- Request/response mocking for all 41 tools
- Resource URI resolution and format verification
- Prompt template message count validation
- Module isolation (each test gets a fresh server import)

### With MCP Inspector (visual testing)

```bash
# Terminal 1 — start the server
uv run server.py

# Terminal 2 — launch inspector
npx @modelcontextprotocol/inspector
# Or with uv:
uv run --with mcp[cli] mcp dev server.py
```

### With curl (manual API verification)

```bash
# Verify backend is reachable from the MCP server context
curl http://localhost:8000/api/v2/health

# Test a tool call via Claude Desktop — ask:
# "Check if the OCR service is healthy"
# This will invoke health_check() internally
```

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `OCR_API_BASE_URL` | `http://localhost:8000/api/v2` | Backend API base URL |

## Architecture

```
MCP Client (Claude Desktop / VS Code / custom)
       │
       ▼
MCP Protocol (stdio or streamable-http)
       │
       ▼
┌──────────────────────┐
│   urdu-ocr-mcp-server │
│                      │
| Tools: 42 MCP tools │───── HTTP ────► Backend API (FastAPI)
│  Resources: 3 URIs   │                   /api/v2/*
│  Prompts: 15 templates│
└──────────────────────┘
```

### Transport Modes

| Mode | Use Case | Endpoint |
|---|---|---|
| `stdio` | Local Claude Desktop, VS Code, CLI tools | Standard I/O (JSON-RPC) |
| `streamable-http` | Remote hosting, cloud deployment | `POST /mcp` at configured port |

### Key Design Decisions

1. **File handling**: MCP clients pass files as base64-encoded data (since MCP doesn't support native file uploads). The server decodes them internally before sending to the backend.
2. **All responses are JSON strings** — MCP tool results must be strings, so all API responses are serialized with `json.dumps(indent=2)`.
3. **Long operation timeout**: 600s (10 min) for PDF operations that may take hours on the backend side. The backend handles per-page timeouts and cancellation.
4. **Logging to stderr** — safe for both stdio and HTTP transports, never writes to stdout (which would corrupt JSON-RPC messages).

## Troubleshooting

### Server not starting

```bash
# Check Python version
python --version  # need >= 3.10

# Check backend is running
curl http://localhost:8000/api/v2/health

# Verify MCP dependencies
uv pip list | grep -E "mcp|httpx"
```

### Tools not showing up in Claude Desktop

1. Restart Claude Desktop **completely** (Quit, don't close window)
2. Check `claude_desktop_config.json` has correct absolute paths
3. Verify no typos in tool names — list available tools:
   ```bash
   # Inside Claude Desktop, ask: "List all available MCP tools"
   ```

### Connection errors

```bash
# Test backend connectivity from server context
OCR_API_BASE_URL=http://localhost:8000/api/v2 uv run python -c "
import httpx, asyncio
async def test():
    async with httpx.AsyncClient() as c:
        r = await c.get('http://localhost:8000/api/v2/health')
        print(r.json())
asyncio.run(test())
"
```

### PDF operations hanging

- The MCP server has a 600s timeout. For very large PDFs, use the backend's WebSocket progress endpoint directly or rely on `get_task_progress` tool.
- Check that OCR models are loaded on the backend: `health_check()` tool.

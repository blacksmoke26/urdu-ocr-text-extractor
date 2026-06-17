# Urdu OCR v2 Scripts — Complete Reference

All scripts run from the project root. Models auto-load on first use (~10–30s).

```bash
cd backend/v2
python scripts/<script>.py [args]
```

## Script Index

### Core OCR Processing
| Script | Purpose | Example |
|--------|---------|---------|
| `batch_ocr.py` | Batch process all images+PDFs in a directory with caching, metrics & multi-format export | `python scripts/batch_ocr.py ./documents -o ./results --recursive --format json,txt,csv` |
| `ocr_image.py` | Advanced single/multi-image OCR with text cleaning levels & JSON/TXT output | `python scripts/ocr_image.py docs/*.jpg -o result.json --clean full` |
| `ocr_pdf.py` | Full PDF OCR with per-page results, text cleaning & multi-format export | `python scripts/ocr_pdf.py doc.pdf --pages 1-5 -o ./texts --format txt,json,csv` |
| `full_pipeline.py` | End-to-end: PDF → extracted images + annotated pages + per-page text files | `python scripts/full_pipeline.py doc.pdf -o ./pipeline --format json,txt,csv` |

### PDF Operations
| Script | Purpose | Example |
|--------|---------|---------|
| `extract_pdf_images.py` | Extract PDF pages as PNG/JPEG/WebP images at configurable DPI | `python scripts/extract_pdf_images.py doc.pdf -o ./images --dpi 150 --format jpeg` |
| `pdf_reconstruct.py` | Extract specific page ranges from a PDF into a new file with page listing | `python scripts/pdf_reconstruct.py doc.pdf --pages 2-5 -o subset.pdf` |

### Image Processing
| Script | Purpose | Example |
|--------|---------|---------|
| `annotate_images.py` | Draw colored bounding boxes on images (with or without OCR detection) | `python scripts/annotate_images.py docs/*.jpg -o ./annotated/ --run-ocr --color green` |
| `convert_images.py` | Resize/convert/grayscale images for optimal OCR input quality | `python scripts/convert_images.py docs/ -o resized/ --resize 1920x1080 --grayscale` |

### Data Processing
| Script | Purpose | Example |
|--------|---------|---------|
| `merge_texts.py` | Merge multiple OCR text outputs into a single document (TXT/JSON/DOCX) | `python scripts/merge_texts.py -i page1.txt page2.txt -o merged.json --format json` |
| `export_all.py` | Convert a result dict to all supported formats (JSON/TXT/CSV/DOCX/PDF) at once | `python scripts/export_all.py --input result.json -o ./exports/` |

### Development & Operations
| Script | Purpose | Example |
|--------|---------|---------|
| `check_setup.py` | Verify environment: Python, CUDA, packages, models, v2 engine structure | `python scripts/check_setup_v2.py` |
| `install_deps.py` | Install all v2 dependencies with pip (supports --gpu, --dev flags) | `python scripts/install_deps_v2.py --gpu` |
| `benchmark.py` | Benchmark OCR latency/throughput across confidence thresholds with GPU stats | `python scripts/benchmark.py --input ./test_images/ --reps 10` |
| `compare_models.py` | Compare YOLO detection confidence thresholds to find optimal value | `python scripts/compare_models_v2.py --input ./test/ --thresholds 0.1 0.2 0.3` |
| `watch_folder.py` | Continuously watch a directory for new files and process them automatically | `python scripts/watch_folder_v2.py ./incoming/ -o ./processed/ --format json,txt` |
| `ocr_server.py` | CLI wrapper to launch the v2 FastAPI server with uvicorn | `python scripts/ocr_server_v2.py --port 9000 --device cuda` |

## Quick Workflows

### Full batch pipeline on a directory of mixed images+PDFs:
```bash
# 1. Check setup
python scripts/check_setup_v2.py

# 2. Batch OCR with all exports
python scripts/batch_ocr.py ./documents -o ./results --recursive --format json,txt,csv,docx --clean full

# 3. Benchmark performance
python scripts/benchmark.py --input ./test_images/ --reps 5 --output perf.json

# 4. Launch production server
python scripts/ocr_server_v2.py --port 8000 --device auto
```

### Process a single PDF end-to-end:
```bash
# 1. Extract pages + OCR in one step
python scripts/full_pipeline.py document.pdf -o ./output --pages 1-10 --format json,txt,csv

# 2. Merge all extracted texts
python scripts/merge_texts_v2.py --dir ./output/texts/ -o merged.docx --format docx

# 3. Reconstruct PDF with only relevant pages
python scripts/pdf_reconstruct_v2.py document.pdf --pages 1,5,7 -o selected.pdf
```

### Auto-process incoming files:
```bash
python scripts/watch_folder_v2.py ./incoming/ -o ./processed/ --format json,txt
```

## Common CLI Options

| Option | Description |
|--------|-------------|
| `-o, --output DIR` | Custom output directory |
| `--conf FLOAT` | YOLO confidence threshold (0.05–0.8) |
| `--img-size INT` | Input image size for YOLO (default: 1280) |
| `--dpi INT` | PDF rendering DPI (default: 300) |
| `--pages N1,N2 or N-M` | Specific pages or page range |
| `--clean LEVEL` | Text cleaning: none / default / diacritics / full |
| `--format FMTS` | Comma-separated export formats: json, txt, csv, docx |
| `--recursive` | Recursively scan subdirectories |

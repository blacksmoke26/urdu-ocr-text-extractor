#!/usr/bin/env python3
"""
batch_ocr_v2.py — Advanced batch OCR with metrics, caching, export formats.

Processes all images/PDFs in a directory tree using the v2 engine's full pipeline:
- Threaded file discovery with progress tracking
- Per-file result caching (avoids reprocessing)
- Per-API metrics (latency histograms, success/fail counters)
- Multi-format export: JSON, TXT, CSV, DOCX per file + combined manifest
- Configurable text cleaning options
- GPU memory monitoring

Usage:
    python scripts/batch_ocr_v2.py ./documents -o ./results --recursive
    python scripts/batch_ocr_v2.py ./scans -o ./results --format json,csv,txt --clean diacritics
    python scripts/batch_ocr_v2.py . -o /tmp/ocr --type images --conf 0.3 --img-size 1920
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import shutil
from pathlib import Path
from datetime import datetime

# Ensure v2 engine is importable
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))


def parse_args():
    parser = argparse.ArgumentParser(
        prog="batch_ocr_v2.py",
        description="Advanced batch OCR processing with metrics, caching & multi-format export.",
    )
    parser.add_argument("input", help="Input directory or file path")
    parser.add_argument("-o", "--output", default="./v2_batch_output", help="Output directory (default: ./v2_batch_output)")

    # Processing options
    parser.add_argument("--recursive", action="store_true", help="Recursively scan subdirectories")
    parser.add_argument("--type", choices=["images", "pdfs", "all"], default="all", help="File type filter")
    parser.add_argument("--conf", type=float, default=0.2, help="YOLO confidence threshold (default: 0.2)")
    parser.add_argument("--img-size", type=int, default=1280, help="Input image size for YOLO (default: 1280)")

    # Caching
    parser.add_argument("--no-cache", action="store_true", help="Disable result caching")
    parser.add_argument("--clear-cache", action="store_true", help="Clear cache before processing")

    # Export formats
    parser.add_argument("--format", default="json,txt,csv", help="Comma-separated export formats (default: json,txt,csv)")
    parser.add_argument("--text-cleaning", choices=["none", "default", "diacritics", "full"], default="default",
                        help="Text cleaning level (default: default)")

    # PDF options
    parser.add_argument("--from-page", type=int, default=1, help="Starting page for PDFs")
    parser.add_argument("--to-page", type=int, default=None, help="Ending page for PDFs")
    parser.add_argument("--pdf-dpi", type=int, default=300, help="PDF rendering DPI (default: 300)")

    # Output structure
    parser.add_argument("--per-file-dir", action="store_true", help="Create per-file subdirectories in output")
    parser.add_argument("--manifest-only", action="store_true", help="Only generate manifest.json, skip file exports")

    return parser.parse_args()


def scan_files(directory: Path, recursive: bool, file_type: str) -> list[Path]:
    """Scan for supported files."""
    image_exts = {"jpg", "jpeg", "png", "bmp", "tiff", "tif", "webp", "gif"}
    pdf_exts = {"pdf"}

    found = []
    if directory.is_file():
        found.append(directory)
        return found

    for root, _, files in (directory.rglob("*") if recursive else directory.iterdir()):
        for fname in files:
            ext = fname.suffix.lower().lstrip(".")
            if file_type == "images" and ext in image_exts:
                found.append(root / fname)
            elif file_type == "pdfs" and ext in pdf_exts:
                found.append(root / fname)
            elif file_type == "all" and (ext in image_exts or ext in pdf_exts):
                found.append(root / fname)
    return sorted(found)


def get_clean_opts(level: str) -> bool | dict:
    """Return text cleaning config based on level."""
    if level == "none":
        return False
    elif level == "diacritics":
        return {"remove_diacritics": True}
    elif level == "full":
        return {
            "remove_diacritics": True,
            "normalize_alef": True,
            "normalize_tatil": True,
            "reshape": True,
            "normalize_whitespace": True,
        }
    return True  # default


def main():
    args = parse_args()
    input_path = Path(args.input)
    output_dir = Path(args.output)

    if not input_path.exists():
        print(f"[ERROR] Input path does not exist: {input_path}")
        sys.exit(1)

    # ── Scan files ─────────────────────────────────────────────
    print(f"Scanning {input_path} ...")
    files = scan_files(input_path, args.recursive, args.type)
    print(f"Found {len(files)} file(s)")

    if not files:
        print("[WARN] No matching files found. Exiting.")
        sys.exit(0)

    # ── Setup output ───────────────────────────────────────────
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "started_at": datetime.now().isoformat(),
        "input": str(input_path),
        "recursive": args.recursive,
        "file_type": args.type,
        "total_files": len(files),
        "completed": 0,
        "failed": 0,
        "formats": args.format.split(","),
        "text_cleaning": args.text_cleaning,
        "conf_threshold": args.conf,
        "img_size": args.img_size,
        "files": [],
    }

    # ── Initialize v2 engine ──────────────────────────────────
    from engine.loader import load_models
    load_models()

    from services.ocr_service import OCRService
    from services.export_service import ExportService
    from engine.metrics import get_metrics
    from config import CACHE_ENABLED

    metrics = get_metrics()
    cache_enabled = not args.no_cache and CACHE_ENABLED

    if args.clear_cache:
        cache_dir = BASE_DIR / "cache"
        for f in cache_dir.glob("*.json"):
            try:
                f.unlink()
            except OSError:
                pass
        print("[INFO] Cache cleared.")

    ocr_svc = OCRService()

    # ── Process each file ─────────────────────────────────────
    start_time = time.perf_counter()
    formats = [fmt.strip().lower() for fmt in args.format.split(",")]
    clean_opts = get_clean_opts(args.text_cleaning)

    for idx, fpath in enumerate(files, 1):
        print(f"\n[{idx}/{len(files)}] Processing: {fpath.name}")
        t0 = time.perf_counter()

        file_manifest = {"filename": fpath.name, "status": "pending", "lines": 0}

        try:
            if fpath.suffix.lower() == ".pdf":
                pdf_data = fpath.read_bytes()
                page_results = ocr_svc.ocr_pdf_pages(
                    pdf_data=pdf_data,
                    filename=fpath.name,
                    from_page=args.from_page,
                    to_page=args.to_page,
                    conf_threshold=args.conf,
                    img_size=args.img_size,
                    text_cleaning=clean_opts,
                    use_cache=cache_enabled,
                )
                total_lines = sum(r.detected_lines for r in page_results)
                file_manifest["status"] = "success"
                file_manifest["pdf_pages"] = len(page_results)
                file_manifest["lines"] = total_lines

            else:
                img_data = fpath.read_bytes()
                result = ocr_svc.ocr_image(
                    image_bytes=img_data,
                    filename=fpath.name,
                    conf_threshold=args.conf,
                    img_size=args.img_size,
                    text_cleaning=clean_opts,
                    use_cache=cache_enabled,
                )
                total_lines = result.detected_lines
                file_manifest["status"] = "success"
                file_manifest["detected_lines"] = total_lines

            elapsed_ms = (time.perf_counter() - t0) * 1000
            metrics.api_ocr.record_success(files=1, lines=total_lines)
            metrics.latency_global.record(elapsed_ms)
            metrics.latency_ocr.record(elapsed_ms)
            metrics.total_requests.inc()
            metrics.total_files_processed.inc()

            # ── Export ───────────────────────────────────────────
            if not args.manifest_only:
                result_dict = (page_results[0].to_dict() if fpath.suffix.lower() == ".pdf" and page_results else result.to_dict())

                for fmt in formats:
                    dest_base = output_dir / "all_formats"
                    dest_base.mkdir(parents=True, exist_ok=True)
                    base_name = fpath.stem.replace(".", "_")

                    if fmt == "json":
                        data = ExportService.export_json(result_dict)
                        (dest_base / f"{base_name}.json").write_text(data, encoding="utf-8")
                    elif fmt == "txt":
                        data = ExportService.export_txt(result_dict)
                        (dest_base / f"{base_name}.txt").write_text(data, encoding="utf-8")
                    elif fmt == "csv":
                        data = ExportService.export_csv(result_dict)
                        (dest_base / f"{base_name}.csv").write_text(data, encoding="utf-8")

                # DOCX export if requested
                if "docx" in formats:
                    try:
                        docx_bytes = ExportService.export_docx(result_dict)
                        (dest_base / f"{base_name}.docx").write_bytes(docx_bytes)
                    except ImportError:
                        pass  # python-docx not installed

            file_manifest["processing_time_ms"] = round(elapsed_ms, 1)
            print(f"  DONE ({elapsed_ms:.0f}ms | {total_lines} lines)")

        except Exception as e:
            elapsed_ms = (time.perf_counter() - t0) * 1000
            file_manifest["status"] = "failed"
            file_manifest["error"] = str(e)
            file_manifest["processing_time_ms"] = round(elapsed_ms, 1)
            metrics.api_ocr.record_fail()
            metrics.total_errors.inc()
            print(f"  FAILED: {e}")

        manifest["files"].append(file_manifest)
        manifest["completed"] += (1 if file_manifest["status"] == "success" else 0)
        manifest["failed"] += (1 if file_manifest["status"] == "failed" else 0)

    # ── Write manifest ────────────────────────────────────────
    manifest["finished_at"] = datetime.now().isoformat()
    manifest["total_processing_time_ms"] = round((time.perf_counter() - start_time) * 1000, 1)

    metrics_path = {
        "total_requests": metrics.total_requests.count,
        "ocr_success": metrics.ocr_success_count.count,
        "ocr_failures": metrics.ocr_fail_count.count,
        "total_lines_extracted": metrics.total_lines_extracted.count,
        "latency_global_avg_ms": metrics.latency_global.stats.get("avg_ms"),
        "latency_ocr_p50_ms": metrics.latency_ocr.stats.get("p50_ms"),
        "cache_hits": metrics.cache._hits if hasattr(metrics, 'cache') else 0,
    }
    manifest["metrics"] = metrics_path

    manifest_file = output_dir / "manifest.json"
    with open(manifest_file, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*50}")
    print(f"Batch complete: {manifest['completed']} OK / {manifest['failed']} FAIL / {len(files)} total")
    print(f"Total time: {manifest['total_processing_time_ms']:.0f}ms")
    print(f"Manifest: {manifest_file}")


if __name__ == "__main__":
    main()

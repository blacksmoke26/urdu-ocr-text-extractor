#!/usr/bin/env python3
"""
ocr_pdf_v2.py — Advanced PDF OCR with per-page results, text cleaning & multi-format export.

Usage:
    python scripts/ocr_pdf_v2.py doc.pdf -o ./output
    python scripts/ocr_pdf_v2.py doc.pdf --pages 1-5 -o ./texts --format txt,json,csv
    python scripts/ocr_pdf_v2.py doc.pdf --pages 1,3,7 --clean full --conf 0.15
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))


def parse_args():
    parser = argparse.ArgumentParser(prog="ocr_pdf_v2.py", description="Advanced PDF OCR.")
    parser.add_argument("pdf", help="PDF file path")
    parser.add_argument("-o", "--output", default="./v2_pdf_output", help="Output directory")

    # Page selection
    parser.add_argument("--pages", help="Page range, e.g. 1-5 or 1,3,7 (default: all)")
    parser.add_argument("--from-page", type=int, default=1)
    parser.add_argument("--to-page", type=int, default=None)

    # Processing
    parser.add_argument("--conf", type=float, default=0.2)
    parser.add_argument("--img-size", type=int, default=1280)
    parser.add_argument("--dpi", type=int, default=300, help="PDF rendering DPI")
    parser.add_argument("--clean", choices=["none", "default", "diacritics", "full"], default="default")

    # Export
    parser.add_argument("--format", default="txt,json,csv", help="Comma-separated formats")

    return parser.parse_args()


def clean_opts(level: str) -> bool | dict:
    if level == "none":
        return False
    return {
        "remove_diacritics": level in ("diacritics", "full"),
        "normalize_alef": level in ("default", "full"),
        "normalize_tatil": level in ("default", "full"),
        "reshape": level in ("default", "full"),
        "normalize_whitespace": level in ("default", "full"),
    }


def parse_page_spec(spec: str, total_pages: int) -> tuple[int, int]:
    """Parse page spec '1-5' or '1,3,7' into (start, end)."""
    if "-" in spec:
        parts = spec.split("-")
        return max(1, int(parts[0])), min(total_pages, int(parts[1]))
    pages = [int(p.strip()) for p in spec.split(",")]
    return max(1, min(pages)), min(total_pages, max(pages))


def main():
    args = parse_args()
    pdf_path = Path(args.pdf)

    if not pdf_path.exists():
        print(f"[ERROR] PDF not found: {pdf_path}")
        sys.exit(1)

    from engine.loader import load_models
    load_models()

    from services.ocr_service import OCRService
    from services.export_service import ExportService
    from engine.metrics import get_metrics

    metrics = get_metrics()
    ocr_svc = OCRService()

    pdf_data = pdf_path.read_bytes()

    # Get page count first (using fitz directly)
    import fitz
    doc = fitz.open(stream=pdf_data, filetype="pdf")
    total_pages = len(doc)
    doc.close()

    from_page = args.from_page
    to_page = args.to_page if args.to_page else total_pages

    if args.pages:
        from_page, to_page = parse_page_spec(args.pages, total_pages)

    print(f"Processing {pdf_path.name}: pages {from_page}–{to_page}/{total_pages}")

    start_time = time.perf_counter()
    clean_opts_level = clean_opts(args.clean)
    formats = [fmt.strip().lower() for fmt in args.format.split(",")]
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    page_results = ocr_svc.ocr_pdf_pages(
        pdf_data=pdf_data, filename=pdf_path.name,
        from_page=from_page, to_page=to_page,
        conf_threshold=args.conf, img_size=args.img_size,
        text_cleaning=clean_opts_level, use_cache=True,
    )

    elapsed_ms = (time.perf_counter() - start_time) * 1000

    # Per-page exports
    summary = []
    for i, pr in enumerate(page_results, from_page):
        page_dir = output_dir / f"page_{i:04d}"
        page_dir.mkdir(parents=True, exist_ok=True)

        rd = pr.to_dict()
        full_text = ExportService.export_txt(rd)
        (page_dir / "text.txt").write_text(full_text, encoding="utf-8")

        if "json" in formats:
            (page_dir / "result.json").write_text(ExportService.export_json(rd), encoding="utf-8")
        if "csv" in formats:
            (page_dir / "lines.csv").write_text(ExportService.export_csv(rd), encoding="utf-8")

        summary.append({
            "page": i,
            "detected_lines": pr.detected_lines,
            "processing_time_ms": pr.processing_time_ms,
        })
        print(f"  Page {i}: {pr.detected_lines} lines ({pr.processing_time_ms:.0f}ms)")

    # Combined text file
    (output_dir / "all_text.txt").write_text(
        "\n".join(pr.full_text for pr in page_results), encoding="utf-8"
    )

    total_lines = sum(p["detected_lines"] for p in summary)
    metrics.api_pdf.record_success(files=len(page_results), lines=total_lines)
    metrics.latency_pdf.record(elapsed_ms)
    metrics.total_requests.inc()

    # Manifest
    manifest = {
        "pdf": str(pdf_path.name),
        "pages_processed": len(page_results),
        "page_range": [from_page, to_page],
        "total_lines_extracted": total_lines,
        "processing_time_ms": round(elapsed_ms, 1),
        "cleaning_level": args.clean,
        "conf_threshold": args.conf,
        "dpi": args.dpi,
        "pages": summary,
    }
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print(f"\nDone: {len(page_results)} pages, {total_lines} lines in {elapsed_ms:.0f}ms")
    print(f"Output: {output_dir}")


if __name__ == "__main__":
    main()

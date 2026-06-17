#!/usr/bin/env python3
"""
extract_pdf_images_v2.py — PDF page extraction with DPI control, multi-format output.

Usage:
    python scripts/extract_pdf_images_v2.py doc.pdf -o ./images
    python scripts/extract_pdf_images_v2.py doc.pdf --pages 1-10 --dpi 150 --format png
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))


def parse_args():
    parser = argparse.ArgumentParser(prog="extract_pdf_images_v2.py", description="Extract PDF pages as images.")
    parser.add_argument("pdf", help="PDF file path")
    parser.add_argument("-o", "--output", default="./v2_pdf_images", help="Output directory")
    parser.add_argument("--pages", help="Page range, e.g. 1-5 or 1,3,7")
    parser.add_argument("--from-page", type=int, default=1)
    parser.add_argument("--to-page", type=int, default=None)
    parser.add_argument("--dpi", type=int, default=300, help="Rendering DPI (default: 300)")
    parser.add_argument("--format", choices=["png", "jpeg", "webp"], default="png")
    return parser.parse_args()


def main():
    args = parse_args()
    pdf_path = Path(args.pdf)

    if not pdf_path.exists():
        print(f"[ERROR] PDF not found: {pdf_path}")
        sys.exit(1)

    import fitz
    pdf_data = pdf_path.read_bytes()
    doc = fitz.open(stream=pdf_data, filetype="pdf")
    total_pages = len(doc)

    from_page = args.from_page
    to_page = args.to_page if args.to_page else total_pages

    if args.pages:
        if "-" in args.pages:
            parts = args.pages.split("-")
            from_page, to_page = max(1, int(parts[0])), min(total_pages, int(parts[1]))
        else:
            pages = [int(p.strip()) for p in args.pages.split(",")]
            from_page, to_page = max(1, min(pages)), min(total_pages, max(pages))

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    t0 = time.perf_counter()
    ext_map = {"png": "PNG", "jpeg": "JPEG", "webp": "WEBP"}
    count = 0

    for i in range(from_page - 1, to_page):
        page = doc[i]
        pix = page.get_pixmap(dpi=args.dpi)
        img_bytes = pix.tobytes(ext_map[args.format])
        fname = f"{pdf_path.stem}_page_{i+1:04d}.{args.format}"
        (output_dir / fname).write_bytes(img_bytes)
        count += 1
        if (i + 1 - from_page + 1) % 5 == 0:
            print(f"  Extracted {i+1}/{to_page} pages...")

    elapsed_ms = (time.perf_counter() - t0) * 1000
    doc.close()

    manifest = {"total_pages": count, "dpi": args.dpi, "format": args.format, "processing_time_ms": round(elapsed_ms, 1)}
    (output_dir / "manifest.json").write_text(str(manifest), encoding="utf-8")

    print(f"\nExtracted {count} pages in {elapsed_ms:.0f}ms → {output_dir}")


if __name__ == "__main__":
    main()

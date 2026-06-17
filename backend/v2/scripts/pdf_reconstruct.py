#!/usr/bin/env python3
"""
pdf_reconstruct_v2.py — Extract specific page ranges from PDFs and save as new file.

Usage:
    python scripts/pdf_reconstruct_v2.py doc.pdf --pages 2-5 -o subset.pdf
    python scripts/pdf_reconstruct_v2.py doc.pdf --pages 1,3,7,10 -o selected.pdf
    python scripts/pdf_reconstruct_v2.py doc.pdf --list           # list all pages
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))


def parse_args():
    parser = argparse.ArgumentParser(prog="pdf_reconstruct_v2.py", description="PDF page extraction & reconstruction.")
    parser.add_argument("pdf", help="PDF file path")
    parser.add_argument("-o", "--output", default="./reconstructed.pdf", help="Output PDF path")
    parser.add_argument("--pages", help="Pages to extract: '1-5' or '1,3,7' (default: all)")
    parser.add_argument("--from-page", type=int, default=1)
    parser.add_argument("--to-page", type=int, default=None)
    parser.add_argument("--list", action="store_true", help="List all pages and exit")
    return parser.parse_args()


def main():
    args = parse_args()
    pdf_path = Path(args.pdf)

    if not pdf_path.exists():
        print(f"[ERROR] PDF not found: {pdf_path}")
        sys.exit(1)

    import fitz
    doc = fitz.open(str(pdf_path))
    total_pages = len(doc)

    # List mode
    if args.list:
        print(f"PDF: {pdf_path.name} ({total_pages} pages)\n")
        for i in range(total_pages):
            page = doc[i]
            title = (page.info.get("title", "") or f"Page {i+1}")[:60]
            print(f"  Page {i+1:4d}: {title}")
        doc.close()
        return

    # Parse pages to extract
    from_page = args.from_page
    to_page = args.to_page if args.to_page else total_pages

    if args.pages:
        if "-" in args.pages:
            parts = args.pages.split("-")
            from_page, to_page = max(1, int(parts[0])), min(total_pages, int(parts[1]))
        else:
            pages = sorted(set(int(p.strip()) for p in args.pages.split(",")))
            from_page = max(1, min(pages))
            to_page = min(total_pages, max(pages))

    if from_page > total_pages:
        print(f"[ERROR] from_page ({from_page}) exceeds total pages ({total_pages})")
        sys.exit(1)

    # Reconstruct
    new_doc = fitz.open()
    for idx in range(from_page - 1, to_page):
        new_doc.insert_pdf(doc, from_page=idx, to_page=idx)

    pdf_bytes = bytearray()
    new_doc.save(pdf_bytes, garbage=4, deflate=True)
    new_doc.close()
    doc.close()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(bytes(pdf_bytes))

    print(f"Reconstructed {to_page - from_page + 1} pages (from {from_page} to {to_page}) → {output_path}")


if __name__ == "__main__":
    main()

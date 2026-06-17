#!/usr/bin/env python3
"""
export_all_v2.py — Convert a single OCR result dict into all supported formats at once.

Usage:
    python scripts/export_all_v2.py --input result.json -o ./exports/
    python scripts/export_all_v2.py --text "بسم اللہ..." --lines L1,L2 -o ./exports/
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))


def parse_args():
    parser = argparse.ArgumentParser(prog="export_all_v2.py", description="Export OCR result to all formats.")
    input_group = parser.add_mutually_exclusive_group(required=True)
    input_group.add_argument("--input", "-i", help="JSON result file path")
    input_group.add_argument("--text", help="Raw text string (simple mode)")
    input_group.add_argument("--lines", nargs="+", help="Line entries: 'L1:text1' 'L2:text2'")

    parser.add_argument("-o", "--output", default="./exports", help="Output directory")
    parser.add_argument("--filename", "-f", default="ocr_result", help="Base name for exports")
    return parser.parse_args()


def main():
    args = parse_args()
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    from services.export_service import ExportService

    # Build result dict
    if args.input:
        with open(args.input) as f:
            result_dict = json.load(f)
    elif args.text:
        result_dict = {
            "filename": f"{args.filename}.txt",
            "file_type": "text",
            "status": "success",
            "detected_lines": len(args.text.strip().splitlines()),
            "full_text": args.text,
            "lines": [{"index": i+1, "text": t.strip(), "bounding_box": []} for i, t in enumerate(args.text.strip().splitlines())],
        }
    elif args.lines:
        result_dict = {
            "filename": f"{args.filename}.txt",
            "file_type": "lines",
            "detected_lines": len(args.lines),
            "full_text": "\n".join(l.split(":", 1)[1] if ":" in l else l for l in args.lines),
            "lines": [{"index": i+1, "text": l.split(":", 1)[-1] if ":" in l else l, "bounding_box": []} for i, l in enumerate(args.lines)],
        }

    formats = {
        "json": ("text/plain", ExportService.export_json),
        "txt": ("text/plain", lambda d: d.get("full_text", "")),
        "csv": ("text/csv", ExportService.export_csv),
    }

    for fmt, (mime, exporter) in formats.items():
        fname = f"{args.filename}.{fmt}"
        data = exporter(result_dict)
        (output_dir / fname).write_text(data, encoding="utf-8")
        print(f"  ✓ {fname} ({len(data)} bytes)")

    # DOCX export
    try:
        docx_bytes = ExportService.export_docx(result_dict)
        (output_dir / f"{args.filename}.docx").write_bytes(docx_bytes)
        print(f"  ✓ {args.filename}.docx ({len(docx_bytes)} bytes)")
    except ImportError:
        print("  ✗ python-docx not installed — skipping DOCX export")

    # Searchable PDF export
    try:
        pdf_bytes = ExportService.export_searchable_pdf(result_dict)
        (output_dir / f"{args.filename}_searchable.pdf").write_bytes(pdf_bytes)
        print(f"  ✓ {args.filename}_searchable.pdf ({len(pdf_bytes)} bytes)")
    except Exception as e:
        print(f"  ✗ PDF export failed: {e}")

    print(f"\nAll exports → {output_dir}")


if __name__ == "__main__":
    main()

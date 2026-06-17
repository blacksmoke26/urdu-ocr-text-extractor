#!/usr/bin/env python3
"""
full_pipeline_v2.py — End-to-end pipeline: PDF → images + OCR + annotations + text files.

Usage:
    python scripts/full_pipeline_v2.py doc.pdf -o ./output
    python scripts/full_pipeline_v2.py docs/ --recursive -o ./pipeline_output
    python scripts/full_pipeline_v2.py doc.pdf --pages 1-10 --format json,txt,csv,docx
"""

from __future__ import annotations

import argparse
import sys
import time
import shutil
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))


def parse_args():
    parser = argparse.ArgumentParser(prog="full_pipeline_v2.py", description="Full OCR pipeline: PDF → images + text + annotated pages.")
    parser.add_argument("input", help="PDF file or directory")
    parser.add_argument("-o", "--output", default="./v2_full_output", help="Output directory")
    parser.add_argument("--recursive", action="store_true")
    parser.add_argument("--pages", help="Page range: 1-5 or 1,3,7")
    parser.add_argument("--format", default="txt,json,csv", help="Export formats")
    parser.add_argument("--conf", type=float, default=0.2)
    parser.add_argument("--dpi", type=int, default=300)
    parser.add_argument("--clean", choices=["none", "default", "diacritics", "full"], default="default")
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


def main():
    args = parse_args()
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    subdirs = {
        "images": output_dir / "extracted_images",
        "annotated": output_dir / "annotated",
        "texts": output_dir / "texts",
    }
    for sd in subdirs.values():
        sd.mkdir(parents=True, exist_ok=True)

    from engine.loader import load_models
    load_models()

    from services.ocr_service import OCRService
    from services.export_service import ExportService
    from engine.metrics import get_metrics

    metrics = get_metrics()
    ocr_svc = OCRService()

    # Collect input files
    input_path = Path(args.input)
    files = []
    if input_path.is_file():
        files.append(input_path)
    else:
        exts_img = {"jpg", "jpeg", "png", "bmp", "tiff", "tif", "webp", "gif"}
        for p in (input_path.rglob("*") if args.recursive else input_path.iterdir()):
            if p.is_file() and p.suffix.lower() == ".pdf":
                files.append(p)

    total_files = len(files)
    all_summaries = []
    global_start = time.perf_counter()

    for idx, fpath in enumerate(files, 1):
        print(f"\n[{idx}/{total_files}] Pipeline: {fpath.name}")
        from pathlib import Path as P
        pdf_data = fpath.read_bytes()

        import fitz
        doc = fitz.open(stream=pdf_data, filetype="pdf")
        total_pages = len(doc)

        from_page, to_page = 1, total_pages
        if args.pages:
            if "-" in args.pages:
                parts = args.pages.split("-")
                from_page, to_page = max(1, int(parts[0])), min(total_pages, int(parts[1]))
            else:
                ps = sorted(set(int(p.strip()) for p in args.pages.split(",")))
                from_page, to_page = max(1, min(ps)), min(total_pages, max(ps))

        formats = [fmt.strip().lower() for fmt in args.format.split(",")]

        # Step 1: Extract pages as images
        images_dir = subdirs["images"] / fpath.stem
        images_dir.mkdir(parents=True, exist_ok=True)
        for i in range(from_page - 1, to_page):
            page = doc[i]
            pix = page.get_pixmap(dpi=args.dpi)
            img_path = images_dir / f"page_{i+1:04d}.png"
            with open(img_path, "wb") as f:
                f.write(pix.tobytes("png"))

        # Step 2: OCR + annotated pages
        text_parts = []
        for i in range(from_page - 1, to_page):
            page = doc[i]
            pix = page.get_pixmap(dpi=args.dpi)
            from PIL import Image as PILImage
            from io import BytesIO as BIO

            img_bytes = pix.tobytes("png")
            result = ocr_svc.ocr_image(
                image_bytes=BIO(img_bytes), filename=f"{fpath.stem}_page_{i+1:04d}",
                conf_threshold=args.conf, text_cleaning=clean_opts(args.clean), use_cache=True,
            )

            # Save annotated image
            if result.annotated_image_b64:
                import base64
                ann_bytes = base64.b64decode(result.annotated_image_b64)
                (subdirs["annotated"] / f"{fpath.stem}_page_{i+1:04d}.png").write_bytes(ann_bytes)

            # Save text export per page
            page_text_dir = subdirs["texts"] / f"page_{i+1:04d}"
            page_text_dir.mkdir(parents=True, exist_ok=True)
            (page_text_dir / "text.txt").write_text(result.full_text, encoding="utf-8")

            if "json" in formats:
                (page_text_dir / "result.json").write_text(ExportService.export_json(result.to_dict()), encoding="utf-8")
            if "csv" in formats:
                (page_text_dir / "lines.csv").write_text(ExportService.export_csv(result.to_dict()), encoding="utf-8")

            text_parts.append(result.full_text)
            all_summaries.append({"page": i+1, "lines": result.detected_lines})

        doc.close()

        # Combined text
        (subdirs["texts"] / f"{fpath.stem}_all_pages.txt").write_text("\n".join(text_parts), encoding="utf-8")

        print(f"  ✓ {to_page - from_page + 1} pages processed → {output_dir}")

    total_elapsed = (time.perf_counter() - global_start) * 1000
    manifest = {
        "pipeline": "full",
        "files_processed": len(files),
        "total_processing_time_ms": round(total_elapsed, 1),
        "summaries": all_summaries,
        "subdirs": [str(sd.relative_to(output_dir)) for sd in subdirs.values()],
    }

    with open(output_dir / "manifest.json", "w") as f:
        import json
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*50}")
    print(f"Pipeline complete: {len(files)} file(s) in {total_elapsed:.0f}ms")
    print(f"Output: {output_dir}")


if __name__ == "__main__":
    main()

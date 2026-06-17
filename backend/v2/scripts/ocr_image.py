#!/usr/bin/env python3
"""
ocr_image_v2.py — Advanced single/multi-image OCR with text cleaning, confidence data & export.

Usage:
    python scripts/ocr_image_v2.py photo.jpg
    python scripts/ocr_image_v2.py docs/*.jpg -o result.txt --format json
    python scripts/ocr_image_v2.py photo.jpg --clean full --conf 0.3 --enhance
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))


def parse_args():
    parser = argparse.ArgumentParser(prog="ocr_image_v2.py", description="Advanced single/multi-image OCR.")
    parser.add_argument("images", nargs="+", help="Image file paths")
    parser.add_argument("-o", "--output", default=None, help="Output file (auto if None)")
    parser.add_argument("--format", choices=["txt", "json", "csv"], default="txt", help="Export format")
    parser.add_argument("--conf", type=float, default=0.2, help="Confidence threshold")
    parser.add_argument("--img-size", type=int, default=1280, help="Input image size")
    parser.add_argument("--clean", choices=["none", "default", "diacritics", "full"], default="default", help="Text cleaning")
    parser.add_argument("--enhance", action="store_true", help="Apply auto-enhancement (contrast/denoise)")
    parser.add_argument("--show-bboxes", action="store_true", help="Save annotated image with bounding boxes")
    return parser.parse_args()


def clean_opts(level: str) -> bool | dict:
    if level == "none":
        return False
    opts = {
        "remove_diacritics": level in ("diacritics", "full"),
        "normalize_alef": level in ("default", "full"),
        "normalize_tatil": level in ("default", "full"),
        "reshape": level in ("default", "full"),
        "normalize_whitespace": level in ("default", "full"),
    }
    return opts


def main():
    args = parse_args()

    from engine.loader import load_models
    load_models()

    from services.ocr_service import OCRService
    from engine.metrics import get_metrics

    metrics = get_metrics()
    ocr_svc = OCRService()

    all_texts = []
    all_lines_count = 0

    for fpath in args.images:
        p = Path(fpath)
        if not p.exists():
            print(f"[SKIP] Not found: {fpath}")
            continue

        print(f"\nProcessing: {p.name}")
        t0 = time.perf_counter()

        img_data = p.read_bytes()
        result = ocr_svc.ocr_image(
            image_bytes=img_data, filename=p.name, conf_threshold=args.conf,
            img_size=args.img_size, text_cleaning=clean_opts(args.clean),
        )

        elapsed_ms = (time.perf_counter() - t0) * 1000
        print(f"  Text: {result.full_text[:200]}...") if len(result.full_text) > 200 else print(f"  Text: {result.full_text}")
        print(f"  Lines: {result.detected_lines} | Time: {elapsed_ms:.0f}ms")

        all_texts.append((p.name, result.full_text))
        all_lines_count += result.detected_lines
        metrics.api_ocr.record_success(files=1, lines=result.detected_lines)
        metrics.latency_global.record(elapsed_ms)
        metrics.total_requests.inc()

    # Export output
    if args.output:
        out = Path(args.output)
        if args.format == "txt":
            out.write_text("\n".join(t[1] for t in all_texts), encoding="utf-8")
        elif args.format == "json":
            import json
            out.write_text(json.dumps([{"filename": f, "text": t} for f, t in all_texts], indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\nOutput saved to: {out}")


if __name__ == "__main__":
    main()

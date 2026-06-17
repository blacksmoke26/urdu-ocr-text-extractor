#!/usr/bin/env python3
"""
annotate_images_v2.py — Draw bounding boxes on images for visual inspection.

Usage:
    python scripts/annotate_images_v2.py docs/*.jpg -o ./annotated/ --box-width 3 --color green
    python scripts/annotate_images_v2.py doc.pdf -o ./annotated_pdf/ --run-ocr
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))


def parse_args():
    parser = argparse.ArgumentParser(prog="annotate_images_v2.py", description="Annotate images with bounding boxes.")
    parser.add_argument("inputs", nargs="+", help="Image or PDF files")
    parser.add_argument("-o", "--output", default="./v2_annotated", help="Output directory")
    parser.add_argument("--box-width", type=int, default=5, help="Bounding box line width")
    parser.add_argument("--color", choices=["random", "green", "red", "blue", "yellow"], default="random", help="Box color")
    parser.add_argument("--run-ocr", action="store_true", help="Run OCR detection to get boxes first")
    parser.add_argument("--conf", type=float, default=0.2)
    return parser.parse_args()


COLOR_MAP = {
    "green": (0, 255, 0),
    "red": (255, 0, 0),
    "blue": (0, 0, 255),
    "yellow": (255, 255, 0),
}


def main():
    args = parse_args()
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    from engine.loader import load_models
    load_models()

    from engine.pipeline import get_models as get_engine_models
    from PIL import Image, ImageDraw

    count = 0
    for inp in args.inputs:
        p = Path(inp)
        if not p.exists():
            print(f"[SKIP] Not found: {p}")
            continue

        t0 = time.perf_counter()
        image = Image.open(p).convert("RGB")
        boxes = None

        # Run OCR detection if requested
        if args.run_ocr:
            det_model = get_engine_models()["detection_model"]
            device = get_engine_models()["device"]
            results = det_model.predict(source=image, conf=args.conf, imgsz=1280, save=False, nms=True, device=device)
            boxes = [b for b in results[0].boxes.xyxy.cpu().numpy().tolist()]

        if not boxes:
            from engine.pipeline import run_ocr_pipeline
            result = run_ocr_pipeline(image, p.name, "image", args.conf)
            boxes = [l.bounding_box for l in result.lines]

        annotated = image.copy()
        draw = ImageDraw.Draw(annotated)

        for box in boxes:
            if args.color == "random":
                from numpy import random
                color = tuple(random.randint(0, 255, 3))
            else:
                color = COLOR_MAP[args.color]
            draw.rectangle(box, outline=color, width=args.box_width)

        out_name = f"annotated_{p.stem}.png"
        annotated.save(output_dir / out_name, "PNG")

        elapsed_ms = (time.perf_counter() - t0) * 1000
        print(f"Annotated: {p.name} ({len(boxes)} boxes | {elapsed_ms:.0f}ms)")
        count += 1

    print(f"\nDone: {count} file(s) → {output_dir}")


if __name__ == "__main__":
    main()

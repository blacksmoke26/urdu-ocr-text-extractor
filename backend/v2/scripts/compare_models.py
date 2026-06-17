#!/usr/bin/env python3
"""
compare_models_v2.py — Compare YOLO detection confidence thresholds on test images.

Usage:
    python scripts/compare_models_v2.py --input ./test_images/ -o comparisons.json
    python scripts/compare_models_v2.py doc.pdf --pages 1-5 --thresholds 0.1 0.15 0.2 0.3 0.4
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))


def parse_args():
    parser = argparse.ArgumentParser(prog="compare_models_v2.py", description="Compare OCR results across confidence thresholds.")
    parser.add_argument("--input", "-i", required=True, help="Image file, PDF file, or directory")
    parser.add_argument("-o", "--output", default="./model_comparison.json")
    parser.add_argument("--thresholds", nargs="+", type=float, default=[0.1, 0.15, 0.2, 0.3, 0.4], help="Confidence thresholds to compare")
    parser.add_argument("--pdf-pages", help="Page range for PDF input: 1-5 or 1,3,7")
    return parser.parse_args()


def main():
    args = parse_args()

    from engine.loader import load_models
    load_models()

    from engine.pipeline import run_ocr_pipeline
    from PIL import Image
    from io import BytesIO as BIO

    comparisons: dict[str, Any] = {
        "thresholds": args.thresholds,
        "per_threshold_results": {},
        "recommendation": None,
    }

    # Load test data (images or PDF pages)
    test_images: list[tuple[Path, str]] = []  # (path, label)
    input_path = Path(args.input)

    if input_path.is_file() and input_path.suffix.lower() == ".pdf":
        import fitz
        pdf_data = input_path.read_bytes()
        doc = fitz.open(stream=pdf_data, filetype="pdf")
        total_pages = len(doc)

        pg_start, pg_end = 1, total_pages
        if args.pdf_pages:
            if "-" in args.pdf_pages:
                parts = args.pdf_pages.split("-")
                pg_start, pg_end = max(1, int(parts[0])), min(total_pages, int(parts[1]))
            else:
                ps = sorted(set(int(p.strip()) for p in args.pdf_pages.split(",")))
                pg_start, pg_end = max(1, min(ps)), min(total_pages, max(ps))

        for i in range(pg_start - 1, pg_end):
            page = doc[i]
            pix = page.get_pixmap(dpi=300)
            img_bytes = pix.tobytes("png")
            temp_path = Path("/tmp/v2_compare_page_{i}.png")
            with open(temp_path, "wb") as f:
                f.write(img_bytes)
            test_images.append((temp_path, f"pdf_page_{i+1}"))

        doc.close()
    elif input_path.is_file():
        test_images.append((input_path, input_path.name))
    else:
        for ext in ["jpg", "jpeg", "png", "bmp"]:
            test_images.extend([(p, p.name) for p in input_path.glob(f"*.{ext}")])

    if not test_images:
        print("[ERROR] No test images found.")
        sys.exit(1)

    # Run comparison across thresholds
    for threshold in args.thresholds:
        print(f"\nThreshold {threshold}:")
        t0 = time.perf_counter()

        total_lines = 0
        total_time = 0.0
        min_lines, max_lines = float("inf"), 0
        image_results = []

        for img_path, label in test_images:
            img_data = img_path.read_bytes()
            image = Image.open(BIO(img_data)).convert("RGB")

            r0 = time.perf_counter()
            result = run_ocr_pipeline(image, label, "image", conf_threshold=threshold)
            elapsed_ms = (time.perf_counter() - r0) * 1000

            total_lines += result.detected_lines
            total_time += elapsed_ms
            min_lines = min(min_lines, result.detected_lines)
            max_lines = max(max_lines, result.detected_lines)
            image_results.append({"file": label, "lines": result.detected_lines, "time_ms": round(elapsed_ms, 1)})

        avg_time = total_time / len(test_images) if test_images else 0
        avg_lines = total_lines / len(test_images) if test_images else 0

        comparisons["per_threshold_results"][str(threshold)] = {
            "avg_lines": round(avg_lines, 1),
            "min_lines": min_lines,
            "max_lines": max_lines,
            "avg_time_ms": round(avg_time, 1),
            "total_throughput_img_per_sec": round(len(test_images) / (total_time / 1000), 2) if total_time > 0 else 0,
            "per_image": image_results,
        }

        print(f"  avg_lines={avg_lines:.1f} min={min_lines} max={max_lines} avg_time={avg_time:.0f}ms throughput={comparisons['per_threshold_results'][str(threshold)]['total_throughput_img_per_sec']} img/s")

    # Recommendation: threshold with best balance of lines detected and speed
    best = None
    best_score = -1
    for thr, stats in comparisons["per_threshold_results"].items():
        # Score = avg_lines / (avg_time_ms + 1) — higher is better
        score = stats["avg_lines"] / (stats["avg_time_ms"] + 1)
        if score > best_score:
            best_score = score
            best = thr

    comparisons["recommendation"] = {
        "best_threshold": float(best),
        "score": round(best_score, 2),
        "reason": f"Best balance of lines detected vs processing time",
    }

    # Save comparison
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(comparisons, indent=2, ensure_ascii=False))

    print(f"\n{'='*50}")
    print(f"Comparison complete → {out_path}")
    print(f"Recommended threshold: {comparisons['recommendation']['best_threshold']} (score: {best_score:.4f})")


if __name__ == "__main__":
    main()

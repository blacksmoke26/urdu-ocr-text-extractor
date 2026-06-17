#!/usr/bin/env python3
"""
benchmark_v2.py — Benchmark OCR pipeline: measure latency, throughput, GPU usage.

Usage:
    python scripts/benchmark_v2.py --input ./test_images/ --reps 10 -o benchmark_results.json
    python scripts/benchmark_v2.py --gpu-only --conf-thresholds 0.1 0.2 0.3
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import torch
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))


def parse_args():
    parser = argparse.ArgumentParser(prog="benchmark_v2.py", description="Benchmark OCR pipeline performance.")
    parser.add_argument("--input", "-i", default="./test_images/", help="Input directory with test images")
    parser.add_argument("--reps", "-n", type=int, default=5, help="Number of repetitions per image")
    parser.add_argument("--conf-thresholds", nargs="+", type=float, default=[0.1, 0.2, 0.3])
    parser.add_argument("--gpu-only", action="store_true", help="Only benchmark on GPU")
    parser.add_argument("-o", "--output", default="./benchmark_results.json")
    return parser.parse_args()


def main():
    args = parse_args()

    from engine.loader import load_models

    test_images = []
    inp_path = Path(args.input)
    if inp_path.is_file():
        test_images.append(inp_path)
    else:
        for ext in ["jpg", "jpeg", "png", "bmp"]:
            test_images.extend(inp_path.glob(f"*.{ext}"))

    if not test_images:
        print("[ERROR] No test images found.")
        sys.exit(1)

    print(f"Test images: {len(test_images)}")
    print(f"Repetitions: {args.reps}")
    print()

    results = {
        "device": "cuda" if torch.cuda.is_available() else "cpu",
        "images": len(test_images),
        "repetitions_per_image": args.reps,
        "confidence_thresholds": args.conf_thresholds,
        "per_image_benchmarks": [],
    }

    for threshold in args.conf_thresholds:
        print(f"\n{'='*40}")
        print(f"Threshold: {threshold}")
        print(f"{'='*40}")

        # Reload on correct device
        if args.gpu_only and torch.cuda.is_available():
            import os
            os.environ["OCR_DEVICE"] = "cuda"
        load_models()

        from engine.pipeline import run_ocr_pipeline
        from PIL import Image
        from io import BytesIO as BIO

        all_latencies = []

        for img_path in test_images:
            times = []
            print(f"\n  {img_path.name}:")

            for rep in range(1, args.reps + 1):
                img_data = img_path.read_bytes()
                image = Image.open(BIO(img_data)).convert("RGB")

                t0 = time.perf_counter()
                result = run_ocr_pipeline(image, img_path.name, "image", threshold)
                elapsed_ms = (time.perf_counter() - t0) * 1000
                times.append(elapsed_ms)

                if rep == args.reps:
                    print(f"    {result.detected_lines} lines in {elapsed_ms:.0f}ms")

            avg_ms = sum(times) / len(times)
            min_ms = min(times)
            max_ms = max(times)
            p50 = sorted(times)[len(times) // 2]
            all_latencies.extend(times)

            results["per_image_benchmarks"].append({
                "image": img_path.name,
                "conf_threshold": threshold,
                "avg_ms": round(avg_ms, 1),
                "min_ms": round(min_ms, 1),
                "max_ms": round(max_ms, 1),
                "p50_ms": round(p50, 1),
            })

        results[f"threshold_{threshold}_overall"] = {
            "avg_ms": round(sum(all_latencies) / len(all_latencies), 1),
            "min_ms": round(min(all_latencies), 1),
            "max_ms": round(max(all_latencies), 1),
            "p50_ms": round(sorted(all_latencies)[len(all_latencies) // 2], 1),
            "total_throughput_images_per_sec": round(len(test_images) / (sum(all_latencies) / 1000), 2),
        }

    # GPU memory report
    if torch.cuda.is_available():
        results["gpu_memory"] = {
            "used_gb": round(torch.cuda.memory_allocated() / (1024 ** 3), 2),
            "total_gb": round(torch.cuda.get_device_properties(0).total_memory / (1024 ** 3), 2),
        }

    # Save results
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(results, indent=2, ensure_ascii=False))

    print(f"\n{'='*50}")
    print(f"Benchmark complete → {out_path}")
    for thr, stats in results.items():
        if thr.startswith("threshold_"):
            print(f"  {thr}: avg={stats['avg_ms']}ms min={stats['min_ms']}ms max={stats['max_ms']}ms throughput={stats.get('total_throughput_images_per_sec', 'N/A')} img/s")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
watch_folder_v2.py — Watch a directory for new files and process them automatically.

Usage:
    python scripts/watch_folder_v2.py ./incoming/ -o ./processed/
    python scripts/watch_folder_v2.py . --recursive --format json,txt
"""

from __future__ import annotations

import argparse
import sys
import time
import shutil
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))


def parse_args():
    parser = argparse.ArgumentParser(prog="watch_folder_v2.py", description="Watch a folder for new files and process with OCR.")
    parser.add_argument("watch_dir", help="Directory to watch for new files")
    parser.add_argument("-o", "--output", default="./watch_output", help="Output directory")
    parser.add_argument("--recursive", action="store_true")
    parser.add_argument("--format", default="txt,json,csv", help="Export formats (comma-separated)")
    parser.add_argument("--conf", type=float, default=0.2)
    parser.add_argument("--clean", choices=["none", "default", "full"], default="default")
    return parser.parse_args()


def main():
    args = parse_args()
    watch_dir = Path(args.watch_dir)
    output_dir = Path(args.output)

    if not watch_dir.exists():
        print(f"[ERROR] Watch directory does not exist: {watch_dir}")
        sys.exit(1)

    print(f"Watching: {watch_dir}")
    print(f"Output:   {output_dir}")
    print("Press Ctrl+C to stop.\n")

    output_dir.mkdir(parents=True, exist_ok=True)

    from engine.loader import load_models
    load_models()

    from services.ocr_service import OCRService
    from services.export_service import ExportService
    from engine.metrics import get_metrics

    metrics = get_metrics()
    ocr_svc = OCRService()

    # Track processed files
    processed = set()
    formats = [f.strip().lower() for f in args.format.split(",")]
    clean_levels = {"none": False, "default": True, "full": {"remove_diacritics": True, "normalize_alef": True, "normalize_tatil": True, "reshape": True, "normalize_whitespace": True}}

    def get_clean_opts(level):
        if level == "none":
            return False
        if level == "default":
            return True
        return clean_levels["full"]

    try:
        while True:
            # Scan for new files
            current_files = set()
            for p in watch_dir.rglob("*") if args.recursive else watch_dir.iterdir():
                if p.is_file() and p.suffix.lower() in (".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp", ".gif", ".pdf"):
                    current_files.add(str(p))

            new_files = current_files - processed
            processed.update(current_files)

            for fpath_str in sorted(new_files):
                fpath = Path(fpath_str)
                print(f"[{datetime.now().strftime('%H:%M:%S')}] New file: {fpath.name}")
                t0 = time.perf_counter()

                try:
                    if fpath.suffix.lower() == ".pdf":
                        pdf_data = fpath.read_bytes()
                        page_results = ocr_svc.ocr_pdf_pages(pdf_data, fpath.name, conf_threshold=args.conf, text_cleaning=get_clean_opts(args.clean))
                        total_lines = sum(r.detected_lines for r in page_results)

                        # Save output per page
                        page_dir = output_dir / f"pdf_{fpath.stem}"
                        page_dir.mkdir(parents=True, exist_ok=True)
                        for pr in page_results:
                            txt_path = page_dir / f"text.txt"
                            txt_path.write_text(pr.full_text, encoding="utf-8")
                    else:
                        img_data = fpath.read_bytes()
                        result = ocr_svc.ocr_image(img_data, fpath.name, conf_threshold=args.conf, text_cleaning=get_clean_opts(args.clean))
                        total_lines = result.detected_lines

                        # Save output
                        out_dir = output_dir / f"{fpath.stem}"
                        out_dir.mkdir(parents=True, exist_ok=True)
                        (out_dir / "text.txt").write_text(result.full_text, encoding="utf-8")
                        if "json" in formats:
                            (out_dir / "result.json").write_text(ExportService.export_json(result.to_dict()), encoding="utf-8")

                    elapsed_ms = (time.perf_counter() - t0) * 1000
                    metrics.api_ocr.record_success(files=1, lines=total_lines)
                    metrics.latency_global.record(elapsed_ms)
                    metrics.total_requests.inc()
                    print(f"  ✓ Done in {elapsed_ms:.0f}ms ({total_lines} lines)")

                except Exception as e:
                    elapsed_ms = (time.perf_counter() - t0) * 1000
                    err_dir = output_dir / f"errors_{int(t0)}"
                    err_dir.mkdir(parents=True, exist_ok=True)
                    (err_dir / "error.txt").write_text(f"{e}", encoding="utf-8")
                    metrics.api_ocr.record_fail()
                    print(f"  ✗ Failed: {e}")

            time.sleep(2)  # Poll interval

    except KeyboardInterrupt:
        print("\n[INFO] Stopped watching.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
convert_images_v2.py — Convert/rescale images for optimal OCR input.

Usage:
    python scripts/convert_images_v2.py docs/ -o converted/ --resize 1920x1080 --format png
    python scripts/convert_images_v2.py doc.pdf -o pdf_pages/ --from-page 1 --to-page 10
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))


def parse_args():
    parser = argparse.ArgumentParser(prog="convert_images_v2.py", description="Convert/resize images for OCR input.")
    parser.add_argument("input", help="Input file or directory")
    parser.add_argument("-o", "--output", default="./converted_images", help="Output directory")

    parser.add_argument("--resize", "-r", help="Target resolution: WxH, e.g. 1920x1080")
    parser.add_argument("--format", choices=["png", "jpeg", "webp"], default="png")
    parser.add_argument("--quality", type=int, default=95, help="JPEG/WebP quality (default: 95)")
    parser.add_argument("--grayscale", "-g", action="store_true", help="Convert to grayscale")
    parser.add_argument("--dpi", type=int, default=None, help="Set DPI metadata")

    # PDF options
    parser.add_argument("--from-page", type=int, default=1)
    parser.add_argument("--to-page", type=int, default=None)
    parser.add_argument("--pdf-pages", help="Page range: 1-5 or 1,3,7")

    return parser.parse_args()


def main():
    args = parse_args()
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    from PIL import Image as PILImage

    target_w, target_h = None, None
    if args.resize:
        parts = args.resize.split("x")
        target_w, target_h = int(parts[0]), int(parts[1])

    converted = 0
    start_time = time.perf_counter()

    input_path = Path(args.input)

    # Handle PDF input
    if input_path.suffix.lower() == ".pdf":
        import fitz
        pdf_data = input_path.read_bytes()
        doc = fitz.open(stream=pdf_data, filetype="pdf")
        total_pages = len(doc)

        pg_start = args.from_page
        pg_end = args.to_page if args.to_page else total_pages

        if args.pdf_pages:
            if "-" in args.pdf_pages:
                parts2 = args.pdf_pages.split("-")
                pg_start, pg_end = max(1, int(parts2[0])), min(total_pages, int(parts2[1]))
            else:
                ps = sorted(set(int(p.strip()) for p in args.pdf_pages.split(",")))
                pg_start, pg_end = max(1, min(ps)), min(total_pages, max(ps))

        dpi_out = args.dpi or 300
        for i in range(pg_start - 1, pg_end):
            page = doc[i]
            pix = page.get_pixmap(dpi=dpi_out)
            img_bytes = pix.tobytes("png")
            img = PILImage.frombytes("RGB", [pix.width, pix.height], img_bytes)

            if target_w and target_h:
                img = img.resize((target_w, target_h), PILImage.Resampling.LANCZOS)
            if args.grayscale:
                img = img.convert("L")

            fname = f"{input_path.stem}_page_{i+1:04d}.{args.format}"
            save_kwargs = {}
            if args.format == "jpeg":
                save_kwargs["quality"] = args.quality
            (output_dir / fname).write_bytes(img.tobytes("PNG"))  # PNG for all formats to avoid loss

            converted += 1
        doc.close()

    else:
        # Handle image directory/file input
        files_to_convert = []
        if input_path.is_file():
            files_to_convert.append(input_path)
        else:
            exts = {"jpg", "jpeg", "png", "bmp", "tiff", "tif", "webp", "gif"}
            for p in input_path.rglob("*") if str(input_path.name).startswith(".") or True else input_path.iterdir():
                if p.is_file() and p.suffix.lower().lstrip(".") in exts:
                    files_to_convert.append(p)

        for img_path in files_to_convert:
            try:
                img = PILImage.open(img_path)

                if target_w and target_h:
                    img = img.resize((target_w, target_h), PILImage.Resampling.LANCZOS)
                if args.grayscale:
                    img = img.convert("L")

                # Convert to target format
                out_name = f"{img_path.stem}_converted.{args.format}"
                save_kwargs = {}
                if args.format == "jpeg":
                    save_kwargs["quality"] = args.quality
                    img = img.convert("RGB")

                img.save(output_dir / out_name, **save_kwargs)
                converted += 1

            except Exception as e:
                print(f"  [ERROR] {img_path.name}: {e}")

    elapsed_ms = (time.perf_counter() - start_time) * 1000
    print(f"\nConverted {converted} file(s) in {elapsed_ms:.0f}ms → {output_dir}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
ocr_server_v2.py — Launch the v2 FastAPI server with uvicorn.

Usage:
    python scripts/ocr_server_v2.py
    python scripts/ocr_server_v2.py --host 0.0.0.0 --port 9000 --workers 2 --reload
    python scripts/ocr_server_v2.py --device cuda --env .env
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))


def parse_args():
    parser = argparse.ArgumentParser(prog="ocr_server_v2.py", description="Launch Urdu OCR v2 server.")
    parser.add_argument("--host", default=None)
    parser.add_argument("--port", "-p", type=int, default=None)
    parser.add_argument("--workers", "-w", type=int, default=None)
    parser.add_argument("--reload", action="store_true")
    parser.add_argument("--device", choices=["auto", "cpu", "cuda"], default=None)
    parser.add_argument("--env", help=".env file path (default: ./config.example.env)")
    return parser.parse_args()


def main():
    args = parse_args()

    # Load .env if provided
    if args.env and Path(args.env).exists():
        from dotenv import load_dotenv
        load_dotenv(args.env)
        print(f"[v2] Loaded: {args.env}")

    # Override with CLI args
    env_overrides = {}
    if args.host:
        env_overrides["OCR_HOST"] = args.host
    if args.port:
        env_overrides["OCR_PORT"] = str(args.port)
    if args.workers:
        env_overrides["OCR_WORKERS"] = str(args.workers)

    import os
    for k, v in env_overrides.items():
        os.environ[k] = v

    # Device override
    if args.device:
        os.environ["OCR_DEVICE"] = args.device
        from engine.loader import load_models
        print(f"[v2] Loading models on: {args.device}")
        load_models(args.device)

    print("[v2] Starting Urdu OCR v2 server...")
    print(f"[v2] Host: {os.getenv('OCR_HOST', '0.0.0.0')}, Port: {os.getenv('OCR_PORT', '8000')}")
    print(f"[v2] Workers: {os.getenv('OCR_WORKERS', '1')}, Reload: {args.reload}")
    print()
    print("API docs: http://localhost:{port}/docs".format(port=os.getenv('OCR_PORT', '8000')))
    print("Live dashboard: http://localhost:{port}/api/v2/live-stats/dashboard".format(port=os.getenv('OCR_PORT', '8000')))
    print()

    import uvicorn
    host = os.getenv("OCR_HOST", "0.0.0.0")
    port = int(os.getenv("OCR_PORT", "8000"))
    workers = int(os.getenv("OCR_WORKERS", "1"))

    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        workers=workers if workers > 1 else 1,
        reload=args.reload,
    )


if __name__ == "__main__":
    main()

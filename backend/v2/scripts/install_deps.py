#!/usr/bin/env python3
"""
install_deps_v2.py — Install all v2 dependencies with pip.

Usage:
    python scripts/install_deps_v2.py
    python scripts/install_deps_v2.py --gpu      # torch + torchvision CUDA build
    python scripts/install_deps_v2.py --dev       # add dev tools (ruff, black, pytest)
"""

from __future__ import annotations

import argparse
import subprocess
import sys


def run_pip(*args):
    cmd = [sys.executable, "-m", "pip", "install", "--quiet"] + list(args)
    print(f"  Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ERROR: {result.stderr[:200]}")
        return False
    return True


def main():
    parser = argparse.ArgumentParser(prog="install_deps_v2.py")
    parser.add_argument("--gpu", action="store_true", help="Install CUDA-enabled PyTorch")
    parser.add_argument("--dev", action="store_true", help="Also install dev dependencies")
    args = parser.parse_args()

    print("Installing Urdu OCR v2 dependencies...")
    print()

    # Core
    core = [
        "torch>=2.0.1", "torchvision>=0.5.0",
        "ultralytics>=8.1.8",
        "PyArabic>=0.6.15", "arabic-reshaper>=3.0.0",
        "numpy>=1.23.5", "Pillow>=10.0",
        "opencv-python>=4.9.0", "opencv-contrib-python>=4.9.0",
        "PyMuPDF>=1.23.0",  # PDF support
        "fastapi>=0.104.0", "uvicorn[standard]>=0.24.0",
        "python-multipart>=0.0.6", "pydantic>=2.0",
        "python-dotenv>=1.0.0", "jinja2>=3.1.2",
    ]

    if args.gpu:
        print("Installing CUDA-enabled PyTorch...")
        core = [pkg for pkg in core if not pkg.startswith("torch")]
        torch_cmd = "torch>=2.0.1+cu118 torchvision>=0.5.0+cu118 --extra-index-url https://download.pytorch.org/whl/cu118"
        ok = run_pip(torch_cmd)
        if not ok:
            print("CUDA install failed, trying CPU version...")
            core.insert(0, "torch>=2.0.1")
            core.insert(1, "torchvision>=0.5.0")
    else:
        # Remove gpu-specific versions
        core = [pkg for pkg in core if not ("+cu" in pkg)]

    print("Installing core dependencies...")
    ok = run_pip(*core)

    if args.dev:
        dev_pkgs = ["ruff", "black", "pytest>=7.0", "mypy", "pre-commit"]
        print("Installing dev dependencies...")
        run_pip(*dev_pkgs)

    # Optional export deps
    try:
        import docx
        has_docx = True
    except ImportError:
        has_docx = False
        if input("Install python-docx for DOCX export support? [Y/n]: ").lower() not in ("n", "no"):
            run_pip("python-docx")

    print("\nDone! Run 'python scripts/check_setup_v2.py' to verify.")


if __name__ == "__main__":
    main()

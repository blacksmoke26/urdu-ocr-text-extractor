#!/usr/bin/env python3
"""
check_setup_v2.py — Verify v2 environment: packages, models, GPU, config.

Usage:
    python scripts/check_setup_v2.py
"""

from __future__ import annotations

import sys
import torch
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def check_package(name: str, required=True):
    try:
        __import__(name)
        return True, None
    except ImportError as e:
        return False, str(e)


def main():
    print("=" * 60)
    print("Urdu OCR v2 — Environment Check")
    print("=" * 60)

    results = []

    # Python version
    import platform
    py_ver = f"{sys.version_info.major}.{sys.version_info.minor}"
    ok = sys.version_info >= (3, 9)
    results.append(("Python", f"{py_ver}", ok))

    # GPU
    gpu_ok = torch.cuda.is_available()
    gpu_info = torch.cuda.get_device_name(0) if gpu_ok else "N/A"
    results.append(("CUDA/GPU", gpu_info, gpu_ok))

    # Model files
    model_files = {
        "Recognition model": BASE_DIR / "models" / "best_norm_ED.pth",
        "Detection model": BASE_DIR / "models" / "yolov8m_UrduDoc.pt",
        "Urdu glyphs": BASE_DIR / "glyphs" / "urdu.txt",
    }

    for label, path in model_files.items():
        exists = path.exists()
        results.append((label, f"{path.name} ({'found' if exists else 'MISSING'})", exists))

    # Required packages
    packages = [
        "torch", "ultralytics", "PIL", "fitz", "fastapi", "uvicorn",
        "PyMuPDF", "arabic_reshaper", "PyArabic", "numpy", "pandas", "docx",
    ]

    for pkg in packages:
        ok, err = check_package(pkg)
        results.append(("package:" + pkg, "installed" if ok else f"NOT INSTALLED ({pkg})", ok))

    # v2 engine imports
    v2_dir = BASE_DIR / "v2"
    engine_ok = (v2_dir / "engine").exists()
    services_ok = (v2_dir / "services").exists()
    routes_ok = (v2_dir / "routes").exists()
    results.append(("v2 engine", f"{'OK' if engine_ok else 'MISSING'}", engine_ok))
    results.append(("v2 services", f"{'OK' if services_ok else 'MISSING'}", services_ok))
    results.append(("v2 routes", f"{'OK' if routes_ok else 'MISSING'}", routes_ok))

    # Print results
    print(f"\n{'Component':<25} {'Status':<30} {'Result'}")
    print("-" * 60)
    all_ok = True
    for label, status, ok in results:
        flag = "PASS" if ok else "FAIL"
        print(f"{label:<25} {status:<30} [{flag}]")
        all_ok = all_ok and ok

    print("-" * 60)
    if all_ok:
        print("All checks PASSED ✓")
    else:
        print("Some checks FAILED ✗ — review above.")

    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()

"""
Configuration for the v2 Urdu OCR backend.
Reads from environment variables with sensible defaults.
"""

import os
from pathlib import Path

# ─── Base Paths ───────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent
V2_DIR = Path(__file__).resolve().parent

# ─── Server ───────────────────────────────────────────────────
HOST: str = os.getenv("OCR_HOST", "localhost")
PORT: int = int(os.getenv("OCR_PORT", "8000"))
WORKERS: int = int(os.getenv("OCR_WORKERS", "1"))
RELOAD: bool = os.getenv("OCR_RELOAD", "false").lower() == "true"

# ─── Device ───────────────────────────────────────────────────
DEFAULT_DEVICE: str = os.getenv("OCR_DEVICE", "auto").lower()  # auto | cpu | cuda

# ─── Model Paths ──────────────────────────────────────────────
MODELS_DIR = BASE_DIR / "models"
RECOGNITION_MODEL_PATH = MODELS_DIR / "best_norm_ED.pth"
DETECTION_MODEL_PATH = MODELS_DIR / "yolov8m_UrduDoc.pt"
URDUGLYPHS_PATH = V2_DIR.parent / "glyphs" / "urdu.txt"

# ─── YOLO Detection Parameters ────────────────────────────────
DEFAULT_CONF_THRESHOLD: float = float(os.getenv("OCR_CONF_THRESHOLD", "0.2"))
DEFAULT_IMG_SIZE: int = int(os.getenv("OCR_IMG_SIZE", "1280"))
DEFAULT_NMS: bool = os.getenv("OCR_NMS", "true").lower() == "true"

# ─── Directories ──────────────────────────────────────────────
UPLOAD_DIR = BASE_DIR / "uploads"
RESULTS_DIR = BASE_DIR / "results"
CACHE_DIR = BASE_DIR / "cache"

# ─── File Limits ──────────────────────────────────────────────
MAX_FILE_SIZE_MB: int = int(os.getenv("OCR_MAX_FILE_SIZE_MB", "50"))
MAX_BATCH_FILES: int = int(os.getenv("OCR_MAX_BATCH_FILES", "10"))
ALLOWED_IMAGE_EXTENSIONS: set = {
    "jpg", "jpeg", "png", "bmp", "tiff", "tif", "webp", "gif", "svg"
}
ALLOWED_MIME_TYPES: dict = {
    "jpg": ["image/jpeg"],
    "jpeg": ["image/jpeg"],
    "png": ["image/png"],
    "bmp": ["image/bmp", "application/x-ms-bmp"],
    "tiff": ["image/tiff"],
    "tif": ["image/tiff"],
    "webp": ["image/webp"],
    "gif": ["image/gif"],
    "pdf": ["application/pdf"],
}

# ─── Caching ──────────────────────────────────────────────────
CACHE_ENABLED: bool = os.getenv("OCR_CACHE_ENABLED", "true").lower() == "true"
CACHE_TTL_SECONDS: int = int(os.getenv("OCR_CACHE_TTL", "3600"))  # default 1 hour

# ─── Rate Limiting ────────────────────────────────────────────
RATE_LIMIT_ENABLED: bool = os.getenv("OCR_RATE_LIMIT_ENABLED", "true").lower() == "true"
RATE_LIMIT_REQUESTS: int = int(os.getenv("OCR_RATE_LIMIT_REQUESTS", "60"))
RATE_LIMIT_WINDOW: int = int(os.getenv("OCR_RATE_LIMIT_WINDOW", "60"))  # seconds

# ─── Authentication ──────────────────────────────────────────
API_KEYS: list[str] = [k.strip() for k in os.getenv("OCR_API_KEYS", "").split(",") if k.strip()]
AUTH_ENABLED: bool = len(API_KEYS) > 0

# ─── PDF Settings ─────────────────────────────────────────────
PDF_DPI: int = int(os.getenv("OCR_PDF_DPI", "300"))
PDF_DEFAULT_START_PAGE: int = 1

# ─── Thumbnail Settings ────────────────────────────────────────
THUMB_WIDTH: int = int(os.getenv("OCR_THUMB_WIDTH", "300"))
THUMB_HEIGHT: int = int(os.getenv("OCR_THUMB_HEIGHT", "425"))

# ─── Export Output Directory ──────────────────────────────────
EXPORT_DIR = BASE_DIR / "exports"

# ─── Logging ──────────────────────────────────────────────────
LOG_LEVEL: str = os.getenv("OCR_LOG_LEVEL", "INFO").upper()
LOG_FILE: Path = BASE_DIR / "logs" / "ocr_v2.log"
LOG_MAX_BYTES: int = 10 * 1024 * 1024  # 10 MB
LOG_BACKUP_COUNT: int = 5

# ─── CORS ─────────────────────────────────────────────────────
CORS_ORIGINS: list[str] = [
    o.strip() for o in os.getenv("OCR_CORS_ORIGINS", "*").split(",") if o.strip()
]

# ─── Text Cleaning ────────────────────────────────────────────
TEXT_CLEANING_ENABLED: bool = os.getenv("OCR_TEXT_CLEANING_ENABLED", "true").lower() == "true"

# ─── Ensure directories exist ─────────────────────────────────
for d in [UPLOAD_DIR, RESULTS_DIR, CACHE_DIR, EXPORT_DIR, BASE_DIR / "logs"]:
    d.mkdir(parents=True, exist_ok=True)


def validate_config() -> list[str]:
    """Validate configuration and return a list of warnings."""
    warnings = []

    if not RECOGNITION_MODEL_PATH.exists():
        warnings.append(f"Recognition model not found: {RECOGNITION_MODEL_PATH}")
    if not DETECTION_MODEL_PATH.exists():
        warnings.append(f"Detection model not found: {DETECTION_MODEL_PATH}")
    if not URDUGLYPHS_PATH.exists():
        warnings.append(f"Urdu glyphs file not found: {URDUGLYPHS_PATH}")

    if DEFAULT_DEVICE not in ("auto", "cpu", "cuda"):
        warnings.append(f"Invalid OCR_DEVICE value: '{DEFAULT_DEVICE}'. Using 'auto'.")
        globals()["DEFAULT_DEVICE"] = "auto"

    if RATE_LIMIT_REQUESTS <= 0:
        warnings.append("RATE_LIMIT_REQUESTS must be positive. Disabling rate limiting.")
        globals()["RATE_LIMIT_ENABLED"] = False

    return warnings

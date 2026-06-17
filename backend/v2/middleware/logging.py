"""Structured logging setup for v2 OCR backend."""

from __future__ import annotations

import logging
import sys
import logging.handlers
from pathlib import Path
from typing import Optional

from config import LOG_FILE, LOG_LEVEL, LOG_MAX_BYTES, LOG_BACKUP_COUNT


def setup_logging(level: Optional[str] = None, log_file: Optional[Path] = None) -> logging.Logger:
    """Configure root logger with both console and file handlers."""
    lvl = (level or LOG_LEVEL).upper()
    log_path = log_file or LOG_FILE
    log_path.parent.mkdir(parents=True, exist_ok=True)

    formatter = logging.Formatter(
        "[%(asctime)s] [%(levelname)-8s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, lvl, logging.INFO))

    # Console handler
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(formatter)
    root_logger.addHandler(console)

    # File handler with rotation
    file_handler = logging.handlers.RotatingFileHandler(
        str(log_path),
        maxBytes=LOG_MAX_BYTES,
        backupCount=LOG_BACKUP_COUNT,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    root_logger.addHandler(file_handler)

    return root_logger


def get_logger(name: str = "ocr.v2") -> logging.Logger:
    """Get a named logger instance."""
    return logging.getLogger(name)

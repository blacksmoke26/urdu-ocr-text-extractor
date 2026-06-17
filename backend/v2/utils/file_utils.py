"""File handling utilities."""

from __future__ import annotations

import uuid
from pathlib import Path


def get_file_ext(filename: str) -> str:
    """Extract file extension in lowercase."""
    if "." in filename:
        return filename.rsplit(".", 1)[-1].lower()
    return ""


def validate_extension(filename: str, allowed: set) -> tuple[bool, str]:
    """Validate file extension against an allowed set. Returns (is_valid, message)."""
    ext = get_file_ext(filename)
    if not ext:
        return False, "File has no extension"
    if ext not in allowed:
        return False, f"Unsupported extension: .{ext}"
    return True, ""


def generate_task_id(prefix: str = "") -> str:
    """Generate a short unique task ID."""
    short_id = uuid.uuid4().hex[:12]
    return f"{prefix}{short_id}" if prefix else short_id

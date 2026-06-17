"""Pydantic schemas for the v2 OCR API."""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field


class OCRTaskStatus(str, Enum):
    """Task processing status."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


# ── Request schemas ─────────────────────────────────────────────

class OCRRequest(BaseModel):
    """Input for a single-image or PDF-embedded page OCR."""
    conf_threshold: float = Field(default=0.2, ge=0.01, le=1.0, description="YOLO detection confidence")
    img_size: int = Field(default=1280, ge=32, le=4096, description="Input image size for YOLO")
    use_cache: bool = Field(default=True, description="Use cached results if available")
    preprocess: PreprocessOptions = Field(default_factory=PreprocessOptions)


class PreprocessOptions(BaseModel):
    """Image preprocessing options."""
    auto_contrast: bool = False
    deskew: bool = False
    denoise: bool = False
    grayscale: bool = True
    normalize_background: bool = False
    sharpen: bool = False


class BatchOCRRequest(BaseModel):
    """Input for batch OCR (multiple files)."""
    conf_threshold: float = Field(default=0.2, ge=0.01, le=1.0)
    img_size: int = Field(default=1280, ge=32, le=4096)
    use_cache: bool = True
    from_page: Optional[int] = Field(default=None, ge=1)
    to_page: Optional[int] = Field(default=None, ge=1)
    preprocess: PreprocessOptions = Field(default_factory=PreprocessOptions)


class SingleOCRRequest(BaseModel):
    """Input for single-image OCR with custom params."""
    conf_threshold: float = Field(default=0.2, ge=0.01, le=1.0)
    img_size: int = Field(default=1280, ge=32, le=4096)
    preprocess: PreprocessOptions = Field(default_factory=PreprocessOptions)


# ── Response schemas ────────────────────────────────────────────

class OCRLineResult(BaseModel):
    """A single detected and recognized text line."""
    index: int
    text: str
    confidence: Optional[float] = None
    bounding_box: list[float] = Field(..., description="[x1, y1, x2, y2]")
    detection_confidence: Optional[float] = None


class OCRPageResult(BaseModel):
    """OCR result for a single page."""
    page_number: int
    detected_lines: int
    full_text: str
    lines: list[OCRLineResult]
    processing_time_ms: float
    annotated_image_b64: Optional[str] = None


class OCRResponse(BaseModel):
    """Standard OCR response."""
    task_id: str
    filename: str
    file_type: str
    status: OCRTaskStatus
    detected_lines: int
    full_text: str
    lines: list[OCRLineResult]
    annotated_image_b64: Optional[str] = None
    processing_time_ms: float
    confidence_stats: Optional[dict[str, float]] = None
    message: Optional[str] = None


class BatchOCRResponse(BaseModel):
    """Response for batch OCR with multiple files."""
    task_id: str
    total_files: int
    completed: int
    failed: int
    results: list[Any]  # Union[OCRResponse, dict]
    processing_time_ms: float


# ── Task status tracking ────────────────────────────────────────

class OCRTaskStatusDetail(BaseModel):
    """Full status of a background OCR task."""
    task_id: str
    status: OCRTaskStatus
    progress: float = Field(ge=0, le=100)
    filename: str
    detected_lines: int = 0
    full_text: str = ""
    lines: list[OCRLineResult] = []
    error_message: Optional[str] = None
    created_at: float
    completed_at: Optional[float] = None
    processing_time_ms: float = 0.0


class BatchOCRTaskDetail(BaseModel):
    """Full status of a background batch task."""
    task_id: str
    status: OCRTaskStatus
    progress: float
    total_files: int
    completed_files: int
    filename_prefix: str
    results_summary: list[dict[str, Any]] = []

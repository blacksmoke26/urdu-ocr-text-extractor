"""Core OCR pipeline — detection + recognition + preprocessing."""

from __future__ import annotations

import base64
import io
from typing import Optional

import numpy as np
import torch
from PIL import Image, ImageFilter, ImageEnhance, ImageOps
from config import DEFAULT_CONF_THRESHOLD, DEFAULT_IMG_SIZE, DEFAULT_NMS


class OCRResultLine:
    """Single detected line result."""
    __slots__ = ("index", "text", "confidence", "bounding_box", "detection_confidence")

    def __init__(self, index: int, text: str, confidence: Optional[float],
                 bounding_box: list[float], detection_confidence: Optional[float]):
        self.index = index
        self.text = text
        self.confidence = confidence
        self.bounding_box = bounding_box
        self.detection_confidence = detection_confidence

    def to_dict(self) -> dict:
        return {
            "index": self.index,
            "text": self.text,
            "confidence": self.confidence,
            "bounding_box": [round(v, 2) for v in self.bounding_box],
            "detection_confidence": self.detection_confidence,
        }


class OCRResult:
    """Full result of an OCR run."""

    def __init__(self, filename: str, file_type: str, lines: list[OCRResultLine],
                 full_text: str, annotated_image_b64: Optional[str] = None,
                 processing_time_ms: float = 0.0):
        self.filename = filename
        self.file_type = file_type
        self.lines = lines
        self.full_text = full_text
        self.annotated_image_b64 = annotated_image_b64
        self.processing_time_ms = processing_time_ms
        self.detected_lines = len(lines)
        self.confidence_stats = _compute_confidence_stats(lines)

    def to_dict(self) -> dict:
        return {
            "filename": self.filename,
            "file_type": self.file_type,
            "status": "success",
            "detected_lines": self.detected_lines,
            "full_text": self.full_text,
            "lines": [l.to_dict() for l in self.lines],
            "annotated_image_b64": self.annotated_image_b64,
            "processing_time_ms": round(self.processing_time_ms, 2),
            "confidence_stats": self.confidence_stats,
            "thumb_image_b64": getattr(self, "_page_thumb_b64", None),
        }


def _compute_confidence_stats(lines: list[OCRResultLine]) -> dict[str, float] | None:
    confs = [l.confidence for l in lines if l.confidence is not None]
    if not confs:
        return None
    return {
        "mean": round(float(np.mean(confs)), 4),
        "min": round(float(np.min(confs)), 4),
        "max": round(float(np.max(confs)), 4),
        "median": round(float(np.median(confs)), 4),
    }


# ── Preprocessing ───────────────────────────────────────────────

def preprocess_image(image: Image.Image, conf_threshold: float, img_size: int) -> tuple[Image.Image, list[float], float]:
    """Preprocess image and return (processed_image, confidences_or_None, detection_conf).

    Returns a tuple compatible with the old process_image_pil signature but enriched.
    """
    from numpy import random as np_random
    from PIL import ImageDraw

    # Grayscale conversion for Urdu text
    processed = image.convert("L") if image.mode != "L" else image.copy()

    # YOLO detection
    from engine.loader import get_models
    models = get_models()
    det_model = models["detection_model"]
    device = models["device"]

    det_results = det_model.predict(
        source=processed, conf=conf_threshold, imgsz=img_size, save=False, nms=DEFAULT_NMS, device=device
    )
    boxes = det_results[0].boxes.xyxy.cpu().numpy().tolist()
    boxes.sort(key=lambda x: x[1])  # top-to-bottom

    # Collect detection confidences
    det_confs = None
    if det_results[0].boxes.conf is not None and len(det_results[0].boxes.conf) > 0:
        det_confs = det_results[0].boxes.conf.cpu().numpy().tolist()

    # Annotated image
    annotated = image.copy()
    draw = ImageDraw.Draw(annotated)
    for box in boxes:
        draw.rectangle(box, fill=None, outline=tuple(np_random.randint(0, 255, 3)), width=5)

    buf = io.BytesIO()
    annotated.save(buf, format="PNG")
    buf.seek(0)
    b64_image = base64.b64encode(buf.read()).decode("utf-8")

    return processed, boxes, det_confs[0] if det_confs else None


def run_recognition(processed_img: Image.Image, boxes: list[list[float]]) -> tuple[list[str], list[OCRResultLine]]:
    """Run text recognition on cropped line images."""
    from engine.loader import get_models
    models = get_models()

    converter = models["converter"]
    rec_model = models["recognition_model"]
    text_recognizer_func = models["text_recognizer_func"]
    device = models["device"]

    texts = []
    line_results = []

    for i, box in enumerate(boxes):
        cropped = processed_img.crop(box)
        text_line = text_recognizer_func(cropped, rec_model, converter, device)
        texts.append(text_line)

        # Estimate confidence via CTC beam search probability (simplified: use blank token ratio)
        img_tensor = _prepare_input(cropped, device)
        with torch.no_grad():
            preds = rec_model(img_tensor)
            probs = torch.softmax(preds, dim=-1)
            mean_conf = float(probs.max().item())

        line_results.append(OCRResultLine(
            index=i + 1,
            text=text_line,
            confidence=round(mean_conf, 4),
            bounding_box=[round(v, 2) for v in box],
            detection_confidence=None,
        ))

    return texts, line_results


def _prepare_input(img_crop: Image.Image, device: torch.device):
    """Prepare a single cropped image tensor for recognition."""
    import math

    from engine.loader import NormalizePAD

    img = img_crop.convert("L")
    img = img.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    w, h = img.size
    ratio = w / float(h)
    if math.ceil(32 * ratio) > 400:
        resized_w = 400
    else:
        resized_w = math.ceil(32 * ratio)
    img = img.resize((resized_w, 32), Image.Resampling.BICUBIC)
    transform = NormalizePAD((1, 32, 400))
    img = transform(img)
    img = img.unsqueeze(0).to(device)
    return img


# ── Main pipeline entry ─────────────────────────────────────────

def run_ocr_pipeline(image: Image.Image, filename: str, file_type: str,
                     conf_threshold: float = DEFAULT_CONF_THRESHOLD,
                     img_size: int = DEFAULT_IMG_SIZE) -> OCRResult:
    """Run the full OCR pipeline and return an OCRResult."""
    import time as _time

    t0 = _time.perf_counter()

    # Detection + bounding boxes
    processed_img, boxes, det_conf = preprocess_image(image, conf_threshold, img_size)

    if not boxes:
        elapsed = (_time.perf_counter() - t0) * 1000
        return OCRResult(
            filename=filename, file_type=file_type, lines=[], full_text="",
            processing_time_ms=elapsed,
        )

    # Recognition
    texts, line_results = run_recognition(processed_img, boxes)

    # Annotated image
    from engine.loader import get_models
    models = get_models()
    det_model = models["detection_model"]
    device = models["device"]
    from numpy import random as np_random
    from PIL import ImageDraw
    annotated = image.copy()
    draw = ImageDraw.Draw(annotated)
    for box in boxes:
        draw.rectangle(box, fill=None, outline=tuple(np_random.randint(0, 255, 3)), width=5)
    buf = io.BytesIO()
    annotated.save(buf, format="PNG")
    buf.seek(0)
    b64_image = base64.b64encode(buf.read()).decode("utf-8")

    elapsed = (_time.perf_counter() - t0) * 1000

    full_text = "\n".join(texts)
    result = OCRResult(
        filename=filename, file_type=file_type, lines=line_results,
        full_text=full_text, annotated_image_b64=b64_image,
        processing_time_ms=elapsed,
    )
    return result

"""Core OCR pipeline — detection + recognition + preprocessing.

Major improvements in this version:
- Automatic image quality detection and adaptive enhancement
- Bounding box padding for full character context (Urdu ascenders/descenders)
- Per-character confidence estimation with variance
- Beam search decoding for improved accuracy
- Deduplicated annotated image generation
"""

from __future__ import annotations

import base64
import io
import math
from typing import Optional

import numpy as np
import torch
from PIL import Image, ImageFilter, ImageEnhance  # ImageOps removed — not used after safe enhancement rewrite
from config import (
    AUTO_ENHANCE_ENABLED,
    BEAM_SEARCH_WIDTH,
    BBOX_PADDING_PERCENT,
    DEFAULT_CONF_THRESHOLD,
    DEFAULT_IMG_SIZE,
    DEFAULT_NMS,
)


class OCRResultLine:
    """Single detected line result."""
    __slots__ = ("index", "text", "confidence", "char_confidences", "bounding_box",
                 "detection_confidence", "_correction_stats")

    def __init__(self, index: int, text: str, confidence: Optional[float],
                 char_confidences: Optional[list[float]], bounding_box: list[float],
                 detection_confidence: Optional[float]):
        self.index = index
        self.text = text
        self.confidence = confidence
        self.char_confidences = char_confidences or []
        self.bounding_box = bounding_box
        self.detection_confidence = detection_confidence

    def to_dict(self) -> dict:
        return {
            "index": self.index,
            "text": self.text,
            "confidence": self.confidence,
            "char_confidences": [round(c, 4) for c in self.char_confidences] if self.char_confidences else None,
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
        self.corrections_count: int = 0  # Total corrections applied across all lines

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
            "corrections_count": getattr(self, "corrections_count", 0),
        }


def _compute_confidence_stats(lines) -> dict | None:
    confs = [l.confidence for l in lines if l.confidence is not None]
    if not confs:
        return None
    char_confs_all = [c for l in lines for c in (l.char_confidences or []) if l.char_confidences]
    stats: dict = {
        "mean": round(float(np.mean(confs)), 4),
        "min": round(float(np.min(confs)), 4),
        "max": round(float(np.max(confs)), 4),
        "median": round(float(np.median(confs)), 4),
    }
    if char_confs_all:
        stats["char_mean"] = round(float(np.mean(char_confs_all)), 4)
        stats["char_std"] = round(float(np.std(char_confs_all)), 4)
    return stats


# ── Image Quality Detection ───────────────────────────────────

def cv2_filter2d(img, kernel):
    """Simple 2D convolution for quality estimation."""
    k_h, k_w = kernel.shape
    pad_h, pad_w = k_h // 2, k_w // 2
    img_padded = np.pad(img.astype(np.float64), ((pad_h, pad_h), (pad_w, pad_w)), mode='reflect')
    result = np.zeros_like(img, dtype=np.float64)
    for i in range(img.shape[0]):
        for j in range(img.shape[1]):
            region = img_padded[i:i+k_h, j:j+k_w]
            result[i, j] = np.sum(region * kernel)
    return result


def _detect_image_quality(gray_img) -> dict:
    """Detect image quality metrics and return enhancement recommendations.

    Only recommends enhancement when the image is genuinely degraded.
    Thresholds are conservative to avoid destroying text features for YOLO.
    """
    # 1. Contrast: standard deviation of pixel values
    contrast = float(np.std(gray_img))

    # 2. Sharpness: Laplacian variance
    kernel = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=np.float64)
    laplacian = cv2_filter2d(gray_img.astype(np.float64), kernel)
    sharpness = float(np.var(laplacian))

    # 3. Brightness: mean pixel value
    brightness = float(np.mean(gray_img))

    # 4. Noise estimate: high-frequency content
    blur_kernel = np.ones((3, 3), dtype=np.float64) / 9.0
    blurred = cv2_filter2d(gray_img.astype(np.float64), blur_kernel)
    noise_level = float(np.mean(np.abs(gray_img.astype(np.float64) - blurred)))

    return {
        "contrast": contrast,
        "sharpness": sharpness,
        "brightness": brightness,
        "noise_level": noise_level,
        # Conservative thresholds — only flag when genuinely degraded
        "needs_contrast": contrast < 30,           # Very low contrast (near-uniform gray)
        "needs_sharpen": sharpness < 50,            # Extremely blurry
        "needs_denoise": noise_level > 0.12,        # High noise
        "needs_brightness": brightness < 40 or brightness > 230,  # Near-white or near-black
    }


def _adaptive_enhance(image, quality: dict) -> Image.Image:
    """Apply minimal, YOLO-safe preprocessing based on detected image quality.

    CRITICAL: Enhancements must preserve the visual features the YOLO detector was
    trained on (high-contrast black text on light background). No global histogram
    equalization or aggressive sharpening — these destroy stroke patterns.
    """
    img = image.convert("L")

    # Only fix genuinely broken images — default to doing nothing
    needs_any = (
        quality["needs_contrast"]
        or quality["needs_brightness"]
        or (quality["needs_denoise"] and quality["needs_sharpen"])
    )

    if not needs_any:
        return img  # Image is fine as-is — don't touch it!

    # Brightness fix: gentle clamping toward mid-gray (safe for YOLO)
    if quality.get("needs_brightness", False):
        current_mean = float(np.mean(np.array(img).astype(np.float64)))
        target_bright = 128.0  # Closer to neutral
        scale = target_bright / max(current_mean, 1)
        # Clamp aggressively — don't shift more than 30%
        scale = min(max(scale, 0.7), 1.3)
        enhancer = ImageEnhance.Brightness(img)
        img = enhancer.enhance(scale)

    # Contrast fix: very mild boost only (safe for YOLO)
    if quality.get("needs_contrast", False):
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(1.2)  # Mild — not 1.5+

    # Denoise: single-pass median only when noise is severe AND sharpness is poor
    if quality.get("needs_denoise") and quality.get("needs_sharpen"):
        img = img.filter(ImageFilter.MedianFilter(size=2))

    return img


# ── Bounding Box Utility ──────────────────────────────────────

def _pad_bbox(box: list[float], image_size: tuple[int, int], pad_percent: float) -> list[float]:
    """Expand bounding box by percentage for full character context.

    Urdu characters have ascenders (above main body) and descenders (below),
    so padding ensures the model sees surrounding diacritics and connections.
    """
    x1, y1, x2, y2 = box
    iw = x2 - x1
    ih = y2 - y1
    pad_x = iw * pad_percent / 100
    pad_y = ih * pad_percent / 100

    return [
        max(0, x1 - pad_x),
        max(0, y1 - pad_y),
        min(image_size[0], x2 + pad_x),
        min(image_size[1], y2 + pad_y),
    ]


# ── Beam Search Decoding ─────────────────────────────────────

def _beam_search_decode(preds: torch.Tensor, converter, beam_width: int = 5) -> tuple[str, list[float]]:
    """Decode using top-k beam search for improved recognition accuracy.

    Returns (best_text, per_char_confidences).
    """
    batch_size, seq_len, num_classes = preds.shape

    topk_indices = torch.topk(preds, k=beam_width, dim=-1)[1]

    best_text = ""
    best_conf_list: list[float] = []
    best_logprob = -float('inf')

    # Greedy baseline score
    greedy_index = preds.argmax(dim=-1)
    greedy_text = converter.decode(greedy_index.data, torch.IntTensor([seq_len] * batch_size))[0]

    # Score each beam candidate independently and pick the best
    for b in range(beam_width):
        beam_index = topk_indices[:, :, b]
        beam_text = converter.decode(beam_index.data, torch.IntTensor([seq_len] * batch_size))[0]

        if not beam_text:
            continue

        log_prob_sum = 0.0
        char_confs: list[float] = []
        for t in range(seq_len):
            idx = topk_indices[0, t, b].item()
            prob = torch.softmax(preds[0, t], dim=-1)[idx].item()
            log_prob_sum += math.log(max(prob, 1e-8))
            char_confs.append(round(prob, 4))

        avg_log_prob = log_prob_sum / max(seq_len, 1)

        if avg_log_prob > best_logprob:
            best_text = beam_text
            best_conf_list = char_confs
            best_logprob = avg_log_prob

    # Fall back to greedy if no beam produced valid text
    if not best_text:
        best_text = greedy_text
        best_conf_list = []

    return best_text, best_conf_list


# ── Preprocessing ─────────────────────────────────────────────

def preprocess_image(image: Image.Image, conf_threshold: float, img_size: int) -> tuple[Image.Image, list[list[float]], float | None, str]:
    """Preprocess image and return (processed_image, padded_boxes, detection_conf, annotated_b64).

    The processed_image is the enhanced version passed to recognition.
    Detection always runs on clean grayscale to preserve features YOLO was trained on.
    """
    from PIL import ImageDraw

    # Always start with clean grayscale for detection (YOLO was trained on this)
    gray_img = image.convert("L") if image.mode != "L" else image.copy()

    # YOLO detection on raw grayscale — never enhanced (preserves trained features)
    from engine.loader import get_models
    models = get_models()
    det_model = models["detection_model"]
    device = models["device"]

    det_results = det_model.predict(
        source=gray_img, conf=conf_threshold, imgsz=img_size, save=False, nms=DEFAULT_NMS, device=device
    )

    raw_boxes = det_results[0].boxes.xyxy.cpu().numpy().tolist()

    # Fallback: if YOLO finds zero boxes at the given threshold, retry with lower threshold
    if not raw_boxes and conf_threshold > 0.05:
        print(f"[v2] No detections at conf={conf_threshold}, retrying at 0.01...")
        det_results = det_model.predict(
            source=gray_img, conf=0.01, imgsz=img_size, save=False, nms=DEFAULT_NMS, device=device
        )
        raw_boxes = det_results[0].boxes.xyxy.cpu().numpy().tolist()

    if not raw_boxes:
        print(f"[v2] WARNING: YOLO detected 0 text boxes for {gray_img.size}")
    # Sort top-to-bottom; pad for full character context
    boxes = sorted(raw_boxes, key=lambda x: x[1])  # top-to-bottom
    pad_percent = BBOX_PADDING_PERCENT
    img_w, img_h = gray_img.size
    padded_boxes = [_pad_bbox(box, (img_w, img_h), pad_percent) for box in boxes]
    det_confs = None
    if det_results[0].boxes.conf is not None and len(det_results[0].boxes.conf) > 0:
        det_confs = det_results[0].boxes.conf.cpu().numpy().tolist()

    # Annotated image (single source of truth)
    annotated = image.convert("RGB").copy()
    draw = ImageDraw.Draw(annotated)
    for i, box in enumerate(raw_boxes):
        if det_confs and i < len(det_confs) and det_confs[i] > 0.5:
            color = (66, 135, 245)  # green — high confidence
        else:
            color = (245, 66, 66)   # red — low confidence
        draw.rectangle(box, fill=None, outline=color, width=3)

    buf = io.BytesIO()
    annotated.save(buf, format="PNG")
    buf.seek(0)
    b64_annotated = base64.b64encode(buf.read()).decode("utf-8")

    # Post-detection enhancement: apply to gray_img for recognition (safe — detection already done)
    processed = gray_img
    if AUTO_ENHANCE_ENABLED:
        img_array = np.array(gray_img)
        quality = _detect_image_quality(img_array)
        processed = _adaptive_enhance(gray_img, quality)

    return processed, padded_boxes, det_confs[0] if det_confs else None, b64_annotated


# ── Recognition ───────────────────────────────────────────────

def run_recognition(processed_img: Image.Image, boxes: list[list[float]]) -> tuple[list[str], list[OCRResultLine]]:
    """Run text recognition on cropped line images with beam search decoding."""
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

        # Improved confidence estimation via beam search
        img_tensor = _prepare_input(cropped, device)
        with torch.no_grad():
            preds = rec_model(img_tensor)

            if BEAM_SEARCH_WIDTH > 1:
                text_line, char_confs = _beam_search_decode(preds, converter, beam_width=BEAM_SEARCH_WIDTH)
                probs = torch.softmax(preds, dim=-1)
                mean_conf = float(probs.max().mean().item())
                texts.append(text_line)
            else:
                probs = torch.softmax(preds, dim=-1)
                mean_conf = float(probs.max().mean().item())
                char_confs = [round(float(probs[0, t].max().item()), 4) for t in range(preds.size(1))]
                texts.append(text_line)

        line_results.append(OCRResultLine(
            index=i + 1,
            text=text_line,
            confidence=round(mean_conf, 4),
            char_confidences=char_confs if char_confs else None,
            bounding_box=[round(v, 2) for v in box],
            detection_confidence=None,
        ))

    return texts, line_results


def _prepare_input(img_crop: Image.Image, device: torch.device):
    """Prepare a single cropped image tensor for recognition."""
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


# ── Main pipeline entry ───────────────────────────────────────

def run_ocr_pipeline(image: Image.Image, filename: str, file_type: str,
                     conf_threshold: float = DEFAULT_CONF_THRESHOLD,
                     img_size: int = DEFAULT_IMG_SIZE) -> OCRResult:
    """Run the full OCR pipeline and return an OCRResult."""
    import time as _time

    t0 = _time.perf_counter()

    # Detection + bounding boxes + annotated image (single pass)
    processed_img, boxes, det_conf, b64_annotated = preprocess_image(image, conf_threshold, img_size)

    if not boxes:
        elapsed = (_time.perf_counter() - t0) * 1000
        return OCRResult(
            filename=filename, file_type=file_type, lines=[], full_text="",
            processing_time_ms=elapsed,
        )

    # Recognition with improved decoding
    texts, line_results = run_recognition(processed_img, boxes)

    elapsed = (_time.perf_counter() - t0) * 1000

    full_text = "\n".join(texts)
    result = OCRResult(
        filename=filename, file_type=file_type, lines=line_results,
        full_text=full_text, annotated_image_b64=b64_annotated,
        processing_time_ms=elapsed,
    )
    return result

"""Image preprocessing utilities."""

from __future__ import annotations

import io
from typing import Optional

from PIL import Image, ImageFilter, ImageEnhance, ImageOps


def enhance_image(image_input: bytes | io.BytesIO | Image.Image, options: dict = None) -> Image.Image:
    """Apply optional image enhancement before OCR.

    Args:
        image_input: PIL Image or raw bytes/BytesIO of an image.
        options: Dict of enhancement flags.
            auto_contrast: apply AutoContrast
            sharpen: apply Sharpen filter
            denoise: apply Median filter
            normalize_background: equalize histogram
            brightness: float (0.5-2.0)
            contrast: float (0.5-2.0)

    Returns:
        Enhanced PIL Image (always returned as grayscale/L mode for OCR).
    """
    if isinstance(image_input, (bytes, io.BytesIO)):
        image = Image.open(image_input).convert("L")
    else:
        image = image_input.copy()
    
    if not options:
        return image

    img = image.copy()

    # Auto contrast
    if options.get("auto_contrast"):
        img = ImageOps.autocontrast(img)

    # Brightness
    brightness = options.get("brightness")
    if brightness is not None and 0.5 <= brightness <= 2.0:
        enhancer = ImageEnhance.Brightness(img)
        img = enhancer.enhance(brightness)

    # Contrast
    contrast = options.get("contrast")
    if contrast is not None and 0.5 <= contrast <= 2.0:
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(contrast)

    # Sharpen
    if options.get("sharpen"):
        img = img.filter(ImageFilter.SHARPEN)

    # Denoise
    if options.get("denoise"):
        img = img.filter(ImageFilter.MedianFilter(size=3))

    # Normalize background (histogram equalization)
    if options.get("normalize_background"):
        if img.mode == "RGB":
            channels = img.split()
            eq_channels = [ImageOps.equalize(ch) for ch in channels]
            img = Image.merge("RGB", eq_channels)
        else:
            img = ImageOps.equalize(img)

    return img.convert("L")


def validate_file_size(file_data: bytes | io.BytesIO, max_mb: int) -> tuple[bool, str]:
    """Validate file size against a maximum. Returns (is_valid, message)."""
    data = file_data if isinstance(file_data, bytes) else file_data.getvalue()
    size_mb = len(data) / (1024 * 1024)

    if size_mb > max_mb:
        return False, f"File too large: {size_mb:.1f}MB (max {max_mb}MB)"
    if len(data) < 100:
        return False, "File too small or empty"
    return True, ""

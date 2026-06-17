"""Singleton model loader for the v2 OCR engine.

All core OCR components (Model, CTCLabelConverter, text_recognizer) are
embedded here so the engine no longer depends on any old backend/ files.

UNet architecture matches the original repository:
https://github.com/abdur75648/End-To-End-Urdu-OCR-WebApp
"""

from __future__ import annotations

import io
import math
import os
import sys
import warnings
from pathlib import Path
from typing import Optional

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision.transforms as T
from config import (
    DEFAULT_DEVICE,
    DETECTION_MODEL_PATH,
    RECOGNITION_MODEL_PATH,
    URDUGLYPHS_PATH,
)
from PIL import Image


# ── Embedded old-module classes (exact copies from original repo) ──

class NormalizePAD(object):
    """Padding used by the recognition model input pipeline."""

    def __init__(self, max_size, PAD_type="right"):
        self.toTensor = T.ToTensor()
        self.max_size = max_size
        self.max_width_half = math.floor(max_size[2] / 2)
        self.PAD_type = PAD_type

    def __call__(self, img):
        img = self.toTensor(img)
        img.sub_(0.5).div_(0.5)
        c, h, w = img.size()
        Pad_img = torch.FloatTensor(*self.max_size).fill_(0)
        Pad_img[:, :, :w] = img  # right pad
        if self.max_size[2] != w:
            Pad_img[:, :, w:] = img[:, :, w - 1].unsqueeze(2).expand(c, h, self.max_size[2] - w)
        return Pad_img


class CTCLabelConverter(object):
    """Convert between text-label and text-index."""

    def __init__(self, character: str):
        dict_character = list(character)
        self.dict = {}
        for i, char in enumerate(dict_character):
            self.dict[char] = i + 1
        self.character = ["[CTCblank]"] + dict_character

    def encode(self, text, batch_max_length=25):
        length = [len(s) for s in text]
        batch_text = torch.LongTensor(len(text), batch_max_length).fill_(0)
        for i, t in enumerate(text):
            t = list(t)
            t = [self.dict[char] for char in t]
            batch_text[i][:len(t)] = torch.LongTensor(t)
        return (batch_text, torch.IntTensor(length))

    def decode(self, text_index, length):
        texts = []
        for index, l in enumerate(length):
            t = text_index[index, :]
            char_list = []
            for i in range(l):
                if t[i] != 0 and (not (i > 0 and t[i - 1] == t[i])):
                    char_list.append(self.character[t[i]])
            texts.append("".join(char_list))
        return texts


# ── UTRNet Model — exact copy from original repo ─────────────────

class dropout_layer(nn.Module):
    """Custom per-pixel dropout used in the original UTRNet."""
    def __init__(self, device):
        super(dropout_layer, self).__init__()
        self.device = device

    def forward(self, input):
        nums = (np.random.rand(input.shape[1]) > 0.2).astype(int)
        dummy_array_output = torch.from_numpy(nums).to(self.device)
        dummy_array_output_t = torch.reshape(dummy_array_output, (input.shape[1], 1)).to(self.device)
        dummy_array_output_f = dummy_array_output_t.repeat(input.shape[0], 1, input.shape[2]).to(self.device)
        return input * dummy_array_output_f


class BidirectionalLSTM(nn.Module):
    """Bi-LSTM layer used in the UTRNet sequence modeling stage."""
    def __init__(self, input_size, hidden_size, output_size):
        super(BidirectionalLSTM, self).__init__()
        self.rnn = nn.LSTM(input_size, hidden_size, bidirectional=True, batch_first=True)
        self.linear = nn.Linear(hidden_size * 2, output_size)

    def forward(self, input):
        self.rnn.flatten_parameters()
        recurrent, _ = self.rnn(input)
        output = self.linear(recurrent)
        return output


# ── UNet (exact copy from modules/cnn/unet.py) ───────────────────

class DoubleConv(nn.Module):
    """(convolution => [BN] => ReLU) * 2"""
    def __init__(self, in_channels, out_channels, mid_channels=None):
        super().__init__()
        if not mid_channels:
            mid_channels = out_channels
        self.double_conv = nn.Sequential(
            nn.Conv2d(in_channels, mid_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(mid_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(mid_channels, out_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True)
        )

    def forward(self, x):
        return self.double_conv(x)


class Down(nn.Module):
    """Downscaling with maxpool then double conv."""
    def __init__(self, in_channels, out_channels):
        super(Down, self).__init__()
        self.maxpool_conv = nn.Sequential(
            nn.MaxPool2d(2),
            DoubleConv(in_channels, out_channels)
        )

    def forward(self, x):
        return self.maxpool_conv(x)


class Up(nn.Module):
    """Upscaling then double conv."""
    def __init__(self, in_channels, out_channels):
        super(Up, self).__init__()
        self.up = nn.ConvTranspose2d(in_channels, in_channels // 2, kernel_size=2, stride=2)
        self.conv = DoubleConv(in_channels, out_channels)

    def forward(self, x1, x2):
        x1 = self.up(x1)
        diffY = x2.size()[2] - x1.size()[2]
        diffX = x2.size()[3] - x1.size()[3]
        x1 = F.pad(x1, [diffX // 2, diffX - diffX // 2, diffY // 2, diffY - diffY // 2])
        x = torch.cat([x2, x1], dim=1)
        return self.conv(x)


class OutConv(nn.Module):
    def __init__(self, in_channels, out_channels):
        super(OutConv, self).__init__()
        self.conv = nn.Conv2d(in_channels, out_channels, kernel_size=1)

    def forward(self, x):
        return self.conv(x)


class UNet(nn.Module):
    """UNet encoder-decoder used as the feature extractor in UTRNet.

    Architecture (channels): inc(32) -> down1(64) -> down2(128) -> down3(256) -> down4(512)
                  up1(256) -> up2(128) -> up3(64) -> up4(32) -> outc(n_classes=512)
    """
    def __init__(self, n_channels=1, n_classes=512):
        super(UNet, self).__init__()
        self.n_channels = n_channels
        self.n_classes = n_classes

        self.inc = DoubleConv(n_channels, 32)
        self.down1 = Down(32, 64)
        self.down2 = Down(64, 128)
        self.down3 = Down(128, 256)
        self.down4 = Down(256, 512)
        self.up1 = Up(512, 256)
        self.up2 = Up(256, 128)
        self.up3 = Up(128, 64)
        self.up4 = Up(64, 32)
        self.outc = OutConv(32, n_classes)

    def forward(self, x):
        x1 = self.inc(x)
        x2 = self.down1(x1)
        x3 = self.down2(x2)
        x4 = self.down3(x3)
        x5 = self.down4(x4)
        x = self.up1(x5, x4)
        x = self.up2(x, x3)
        x = self.up3(x, x2)
        x = self.up4(x, x1)
        logits = self.outc(x)
        return logits


class UNet_FeatureExtractor(nn.Module):
    def __init__(self, input_channel=1, output_channel=512):
        super(UNet_FeatureExtractor, self).__init__()
        self.ConvNet = UNet(input_channel, output_channel)

    def forward(self, input):
        return self.ConvNet(input)


class Model(nn.Module):
    """UTRNet model — exact copy from old backend/model.py."""

    def __init__(self, num_class=181, device="cpu"):
        super(Model, self).__init__()
        self.device = device

        self.FeatureExtraction = UNet_FeatureExtractor(1, 512)
        self.FeatureExtraction_output = 512
        self.AdaptiveAvgPool = nn.AdaptiveAvgPool2d((None, 1))

        self.dropout1 = dropout_layer(device)
        self.dropout2 = dropout_layer(device)
        self.dropout3 = dropout_layer(device)
        self.dropout4 = dropout_layer(device)
        self.dropout5 = dropout_layer(device)

        self.SequenceModeling = nn.Sequential(
            BidirectionalLSTM(self.FeatureExtraction_output, 256, 256),
            BidirectionalLSTM(256, 256, 256))
        self.SequenceModeling_output = 256

        self.Prediction = nn.Linear(self.SequenceModeling_output, num_class)

    def forward(self, input, text=None, is_train=True):
        visual_feature = self.FeatureExtraction(input)
        visual_feature = self.AdaptiveAvgPool(visual_feature.permute(0, 3, 1, 2))
        visual_feature = visual_feature.squeeze(3)

        visual_feature_after_dropout1 = self.dropout1(visual_feature)
        visual_feature_after_dropout2 = self.dropout2(visual_feature)
        visual_feature_after_dropout3 = self.dropout3(visual_feature)
        visual_feature_after_dropout4 = self.dropout4(visual_feature)
        visual_feature_after_dropout5 = self.dropout5(visual_feature)
        contextual_feature1 = self.SequenceModeling(visual_feature_after_dropout1)
        contextual_feature2 = self.SequenceModeling(visual_feature_after_dropout2)
        contextual_feature3 = self.SequenceModeling(visual_feature_after_dropout3)
        contextual_feature4 = self.SequenceModeling(visual_feature_after_dropout4)
        contextual_feature5 = self.SequenceModeling(visual_feature_after_dropout5)
        contextual_feature = ((contextual_feature1).add((contextual_feature2).add(((contextual_feature3).add(((contextual_feature4).add(contextual_feature5)))))) ) * (1/5)

        prediction = self.Prediction(contextual_feature.contiguous())
        return prediction


def text_recognizer(img_cropped, model, converter, device):
    """Run recognition on a single cropped line image."""
    img = img_cropped.convert("L")
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
    img = img.unsqueeze(0)
    batch_size = 1
    img = img.to(device)

    preds = model(img)
    preds_size = torch.IntTensor([preds.size(1)] * batch_size)
    _, preds_index = preds.max(2)
    preds_str = converter.decode(preds_index.data, preds_size.data)[0]
    return preds_str


# ── Model Loading Globals ───────────────────────────────────────

_models_loaded = False
_device: Optional[torch.device] = None
_converter = None
_recognition_model = None
_detection_model = None
_text_recognizer_func = None


def _resolve_device(label: str) -> torch.device:
    """Resolve a device label to a torch.device."""
    if label == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    elif label == "cuda":
        if torch.cuda.is_available():
            return torch.device("cuda")
        raise RuntimeError("cuda requested but not available")
    elif label == "cpu":
        return torch.device("cpu")
    raise ValueError(f"Unknown device label: {label}")


def load_models(device_label: Optional[str] = None) -> dict:
    """Load (or reload) OCR models. Returns metadata dict."""
    global _models_loaded, _device, _converter, _recognition_model
    global _detection_model, _text_recognizer_func

    label = device_label or DEFAULT_DEVICE
    device = _resolve_device(label)
    requested_str = str(device)

    # Skip reload if already loaded on same device
    if _models_loaded and str(_device) == requested_str:
        return {"status": "already_loaded", "device": requested_str}

    print(f"[v2] Loading OCR models on {requested_str} ...")

    warnings.filterwarnings("ignore", category=UserWarning)
    warnings.filterwarnings("ignore", category=FutureWarning)

    # Load vocabulary
    with open(URDUGLYPHS_PATH, "r", encoding="utf-8") as fh:
        content = "".join(line.strip("\n") for line in fh) + " "

    _device = device
    print(f"[v2] Device: {_device}")

    # All OCR components are now embedded above — no external file dependencies.
    _text_recognizer_func = text_recognizer
    _converter = CTCLabelConverter(content)

    try:
        _recognition_model = Model(num_class=len(_converter.character), device=device)
        _recognition_model = _recognition_model.to(device)
    except RuntimeError as e:
        if "CUDA" in str(e) or "cuda" in str(e):
            print(f"[v2] CUDA failed ({e}), falling back to CPU...")
            device = torch.device("cpu")
            _device = device
            _recognition_model = Model(num_class=len(_converter.character), device=device)
            _recognition_model = _recognition_model.to(device)
        else:
            raise

    try:
        state_dict = torch.load(str(RECOGNITION_MODEL_PATH), map_location=device, weights_only=True)
    except TypeError:
        state_dict = torch.load(str(RECOGNITION_MODEL_PATH), map_location=device, weights_only=False)
    _recognition_model.load_state_dict(state_dict)
    _recognition_model.eval()

    from ultralytics import YOLO
    _detection_model = YOLO(str(DETECTION_MODEL_PATH))

    _models_loaded = True

    # Gather metadata
    mem_used = 0.0
    mem_total = 0.0
    if torch.cuda.is_available():
        mem_used = torch.cuda.memory_allocated() / (1024 ** 3)
        mem_total = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)

    metadata = {
        "status": "loaded",
        "device": requested_str,
        "vocab_size": len(_converter.character),
        "gpu_mem_used_gb": round(mem_used, 2),
        "gpu_mem_total_gb": round(mem_total, 2),
    }
    print(f"[v2] Models loaded successfully. {metadata}")
    return metadata


def get_models():
    """Return the currently loaded model objects. Raises if not loaded."""
    assert _models_loaded, "Models are not loaded. Call load_models() first."
    return {
        "device": _device,
        "converter": _converter,
        "recognition_model": _recognition_model,
        "detection_model": _detection_model,
        "text_recognizer_func": _text_recognizer_func,
    }


def reload_models(device_label: Optional[str] = None) -> dict:
    """Force-reload models (useful when switching devices)."""
    global _models_loaded
    _models_loaded = False
    return load_models(device_label)

"""Urdu/Arabic text cleaning, normalization, and auto-correction engine.

New in this version:
- Character-level confusion map for common OCR errors in Urdu
- Dictionary-based correction with Levenshtein distance (from urdu-dict data)
- Context-aware word-level correction with n-gram scoring
- Optional UrduHack integration for advanced spelling correction
- Three modes: "char" (fast), "distance" (balanced), "hybrid" (best quality)
- Toggle via ENV var URDUTEXT_AUTOCORRECT_ENABLED + URDUTEXT_AUTOCORRECT_MODE
"""

from __future__ import annotations

import os
import re
from typing import Optional

try:
    import arabic_reshaper  # noqa: F401
    HAS_ARABIC_RESHAPER = True
except ImportError:
    HAS_ARABIC_RESHAPER = False

def _has_arabic_reshaper() -> bool:
    """Check if arabic_reshaper is available."""
    return HAS_ARABIC_RESHAPER


try:
    import PyArabic  # noqa: F401
    HAS_PYARABIC = True
except ImportError:
    HAS_PYARABIC = False


def _has_pyarabic() -> bool:
    """Check if PyArabic is available."""
    return HAS_PYARABIC


# ── Urdu Character Confusion Map ────────────────────────────────
# Common OCR errors for Urdu script characters that look similar

CHAR_CONFUSIONS = {
    # ب/ت/ث — Same base shape, different dot patterns (OCR often confuses)
    "\u062A": "\u0628",  # ت -> ب
    "\u062B": "\u0628",  # ث -> ب

    # چ/ج — Different number of dots above
    "\u0686": "\u062C",  # چ (Urdu Cha) -> ج
    "\u068A": "\u0686",  # ژ -> چ
    "\u062C": "\u0686",  # ج -> چ

    # ک/گ — Persian vs Urdu Kaf/Gaf
    "\u06A9": "\u06AF",  # ک (Persian) -> گ (Urdu)
    "\u06AF": "\u06A9",  # گ (Urdu) -> ک (Persian)

    # ی/ئ — Urdu Yeh vs Hamza on Yeh
    "\u06CC": "\u0626",  # ی (linking) -> ئ (non-linking)
    "\u0626": "\u06CC",  # ئ -> ی

    # ة/ہ — Teh Marbuta vs Heh Ghunna
    "\u0629": "\u06C1",  # ة -> ہ
    "\u06C1": "\u0629",  # ہ -> ة

    # و/ؤ — Waw vs Hamza on Waw
    "\u0648": "\u0656",  # و -> ؤ
}


class TextCleaner:
    """Apply Urdu/Arabic text cleaning transformations with optional spell checking."""

    # Lazy-loaded spell checker singleton
    _spell_checker: Optional["object"] = None  # type: ignore[type-arg]

    @staticmethod
    def _ensure_spell_checker():
        """Lazy-initialize the UrduSpellChecker on first use with all config options."""
        if TextCleaner._spell_checker is None:
            from engine.spell_checker import UrduSpellChecker
            mode = os.environ.get("URDUTEXT_AUTOCORRECT_MODE", "hybrid").lower()
            ngram_order = 2 if mode == "hybrid" else 1
            TextCleaner._spell_checker = UrduSpellChecker(
                max_distance=int(os.environ.get("SPELL_CHECK_MAX_DISTANCE", "3")),
                use_word_freq=os.environ.get("SPELL_CHECK_USE_WORD_FREQ", "true").lower() == "true",
                ngram_order=ngram_order,
                confidence_threshold=float(os.environ.get("SPELL_CHECK_CONFIDENCE_THRESHOLD", "0.35")),
            )
        return TextCleaner._spell_checker  # type: ignore[return-value]

    @staticmethod
    def reshape(text: str) -> str:
        """Reshape Arabic script for correct visual rendering."""
        if not _has_arabic_reshaper():
            return text
        try:
            import arabic_reshaper  # noqa: F401
            return arabic_reshaper.reshape(text)
        except Exception:
            return text

    @staticmethod
    def remove_diacritics(text: str) -> str:
        """Remove Arabic diacritical marks (tashkeel)."""
        diacritic_ranges = [
            (0x064B, 0x065F),
            (0x0670, 0x0670),
            (0x06D6, 0x06DC),
            (0x06DF, 0x06E4),
            (0x06E7, 0x06E8),
            (0x06EA, 0x06ED),
        ]
        result = []
        for ch in text:
            cp = ord(ch)
            if any(start <= cp <= end for start, end in diacritic_ranges):
                continue
            result.append(ch)
        return "".join(result)

    @staticmethod
    def normalize_alef(text: str) -> str:
        """Normalize various Alef characters to a standard form."""
        text = text.replace("\u0622", "\u0627")  # Alef with madda above -> Alef
        text = text.replace("\u0623", "\u0627")  # Alef with hamza above -> Alef
        text = text.replace("\u0625", "\u0627")  # Alef with hamza below -> Alef
        return text

    @staticmethod
    def normalize_tatil(text: str) -> str:
        """Normalize 'tatil' characters (extended Arabic chars)."""
        substitutions = {
            "\u06A6": "\u0643",  # Persian Kaf -> Arabic Kaf
            "\u06AF": "\u063A",  # Persian Gha'in -> Arabic Ghain
            "\u0698": "\u062C",  # Urdu Je -> Arabic Je
            "\u0686": "\u0686",  # Urdu Cha — keep as-is
            "\u067E": "\u067E",  # Urdu Pe — keep as-is
            "\u0691": "\u062F",  # Urdu Dal -> Arabic Dal
            "\u06BE": "\u0628",  # Urdu Beh -> Arabic Beh
        }
        for src, dst in substitutions.items():
            text = text.replace(src, dst)
        return text

    @staticmethod
    def normalize_whitespace(text: str) -> str:
        """Normalize various whitespace to standard space."""
        text = re.sub(r'[\u2000-\u200B\u202F\u205F\u3000]+', ' ', text)
        return text.strip()

    @staticmethod
    def autocorrect_char(text: str) -> tuple[str, dict]:
        """Character-level auto-correction using confusion map.

        Returns (corrected_text, correction_stats).
        """
        corrections = {"applied": 0, "characters": [], "words": []}
        result = []

        for ch in text:
            if ch in CHAR_CONFUSIONS:
                corrected = CHAR_CONFUSIONS[ch]
                result.append(corrected)
                corrections["applied"] += 1
                corrections["characters"].append({
                    "from": ch,
                    "to": corrected,
                    "pos": len(result) - 1,
                })
            else:
                result.append(ch)

        return "".join(result), corrections

    @staticmethod
    def autocorrect_dict(text: str) -> tuple[str, dict]:
        """Dictionary-based auto-correction using Levenshtein distance.

        Uses the urdu-dict word list for candidate generation and scoring.
        Returns (corrected_text, correction_stats).
        """
        spell_checker = TextCleaner._ensure_spell_checker()
        corrected, stats = spell_checker.correct(text, mode="distance")  # type: ignore[attr-defined]

        # Stats transformation for backward compatibility with old text_cleaner API
        transformed_stats: dict = {
            "applied": 0,
            "characters": [],
            "words": [],
        }
        transformed_stats["applied"] = stats.get("applied", 0)
        if "characters" in stats:
            transformed_stats["characters"] = [
                {"from": c.get("from"), "to": c.get("to"), "pos": c.get("pos")}
                for c in stats["characters"]
            ]
        if "words" in stats:
            transformed_stats["words"] = [
                {"from": w.get("from"), "to": w.get("to"), "pos": w.get("pos", -1)}
                for w in stats["words"]
            ]

        return corrected, transformed_stats

    @staticmethod
    def autocorrect_context(text: str) -> tuple[str, dict]:
        """Context-aware word-level auto-correction using hybrid mode.

        Combines: confusion map + Levenshtein dictionary lookup + n-gram context scoring.
        Optionally uses UrduHack if available.

        Returns (corrected_text, correction_stats).
        """
        spell_checker = TextCleaner._ensure_spell_checker()
        corrected, stats = spell_checker.correct(text, mode="hybrid")  # type: ignore[attr-defined]

        # Stats transformation for backward compatibility
        transformed_stats: dict = {
            "applied": 0,
            "characters": [],
            "words": [],
        }
        transformed_stats["applied"] = stats.get("applied", 0)
        if "characters" in stats:
            transformed_stats["characters"] = [
                {"from": c.get("from"), "to": c.get("to"), "pos": c.get("pos")}
                for c in stats["characters"]
            ]
        if "words" in stats:
            transformed_stats["words"] = [
                {
                    "from": w.get("from"),
                    "to": w.get("to"),
                    "pos": w.get("pos", -1),
                    "reason": w.get("reason", ""),
                }
                for w in stats["words"]
            ]

        return corrected, transformed_stats

    @staticmethod
    def clean(text: str, diacritics: bool = False, normalize_alef_chars: bool = True,
              normalize_tatil: bool = True, reshape: bool = True,
              normalize_whitespace: bool = True) -> str:
        """Apply a full cleaning pipeline to extracted text."""
        if not text:
            return text
        if normalize_whitespace:
            text = TextCleaner.normalize_whitespace(text)
        if normalize_alef_chars:
            text = TextCleaner.normalize_alef(text)
        if normalize_tatil:
            text = TextCleaner.normalize_tatil(text)
        if diacritics:
            text = TextCleaner.remove_diacritics(text)
        if reshape:
            text = TextCleaner.reshape(text)
        return text

    @staticmethod
    def clean_and_autocorrect(
        text: str,
        mode: str = "hybrid",  # "char" | "distance" | "context" | "hybrid" | "aggressive"
        diacritics: bool = False,
        normalize_alef_chars: bool = True,
        normalize_tatil: bool = True,
        reshape: bool = True,
        normalize_whitespace: bool = True,
    ) -> tuple[str, dict]:
        """Apply cleaning + auto-correction pipeline.

        Modes:
        - "char":       Character confusion map only (fastest)
        - "distance":   Dictionary lookup with Levenshtein distance (balanced)
        - "context"/"hybrid": Full hybrid with n-gram scoring + UrduHack (best quality)
        - "aggressive": Maximum corrections with lower confidence threshold

        Returns (cleaned_text, correction_stats).
        """
        # Step 1: Standard cleaning
        cleaned = TextCleaner.clean(
            text,
            diacritics=diacritics,
            normalize_alef_chars=normalize_alef_chars,
            normalize_tatil=normalize_tatil,
            reshape=reshape,
            normalize_whitespace=normalize_whitespace,
        )

        # Step 2: Auto-correction based on mode
        if mode == "char":
            corrected, stats = TextCleaner.autocorrect_char(cleaned)
        elif mode == "distance":
            corrected, stats = TextCleaner.autocorrect_dict(cleaned)
        elif mode in ("context", "hybrid"):
            corrected, stats = TextCleaner.autocorrect_context(cleaned)
        else:
            return cleaned, {}

        # Step 3: Re-apply reshaping after correction
        if reshape:
            corrected = TextCleaner.reshape(corrected)

        return corrected, stats


def clean_text(text: str, **kwargs) -> str:
    """Convenience function for text cleaning."""
    return TextCleaner.clean(text, **kwargs)

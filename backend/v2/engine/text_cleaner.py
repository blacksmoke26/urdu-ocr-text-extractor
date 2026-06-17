"""Urdu/Arabic text cleaning and normalization engine."""

from __future__ import annotations

import re

try:
    import arabic_reshaper
    HAS_ARABIC_RESHAPER = True
except ImportError:
    HAS_ARABIC_RESHAPER = False

try:
    import PyArabic
    HAS_PYARABIC = True
except ImportError:
    HAS_PYARABIC = False


class TextCleaner:
    """Apply Urdu/Arabic text cleaning transformations."""

    @staticmethod
    def reshape(text: str) -> str:
        """Reshape Arabic script for correct visual rendering."""
        if not HAS_ARABIC_RESHAPER:
            return text
        try:
            return arabic_reshaper.reshape(text)
        except Exception:
            return text

    @staticmethod
    def remove_diacritics(text: str) -> str:
        """Remove Arabic diacritical marks (tashkeel)."""
        # Unicode ranges for Arabic diacritics
        diacritic_ranges = [
            (0x064B, 0x065F),  # Fatha, Damma, Kasra, etc.
            (0x0670, 0x0670),  # Superscript Alef
            (0x06D6, 0x06DC),  # Additional diacritics
            (0x06DF, 0x06E4),  # More diacritics
            (0x06E7, 0x06E8),  # More diacritics
            (0x06EA, 0x06ED),  # Empty box diacritics
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
        # Arabic Alef variants: \u0627 (Alef), \u0686 (Alef with madda above is different)
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
        # Replace all Unicode whitespace with regular space
        text = re.sub(r'[\u2000-\u200B\u202F\u205F\u3000]+', ' ', text)
        return text.strip()

    @staticmethod
    def clean(text: str, diacritics: bool = False, normalize_alef_chars: bool = True,
              normalize_tatil: bool = True, reshape: bool = True,
              normalize_whitespace: bool = True) -> str:
        """Apply a full cleaning pipeline to extracted text.

        Args:
            text: Raw extracted Urdu text.
            diacritics: Whether to remove diacritical marks.
            normalize_alef_chars: Whether to normalize Alef variants.
            normalize_tatil: Whether to normalize tatil (Persian/Urdu-specific) chars.
            reshape: Whether to apply Arabic reshaping.
            normalize_whitespace: Whether to normalize whitespace.

        Returns:
            Cleaned text string.
        """
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


def clean_text(text: str, **kwargs) -> str:
    """Convenience function for text cleaning."""
    return TextCleaner.clean(text, **kwargs)

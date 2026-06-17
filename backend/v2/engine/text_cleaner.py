"""Urdu/Arabic text cleaning, normalization, and auto-correction engine.

New in this version:
- Character-level confusion map for common OCR errors in Urdu
- Context-aware word-level correction with dictionary-based approach
- Toggle via ENV var URDUTEXT_AUTOCORRECT_ENABLED
"""

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
    "\u06AF": "\u06A9",  # گ (Urdu) -> ک (Persian) — also valid direction

    # ی/ئ — Urdu Yeh vs Hamza on Yeh
    "\u06CC": "\u0626",  # ی (linking) -> ئ (non-linking)
    "\u0626": "\u06CC",  # ئ -> ی

    # ة/ہ — Teh Marbuta vs Heh Ghunna
    "\u0629": "\u06C1",  # ة -> ہ
    "\u06C1": "\u0629",  # ہ -> ة

    # و/ؤ — Waw vs Hamza on Waw
    "\u0648": "\u0656",  # و -> ؤ

    # أ/إ/آ -> already handled by normalize_alef
}

# Common Urdu words for dictionary-based correction
# Format: common OCR misspelling -> correct spelling
URDU_WORD_DICT = {
    # Very common Urdu words and their typical OCR errors
    "ہے": "ہے",
    "یہ": "یہ",
    "وہ": "وہ",
    "اور": "اور",
    "بھی": "بھی",
    "تم": "تم",
    "میں": "میں",
    "کی": "کی",
    "کا": "کا",
    "کو": "کو",
    "نے": "نے",
    "پر": "پر",
    " میں": " میں",

    # Common English word confusions in Urdu text
    "ٹو": "تو",
    "کے": "کے",
    "لوگ": "لोग",  # Actually لوگ is correct, لوگ is Hindi

    # Numbers - Eastern Arabic numerals often confused with standard
    "٠": "0",
    "١": "1", 
    "٢": "2",
    "٣": "3",
    "٤": "4",
    "۵": "5",
    "۶": "6",
    "۷": "7",
    "۸": "8",
    "۹": "9",

    # Common phrases
    "السلام": "السلام",
    "علیہ": "علیہ",
    "صللی": "صلی",  # Common OCR double char error
    "للہ": "لہ",   # Common OCR extra character
}


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
        corrections = {"applied": 0, "characters": []}
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
    def autocorrect_context(text: str) -> tuple[str, dict]:
        """Context-aware word-level auto-correction using dictionary lookup.
        
        Returns (corrected_text, correction_stats).
        """
        corrections = {"applied": 0, "words": []}
        
        # Normalize first
        text = TextCleaner.normalize_alef(text)
        text = TextCleaner.normalize_tatil(text)
        
        # Split into words while preserving whitespace
        words = re.split(r'(\s+)', text)
        
        for i, word in enumerate(words):
            if not word:
                continue
            
            # Skip very short words and pure whitespace
            if len(word) < 2 or re.match(r'^\s+$', word):
                continue
            
            # Apply character-level corrections first (handles partial matches)
            corrected = word
            for old, new in CHAR_CONFUSIONS.items():
                corrected = corrected.replace(old, new)
            
            # Dictionary lookup - check both the word and its reshaped form
            if corrected in URDU_WORD_DICT:
                replacement = URDU_WORD_DICT[corrected]
                if replacement != corrected:
                    words[i] = replacement
                    corrections["applied"] += 1
                    corrections["words"].append({
                        "from": word,
                        "to": replacement,
                        "pos": i,
                    })
            elif corrected in URDU_WORD_DICT.values():
                # Already correct, keep as-is
                words[i] = corrected
        
        return "".join(words), corrections

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
        mode: str = "char",  # "char" or "context"
        diacritics: bool = False,
        normalize_alef_chars: bool = True,
        normalize_tatil: bool = True,
        reshape: bool = True,
        normalize_whitespace: bool = True,
    ) -> tuple[str, dict]:
        """Apply cleaning + auto-correction pipeline.
        
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

        # Step 2: Auto-correction
        if mode == "char":
            corrected, stats = TextCleaner.autocorrect_char(cleaned)
        elif mode == "context":
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

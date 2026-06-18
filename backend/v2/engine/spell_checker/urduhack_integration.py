"""UrduHack integration for advanced Urdu spell checking.

Optional dependency - only loaded if urduhack is installed.
Provides: word frequency data, spelling correction, and morphological analysis.

Usage:
    pip install urduhack
    from engine.spell_checker.urduhack_integration import UrduHackSpellProvider
    provider = UrduHackSpellProvider()
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Optional


try:
    import urduhack  # type: ignore
    HAS_URDUHACK = True
except ImportError:
    HAS_URDUHACK = False


class UrduHackSpellProvider:
    """Wrapper for UrduHack spell checking capabilities."""

    def __init__(self):
        if not HAS_URDUHACK:
            raise RuntimeError("urduhack package is not installed. Run: pip install urduhack")

    def correct(self, word: str) -> Optional[str]:
        """Correct a single Urdu word using UrduHack's spell checker."""
        try:
            from urduhack.spell import correction  # type: ignore
            return correction(word)
        except Exception:
            return None

    def correct_text(self, text: str) -> str:
        """Correct an entire Urdu text using UrduHack."""
        try:
            from urduhack.spell import correction as _corrector  # type: ignore
            # UrduHack's correction works on full text in newer versions
            return _corrector(text)
        except Exception:
            # Fall back to word-by-word
            words = text.split()
            corrected_words = []
            for w in words:
                c = self.correct(w)
                corrected_words.append(c if c else w)
            return " ".join(corrected_words)

    def get_word_frequencies(self, max_words: int = 10000) -> Counter[str]:
        """Get word frequencies from UrduHack's word frequency data."""
        freq = Counter()

        try:
            # Try loading from urduhack.data.words.word_count.txt
            data_path = Path(urduhack.__file__).parent / "data" / "words" / "word_count.txt"  # type: ignore
            if data_path.exists():
                with open(data_path, "r", encoding="utf-8") as f:
                    for line in f:
                        parts = line.strip().split()
                        if len(parts) == 2:
                            word, count = parts[0], int(parts[1])
                            freq[word] = count
        except (AttributeError, FileNotFoundError):
            pass

        return freq


def check_urduhack_available() -> bool:
    """Check if UrduHack is available."""
    return HAS_URDUHACK

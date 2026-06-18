"""UrduSpell — production-grade Urdu spell checking and auto-correction engine.

Combines:
- Dictionary words from urdu-dict (words.txt, bigram_words.txt, trigram_words.txt)
- Optional UrduHack integration for word frequencies & advanced correction
- Levenshtein edit-distance with character confusion prioritization
- N-gram language model for context-aware correction

Usage:
    from engine.spell_checker import UrduSpellChecker
    checker = UrduSpellChecker()  # lazy loads dictionary
    corrected, stats = checker.correct("ہی یہ وجہ ہے")
"""

from .checker import UrduSpellChecker
from .loaders import load_urdu_dictionary

__all__ = ["UrduSpellChecker", "load_urdu_dictionary"]

"""UrduSpell — production-grade Urdu spell checking and auto-correction engine.

Combines:
- Dictionary words from urdu-dict (words.txt, bigram_words.txt, trigram_words.txt)
- Optional UrduHack integration for word frequencies & advanced correction
- Levenshtein edit-distance with character confusion prioritization
- N-gram language model for context-aware correction

Usage:
    from engine.spell_checker import UrduSpellChecker
    checker = UrduSpellChecker()
    corrected, stats = checker.correct("ہی یہ وجہ ہے")
    
    # v4 features:
    analysis = checker.analyze_text("OCR text with errors")
    suggestions = checker.suggest_word("بنااتے")
    roman = checker.romanize("سلام علیکم")
    batch_results = checker.batch_correct(["text1", "text2"])
    analytics = checker.get_analytics("some text")
"""

from .checker import (
    UrduSpellChecker,
    _detect_script,
    _romanize,
    _load_user_dict,
    _add_to_user_dict,
    _remove_from_user_dict,
    CorrectionStats,
)
from .loaders import load_urdu_dictionary, get_dictionary

__all__ = [
    "UrduSpellChecker",
    "load_urdu_dictionary",
    "get_dictionary",
    "_detect_script",
    "_romanize",
    "_load_user_dict",
    "_add_to_user_dict",
    "_remove_from_user_dict",
    "CorrectionStats",
]

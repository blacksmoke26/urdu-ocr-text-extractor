"""Dictionary word loaders — loads words from urdu-dict files and optionally UrduHack."""

from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Optional


def _find_urdu_dict_dir() -> Optional[Path]:
    """Locate the urdu-dict directory relative to the backend project root."""
    # Try multiple known locations
    candidates = [
        Path(__file__).resolve().parent.parent.parent.parent / "urdu-dict",  # backend/urdu-dict
        Path(__file__).resolve().parent.parent.parent / "urdu-dict",  # v2/../urdu-dict (if v2 is in backend)
        Path("/backend/urdu-dict"),  # container path
    ]
    for candidate in candidates:
        if candidate.exists() and (candidate / "words.txt").exists():
            return candidate
    return None


def load_word_list(file_path: Path, encoding: str = "utf-8") -> list[str]:
    """Load a plain-text word list, one word per line."""
    if not file_path.exists():
        return []
    with open(file_path, "r", encoding=encoding) as fh:
        return [line.strip() for line in fh if line.strip()]


def load_urdu_dictionary(dict_dir: Optional[Path] = None) -> dict:
    """Load all Urdu dictionary words from urdu-dict files.

    Returns:
        {
            "words": set of single words,
            "bigrams": set of bigram words,
            "trigrams": set of trigram words,
            "all_words": set of all valid tokens (unigram + bigram + trigram),
            "word_freq": Counter of word frequencies (from UrduHack if available),
        }
    """
    if dict_dir is None:
        dict_dir = _find_urdu_dict_dir()

    words_set = set()
    bigrams_set = set()
    trigrams_set = set()

    if dict_dir and dict_dir.exists():
        single_words = load_word_list(dict_dir / "words.txt")
        bigrams_list = load_word_list(dict_dir / "bigram_words.txt")
        trigrams_list = load_word_list(dict_dir / "trigram_words.txt")

        # Single words: add as-is and also add each sub-token separated by _
        for w in single_words:
            words_set.add(w)
            # Also add individual tokens from compound words (separated by _)
            for token in w.split("_"):
                words_set.add(token)

        for b in bigrams_list:
            bigrams_set.add(b)

        for t in trigrams_list:
            trigrams_set.add(t)

    all_words = words_set | bigrams_set | trigrams_set

    # Try to load word frequencies from UrduHack if available
    word_freq: Counter[str] = Counter()
    _uh_spell_available = False
    _urduhack_module = None
    try:
        import urduhack as _uh_mod  # noqa: F401, E402
        from urduhack.spell import correction as _uh_spell_check  # noqa: F401, E402
        _uh_spell_available = True
        _urduhack_module = _uh_mod
    except ImportError:
        pass

    if _uh_spell_available and _urduhack_module is not None:
        # UrduHack provides word frequencies through its data
        try:
            freq_path = Path(_urduhack_module.__file__).parent / "data" / "words" / "word_count.txt"
            if freq_path.exists():
                with open(freq_path, "r", encoding="utf-8") as fh:
                    for line in fh:
                        parts = line.strip().split()
                        if len(parts) == 2:
                            word, count = parts[0], int(parts[1])
                            # Only count words that are in our dictionary
                            if word in all_words:
                                word_freq[word] = count
        except (AttributeError, FileNotFoundError):
            pass

    # If no UrduHack freq data, use heuristic frequencies from our dict
    # (words starting with common letters get higher base freq)
    if not word_freq and words_set:
        _assign_heuristic_frequencies(words_set, word_freq)

    return {
        "words": words_set,
        "bigrams": bigrams_set,
        "trigrams": trigrams_set,
        "all_words": all_words,
        "word_freq": word_freq,
    }


def _assign_heuristic_frequencies(words_set: set[str], freq: Counter[str]) -> None:
    """Assign heuristic frequencies to dictionary words for scoring."""
    # Common Urdu function words get higher base frequency
    common_words = {
        "ہے", "یہ", "وہ", "اور", "بھی", "تم", "میں", "کی", "کا", "کو",
        "نے", "پر", " میں", "کہ", "لیے", "والا", "والی", "والے", "ہیں",
        "ہو", "کر", "گیا", "گی", "گئے", "جائے", "دیا", "دی", "دیں",
    }
    for w in words_set:
        if w in common_words:
            freq[w] = 1000  # High base frequency for common words
        elif len(w) <= 3:
            freq[w] = 500   # Short words are more common
        else:
            freq[w] = 1     # Default low frequency


# Global cached dictionary loaded once at startup
_DICT_CACHE: Optional[dict] = None
_DICT_LOADED = False


def get_dictionary(dict_dir: Optional[Path] = None) -> dict:
    """Get the loaded Urdu dictionary (lazy-loaded, cached)."""
    global _DICT_CACHE, _DICT_LOADED

    if not _DICT_LOADED:
        _DICT_CACHE = load_urdu_dictionary(dict_dir)
        _DICT_LOADED = True

    return _DICT_CACHE or {}


def reset_dictionary() -> None:
    """Reset the dictionary cache (useful for testing)."""
    global _DICT_CACHE, _DICT_LOADED
    _DICT_CACHE = None
    _DICT_LOADED = False

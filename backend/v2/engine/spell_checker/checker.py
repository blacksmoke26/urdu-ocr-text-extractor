"""Core Urdu spell checking engine with Levenshtein distance and n-gram scoring."""

from __future__ import annotations

import math
from typing import Optional

from .loaders import load_urdu_dictionary


# ── Urdu Character Confusion Map (OCR-prone substitutions) ──────
# Bidirectional map: if OCR produces char_A but the correct char is char_B

CHAR_CONFUSIONS = {
    # ب/ت/ث — Same base shape, different dot patterns
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

# Build reverse map for efficient lookup
_CONFUSION_REVERSE: dict[str, str] = {}
for k, v in CHAR_CONFUSIONS.items():
    _CONFUSION_REVERSE[v] = k


class UrduSpellChecker:
    """Production-grade Urdu spell checker using dictionary + Levenshtein distance.

    Three correction modes:
    - "char":      Character-level confusion map only (fastest, least accurate)
    - "distance":  Dictionary lookup with Levenshtein edit distance (balanced)
    - "hybrid":    Confusion map + dictionary distance + n-gram context (best quality)
    """

    def __init__(
        self,
        dict_dir: Optional[str] = None,
        max_distance: int = 2,
        use_word_freq: bool = True,
        ngram_order: int = 2,
    ):
        """Initialize spell checker.

        Args:
            dict_dir: Path to urdu-dict directory (auto-detected if not provided).
            max_distance: Maximum Levenshtein distance for candidate search.
            use_word_freq: Weight corrections by word frequency (requires UrduHack or heuristic).
            ngram_order: N-gram order for context scoring (1=disabled, 2=bigram, 3=trigram).
        """
        self.max_distance = max_distance
        self.use_word_freq = use_word_freq
        self.ngram_order = ngram_order

        # Load dictionary
        dict_dir_path = None
        if dict_dir:
            from pathlib import Path as _P
            dict_str = str(dict_dir)
            if len(dict_str) > 0:
                dict_dir_path = _P(dict_str)
        else:
            pass

        self._dict = load_urdu_dictionary(dict_dir_path)
        self._all_words = self._dict["all_words"]
        self._word_freq = self._dict["word_freq"]

        # Build fast lookup index by first N characters for candidate generation
        self._build_index()

        # Try UrduHack integration (optional dependency)
        self._urduhack_available = False
        try:
            import urduhack  # noqa: F401, E402
            from urduhack.spell import correction as _uh_corr  # noqa: F401, E402
            self._urduhack_available = True
        except ImportError:
            pass

    def _build_index(self) -> None:
        """Build a prefix index for fast candidate generation."""
        # Index words by their first character and first+second character
        self._prefix_index: dict[str, set[str]] = {}
        for word in self._all_words:
            if len(word) >= 1:
                key1 = word[0]
                if key1 not in self._prefix_index:
                    self._prefix_index[key1] = set()
                self._prefix_index[key1].add(word)

            if len(word) >= 2:
                key2 = word[:2]
                if key2 not in self._prefix_index:
                    self._prefix_index[key2] = set()
                self._prefix_index[key2].add(word)

    def correct(
        self,
        text: str,
        mode: str = "hybrid",
    ) -> tuple[str, dict]:
        """Correct Urdu text.

        Args:
            text: Input text to correct.
            mode: "char" | "distance" | "hybrid"

        Returns:
            (corrected_text, correction_stats)
        """
        if not text or not text.strip():
            return text, {"applied": 0, "characters": [], "words": []}

        if mode == "char":
            return self._correct_char_level(text)
        elif mode == "distance":
            return self._correct_distance(text)
        elif mode == "hybrid":
            return self._correct_hybrid(text)
        else:
            return text, {}

    def _correct_char_level(self, text: str) -> tuple[str, dict]:
        """Character-level correction using only the confusion map."""
        corrections = {"applied": 0, "characters": [], "words": []}
        result_chars = list(text)

        for i, ch in enumerate(result_chars):
            if ch in CHAR_CONFUSIONS:
                corrected = CHAR_CONFUSIONS[ch]
                result_chars[i] = corrected
                corrections["applied"] += 1
                corrections["characters"].append({
                    "from": ch,
                    "to": corrected,
                    "pos": i,
                    "reason": "char_confusion",
                })

        corrected_text = "".join(result_chars)
        return corrected_text, corrections

    def _correct_distance(self, text: str) -> tuple[str, dict]:
        """Dictionary-based correction using Levenshtein distance."""
        corrections = {"applied": 0, "characters": [], "words": []}
        words_with_spaces = self._split_preserve_spaces(text)

        for i, word in enumerate(words_with_spaces):
            if len(word) < 2:
                continue
            corrected_word, is_new_correction = self._correct_single_word(word)
            if is_new_correction:
                corrections["applied"] += 1
                corrections["words"].append({
                    "from": word,
                    "to": corrected_word,
                    "pos": i,
                    "reason": "levenshtein_distance",
                })
                words_with_spaces[i] = corrected_word

        return "".join(words_with_spaces), corrections

    def _correct_hybrid(self, text: str) -> tuple[str, dict]:
        """Hybrid correction: character confusion + Levenshtein + n-gram scoring."""
        corrections = {"applied": 0, "characters": [], "words": []}

        # Step 1: Apply character-level confusion first (often catches the most common OCR errors)
        confus_text, char_corrections = self._correct_char_level(text)
        if char_corrections["applied"] > 0:
            corrections["applied"] += char_corrections["applied"]
            corrections["characters"].extend(char_corrections["characters"])

        # Step 2: Dictionary-based correction on the confusion-corrected text
        distance_text, dist_corrections = self._correct_distance(confus_text)
        if dist_corrections["applied"] > 0:
            corrections["applied"] += dist_corrections["applied"]
            corrections["words"].extend(dist_corrections["words"])

        # Step 3: N-gram context scoring for multi-word phrases
        if self.ngram_order >= 2:
            context_text, ctx_corrections = self._correct_context_aware(distance_text)
            if ctx_corrections["applied"] > 0:
                corrections["applied"] += ctx_corrections["applied"]
                corrections["words"].extend(ctx_corrections["words"])
                return context_text, corrections

        # Final pass: apply UrduHack spelling if available (only for "hybrid" mode)
        if self._urduhack_available and self.ngram_order >= 2:
            uhack_text, uhack_corrections = self._correct_urduhack(distance_text)
            if uhack_corrections["applied"] > corrections["applied"]:
                return uhack_text, uhack_corrections

        return distance_text, corrections

    def _correct_context_aware(self, text: str) -> tuple[str, dict]:
        """N-gram based context correction for multi-word sequences."""
        corrections = {"applied": 0, "words": []}
        words_with_spaces = self._split_preserve_spaces(text)

        # Filter to only the words we can check (non-whitespace, length >= 2)
        word_indices = [i for i, w in enumerate(words_with_spaces) if len(w) >= 2]

        for idx in word_indices:
            word = words_with_spaces[idx]

            # Get candidate corrections with scores
            candidates = self._get_candidates(word)
            if not candidates:
                continue

            best_word, best_score = candidates[0]  # Already sorted by score desc

            if best_score > 0 and best_word != word:
                # Verify context: check if the candidate improves n-gram scores
                prev_words = words_with_spaces[max(0, idx - self.ngram_order):idx]
                next_idx = idx + 1
                while next_idx < len(words_with_spaces) and len(words_with_spaces[next_idx]) < 2:
                    next_idx += 1
                next_word = words_with_spaces[next_idx] if next_idx < len(words_with_spaces) else ""

                # Score current vs candidate with surrounding context
                current_score = self._ngram_score(prev_words, word, next_word)
                candidate_score = self._ngram_score(prev_words, best_word, next_word)

                if candidate_score > current_score + 0.1:  # Threshold for switching
                    corrections["applied"] += 1
                    corrections["words"].append({
                        "from": word,
                        "to": best_word,
                        "pos": idx,
                        "reason": "ngram_context",
                        "score_diff": round(candidate_score - current_score, 4),
                    })
                    words_with_spaces[idx] = best_word

        return "".join(words_with_spaces), corrections

    def _correct_urduhack(self, text: str) -> tuple[str, dict]:
        """Use UrduHack spell checker if available."""
        try:
            import urduhack.spell  # type: ignore

            corrections = {"applied": 0, "words": []}
            corrected_words = []

            words_with_spaces = self._split_preserve_spaces(text)

            for i, word in enumerate(words_with_spaces):
                if len(word) < 2:
                    corrected_words.append(word)
                    continue

                try:
                    correction = urduhack.spell.correction(word)  # type: ignore
                    if correction and correction != word:
                        corrections["applied"] += 1
                        corrections["words"].append({
                            "from": word,
                            "to": correction,
                            "pos": i,
                            "reason": "urduhack_spell",
                        })
                        corrected_words.append(correction)
                    else:
                        corrected_words.append(word)
                except Exception:
                    corrected_words.append(word)

            return "".join(corrected_words), corrections
        except ImportError:
            return text, {"applied": 0, "words": []}

    # ── Levenshtein Distance ──────────────────────────────────────

    def _levenshtein_distance(self, s1: str, s2: str) -> int:
        """Compute Levenshtein (edit) distance between two strings."""
        if len(s1) < len(s2):
            return self._levenshtein_distance(s2, s1)

        if len(s2) == 0:
            return len(s1)

        # Use Wagner-Fischer algorithm with optimized space
        prev_row = list(range(len(s2) + 1))

        for i, c1 in enumerate(s1):
            curr_row = [i + 1]
            for j, c2 in enumerate(s2):
                insertions = prev_row[j + 1] + 1
                deletions = curr_row[j] + 1
                substitutions = prev_row[j] + (c1 != c2)
                curr_row.append(min(insertions, deletions, substitutions))
            prev_row = curr_row

        return prev_row[-1]

    def _get_candidates(self, word: str) -> list[tuple[str, float]]:
        """Get candidate corrections sorted by score (frequency-weighted edit distance).

        Returns list of (candidate_word, score) tuples, sorted by score descending.
        Score = log(freq + 1) / (distance * max(len(word), len(candidate)) + 1)
        """
        candidates: list[tuple[str, float]] = []
        word_len = len(word)

        # Limit search space for performance
        if self.max_distance == 0:
            return candidates

        # Get candidate words by prefix matching
        prefix_candidates = set()
        for key in [word[:1], word[:min(2, word_len)], word[:min(3, word_len)]]:
            if key in self._prefix_index:
                prefix_candidates.update(self._prefix_index[key])

        # Also try character confusions on the input word to find more candidates
        confusion_variants = set()
        confusion_variants.add(word)
        for ch in word:
            if ch in _CONFUSION_REVERSE:
                alt_word = word.replace(ch, _CONFUSION_REVERSE[ch], 1)
                confusion_variants.add(alt_word)
                # Get candidates starting with confused character
                if len(alt_word) >= 1 and alt_word[0] in self._prefix_index:
                    prefix_candidates.update(self._prefix_index[alt_word[0]])

        # Score all candidates
        for candidate in prefix_candidates:
            if candidate == word:
                continue

            distance = self._levenshtein_distance(word, candidate)
            if distance <= 0 or distance > self.max_distance:
                continue

            # Get frequency
            freq = self._word_freq.get(candidate, 1) if self.use_word_freq else 1

            # Score: higher is better (frequent words with smaller distance score higher)
            candidate_len = len(candidate)
            max_len = max(word_len, candidate_len)
            score = math.log(freq + 1) / ((distance * max_len) + 1)

            candidates.append((candidate, score))

        # Sort by score descending
        candidates.sort(key=lambda x: x[1], reverse=True)
        return candidates[:20]  # Return top 20 candidates

    def _correct_single_word(self, word: str) -> tuple[str, bool]:
        """Correct a single word. Returns (corrected_word, was_corrected)."""
        # Check if already in dictionary
        if word in self._all_words:
            return word, False

        candidates = self._get_candidates(word)
        if not candidates:
            # If no candidates found, try applying confusion map first then look up
            confused_word = word
            for ch in word:
                if ch in CHAR_CONFUSIONS:
                    confused_word = confused_word.replace(ch, CHAR_CONFUSIONS[ch], 1)
            if confused_word != word and confused_word in self._all_words:
                return confused_word, True
            return word, False

        best_candidate, _ = candidates[0]

        # Verify candidate is actually a valid dictionary word
        if best_candidate not in self._all_words:
            return word, False

        # Only correct if distance is meaningful (skip same-word matches)
        if best_candidate == word:
            return word, False

        return best_candidate, True

    # ── N-gram Scoring ────────────────────────────────────────────

    def _ngram_score(self, prev_words: list[str], center_word: str, next_word: str) -> float:
        """Score a word within its context using unigram + bigram scores."""
        score = 0.0

        # Unigram score (word frequency)
        if self.use_word_freq and self._word_freq:
            freq = self._word_freq.get(center_word, 1)
            score += math.log(freq + 1)
        else:
            score += 1.0  # Default weight

        # Bigram scores (context dependency)
        if prev_words and center_word:
            bigram_key = f"{prev_words[-1]}_{center_word}"
            if bigram_key in self._all_words:
                score += 5.0  # Strong bonus for known bigram

        if next_word and center_word:
            bigram_key = f"{center_word}_{next_word}"
            if bigram_key in self._all_words:
                score += 5.0

        return score

    # ── Helpers ───────────────────────────────────────────────────

    @staticmethod
    def _split_preserve_spaces(text: str) -> list[str]:
        """Split text into words while preserving original whitespace."""
        import re
        return re.split(r'(\s+)', text)

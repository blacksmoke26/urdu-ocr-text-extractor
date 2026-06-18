# Urdu Auto-Correction Engine — Implementation Summary

## What Changed

### New Files Created

1. **`backend/v2/engine/spell_checker/__init__.py`**
   - Package entry point exposing `UrduSpellChecker` and `load_urdu_dictionary`

2. **`backend/v2/engine/spell_checker/loaders.py`**
   - Loads words from `urdu-dict/words.txt`, `bigram_words.txt`, `trigram_words.txt`
   - Expands compound words (e.g., `پاک_ستان`) into individual tokens (`پاک`, `ستان`)
   - Merges all word lists into a single vocabulary set (`all_words`)
   - Loads word frequencies from UrduHack if available, or falls back to heuristic scoring
   - Lazy-loaded and cached at startup

3. **`backend/v2/engine/spell_checker/checker.py`**
   - Core `UrduSpellChecker` class with three correction modes:
     - **"char"**: Character-level confusion map (fastest)
     - **"distance"**: Levenshtein edit distance + dictionary lookup (balanced)
     - **"hybrid"**: Confusion map + Levenshtein + n-gram context scoring (best quality)
   - Prefix-indexed candidate generation for fast dictionary lookups
   - Frequency-weighted scoring: `score = log(freq + 1) / (distance * max_len + 1)`
   - N-gram bigram/trigram scoring using word combinations from the dictionary
   - Optional UrduHack integration (falls back gracefully if not installed)

4. **`backend/v2/engine/spell_checker/urduhack_integration.py`**
   - Optional `UrduHackSpellProvider` wrapper for advanced UrduHack features
   - Word frequency loading, spelling correction, morphological analysis

5. **`backend/v2/routes/spell_check.py`**
   - New API endpoints:
     - `POST /api/v2/spell/check` — Standalone spell check endpoint
     - `GET /api/v2/spell/info` — Spell checker configuration and dictionary stats

### Files Modified

1. **`backend/v2/engine/text_cleaner.py`**
   - Replaced the old static `URDU_WORD_DICT` (which mapped words to themselves) with a real spell checker engine
   - New `autocorrect_dict()` method delegates to Levenshtein-based dictionary lookup
   - New `autocorrect_context()` method uses full hybrid mode
   - Lazy-loaded spell checker singleton (`_ensure_spell_checker`)
   - New default correction mode: `"hybrid"` (was `"char"`)

2. **`backend/v2/config.py`**
   - Added new env vars:
     - `URDUTEXT_AUTOCORRECT_MODE` — default changed from `"char"` to `"hybrid"`
     - `SPELL_CHECK_MAX_DISTANCE` — max Levenshtein distance (default: 2)
     - `SPELL_CHECK_USE_WORD_FREQ` — enable frequency-weighted scoring (default: true)
     - `SPELL_CHECK_DICT_DIR` — custom dictionary path

3. **`backend/v2/services/ocr_service.py`**
   - Passes spell check config options (`max_distance`, `use_word_freq`) through text_cleaning dict
   - Re-initializes spell checker on per-request settings change

4. **`backend/v2/routes/ocr.py`**
   - Updated default `autocorrect_mode` from `"char"` to `"hybrid"` in both endpoints
   - Passes spell check config options with the text_cleaning dict

5. **`backend/v2/routes/system.py`**
   - Added autocorrect and spell check settings to `/config` response

6. **`backend/v2/main.py`**
   - Registered new `spell_router`

7. **`backend/v2/routes/__init__.py`**
   - Exported `spell_router`

8. **`backend/v2/config.example.env`**
   - Added spell check configuration section

## How It Works

### Correction Pipeline (hybrid mode)

```
Input Text
    │
    ▼
Step 1: Character Confusion Map
   ب/ت/ث, ک/گ, چ/ج, ی/ئ, etc.
    │
    ▼
Step 2: Levenshtein Dictionary Lookup
   Prefix-indexed search → top 20 candidates scored by:
   score = log(freq + 1) / (distance * max_word_len + 1)
    │
    ▼
Step 3: N-gram Context Scoring
   bigram/trigram bonuses from urdu-dict compound words
    │
    ▼
Step 4 (optional): UrduHack Spelling Correction
   Falls back gracefully if not installed
    │
    ▼
Corrected Output + Stats
```

### Key Improvements Over Old System

| Aspect | Old (`text_cleaner.py`) | New (spell_checker/) |
|--------|------------------------|---------------------|
| Dictionary size | ~20 words (self-mapping) | ~thousands of words from urdu-dict/words.txt + bigrams + trigrams |
| Correction method | Static word→word map | Levenshtein distance with candidate generation |
| Scoring | None | Frequency-weighted scoring |
| Context awareness | None | N-gram bigram/trigram scoring |
| UrduHack integration | None | Optional, seamless integration |
| Modes | `char`, `context` | `char`, `distance`, `hybrid` |
| Performance | O(n) lookup | Prefix-indexed + limited distance search |

## Usage Examples

### Via API (POST /api/v2/spell/check)
```json
{
  "text": "یہ ایک ٹیسٹ ہے",
  "mode": "hybrid"
}
```

### In Code
```python
from engine.spell_checker import UrduSpellChecker

checker = UrduSpellChecker(max_distance=2, use_word_freq=True, ngram_order=2)
corrected, stats = checker.correct("ہی یہ وجہ ہے", mode="hybrid")
print(corrected)  # "یہ یہ وجہ ہے" (with typo corrected)
print(stats)      # {"applied": 1, "words": [...]}
```

### Via OCR Pipeline
Enable in `.env`:
```bash
URDUTEXT_AUTOCORRECT_ENABLED=true
URDUTEXT_AUTOCORRECT_MODE=hybrid
SPELL_CHECK_MAX_DISTANCE=2
```

Or per-request via `text_cleaning` JSON:
```json
{
  "autocorrect": true,
  "autocorrect_mode": "hybrid",
  "max_distance": 2,
  "use_word_freq": true
}
```

### Optional UrduHack Integration
```bash
pip install urduhack
```

When `urduhack` is installed, the spell checker automatically uses its word frequencies and spelling correction capabilities as a final pass in hybrid mode.

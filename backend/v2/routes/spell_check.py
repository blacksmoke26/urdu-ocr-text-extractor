"""Enhanced Spell check API route for standalone Urdu text correction (v4).

New v4 endpoints:
- POST /api/v2/spell/analyze       — analyze text for errors without auto-correcting
- POST /api/v2/spell/suggest       — get N correction candidates per word  
- POST /api/v2/spell/batch         — batch correct multiple texts
- POST /api/v2/spell/romanize      — approximate Roman (Latin) transcription
- POST /api/v2/spell/user-dict/add — add word to user dictionary (always valid)
- POST /api/v2/spell/user-dict/remove — remove word from user dictionary
- GET  /api/v2/spell/analytics     — detailed spell-checking session stats
"""

from __future__ import annotations

import os

from fastapi import APIRouter, Body, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel


class AnalyzeRequest(BaseModel):
    text: str


class SuggestRequest(BaseModel):
    text: str
    n: int = 3


class BatchRequest(BaseModel):
    texts: list[str]
    mode: str = "hybrid"
    diff_mode: bool = False


class DictWordRequest(BaseModel):
    word: str


spell_router = APIRouter(prefix="/api/v2", tags=["Spell Check"])


# ── Existing Endpoints ───────────────────────────────────────────────

@spell_router.post(
    "/spell/check",
    summary="Spell check Urdu text (enhanced)",
    description=(
        "Check and auto-correct Urdu text using an enhanced multi-strategy engine. "
        "Supports character confusion, Levenshtein distance, phonetic matching, compound word decomposition, "
        "n-gram context scoring, and UrduHack integration."
    ),
)
async def spell_check_endpoint(
    text: str = Body(..., description="Urdu text to correct"),
    mode: str = Body("hybrid", description='Correction mode: char, distance, hybrid, or aggressive'),
    confidence_threshold: float | None = Body(None, ge=0.0, le=1.0, description="Minimum correction score (0.0-1.0). Overrides env default."),
    sentence_aware: bool = Body(True, description="Split by sentences before correcting"),
    protect_english: bool = Body(True, description="Skip English words and protected content (URLs, emails)"),
    phonetic_enabled: bool = Body(True, description="Enable sound-alike character corrections"),
    compound_decomposition: bool = Body(True, description="Decompose compound/misjoined words"),
):
    """Enhanced standalone spell check endpoint."""
    if mode not in ("char", "distance", "hybrid", "aggressive"):
        return JSONResponse(
            status_code=400,
            content={"detail": f"Invalid mode '{mode}'. Use 'char', 'distance', 'hybrid', or 'aggressive'."},
        )

    try:
        from engine.text_cleaner import TextCleaner
        TextCleaner._spell_checker = None
        corrected, stats = TextCleaner.clean_and_autocorrect(text, mode=mode)

        corrections_list = []
        for w in stats.get("words", []):
            clean_w = {k: v for k, v in w.items() if k not in ("score_diff",)}
            corrections_list.append(clean_w)

        return JSONResponse({
            "original": text,
            "corrected": corrected,
            "corrections_applied": stats.get("applied", 0),
            "mode": mode,
            "sentences_processed": stats.get("sentences_processed", 0),
            "characters_corrected": stats.get("characters", []),
            "words_corrected": corrections_list,
        })
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"detail": f"Spell check failed: {str(e)}"},
        )


@spell_router.get(
    "/spell/info",
    summary="Get spell checker info",
    description="Get information about the loaded spell checker (dictionary size, config, etc.).",
)
async def spell_check_info():
    """Return spell checker configuration and dictionary stats."""
    from engine.spell_checker.loaders import get_dictionary

    dic = get_dictionary()
    word_count = len(dic.get("words", set()))
    bigram_count = len(dic.get("bigrams", set()))
    trigram_count = len(dic.get("trigrams", set()))
    total_unique = len(dic.get("all_words", set()))

    return JSONResponse({
        "spell_checker": {
            "enabled": os.environ.get("URDUTEXT_AUTOCORRECT_ENABLED", "true").lower() == "true",
            "mode": os.environ.get("URDUTEXT_AUTOCORRECT_MODE", "hybrid"),
            "max_distance": int(os.environ.get("SPELL_CHECK_MAX_DISTANCE", "3")),
            "use_word_freq": os.environ.get("SPELL_CHECK_USE_WORD_FREQ", "true").lower() == "true",
            "confidence_threshold": float(os.environ.get("SPELL_CHECK_CONFIDENCE_THRESHOLD", "0.35")),
            "sentence_aware": os.environ.get("SPELL_CHECK_SENTENCE_AWARE", "true").lower() == "true",
            "protect_english": os.environ.get("SPELL_CHECK_PROTECT_ENGLISH", "true").lower() == "true",
            "phonetic_enabled": os.environ.get("SPELL_CHECK_PHONETIC_ENABLED", "true").lower() == "true",
            "compound_decomposition": os.environ.get("SPELL_CHECK_COMPOUND_DECOMPOSITION", "true").lower() == "true",
            "urduhack_final_pass": os.environ.get("SPELL_CHECK_URDUHACK_FINAL_PASS", "true").lower() == "true",
        },
        "dictionary": {
            "words_count": word_count,
            "bigrams_count": bigram_count,
            "trigrams_count": trigram_count,
            "total_unique_tokens": total_unique,
        },
    })


# ── v4 New Endpoints ───────────────────────────────────────────────

@spell_router.post(
    "/spell/analyze",
    summary="Analyze Urdu text for errors (no auto-correction)",
    description=(
        "Analyze Urdu text and return structured error information with suggestions. "
        "Useful for UI highlighting — does NOT auto-correct the text."
    ),
)
async def spell_analyze_endpoint(req: AnalyzeRequest):
    try:
        from engine.spell_checker.checker import UrduSpellChecker
        checker = UrduSpellChecker()
        analysis = checker.analyze_text(req.text)
        return JSONResponse({"analysis": analysis})
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": f"Analysis failed: {str(e)}"})


@spell_router.post(
    "/spell/suggest",
    summary="Get correction suggestions for words",
    description=(
        "Return top-N correction candidates for each word in the text. "
        "Useful for UI picking — lets users choose their preferred correction."
    ),
)
async def spell_suggest_endpoint(req: SuggestRequest):
    try:
        from engine.spell_checker.checker import UrduSpellChecker
        checker = UrduSpellChecker()
        words_with_spaces = checker._split_spaces(req.text)
        suggestions = []
        for token in words_with_spaces:
            if not token.strip():
                continue
            word_suggestions = checker.suggest_word(token.strip(), n=req.n)
            if word_suggestions:
                suggestions.append({"word": token.strip(), "suggestions": word_suggestions})
        return JSONResponse({"suggestions": suggestions, "total_words_with_errors": len(suggestions)})
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": f"Suggestion failed: {str(e)}"})


@spell_router.post(
    "/spell/batch",
    summary="Batch correct multiple texts",
    description=(
        "Process multiple Urdu texts and return aggregated correction results. "
        "Each text is corrected independently; aggregate stats are provided at the top level."
    ),
)
async def spell_batch_endpoint(req: BatchRequest):
    try:
        from engine.spell_checker.checker import UrduSpellChecker
        checker = UrduSpellChecker()
        result = checker.batch_correct(req.texts, mode=req.mode, diff_mode=req.diff_mode)
        return JSONResponse(result)
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": f"Batch processing failed: {str(e)}"})


@spell_router.post(
    "/spell/romanize",
    summary="Roman transcription of Urdu text",
    description="Return approximate Roman (Latin) transcription of the input Urdu text.",
)
async def spell_romanize_endpoint(req: AnalyzeRequest):
    try:
        from engine.spell_checker.checker import UrduSpellChecker
        checker = UrduSpellChecker()
        result = checker.romanize(req.text)
        return JSONResponse({"original": req.text, "romanized": result})
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": f"Romanization failed: {str(e)}"})


@spell_router.post(
    "/spell/user-dict/add",
    summary="Add word to user dictionary",
    description="Add a word that should always be considered valid (never corrected).",
)
async def spell_add_user_word(req: DictWordRequest):
    try:
        from engine.spell_checker.checker import UrduSpellChecker
        checker = UrduSpellChecker()
        checker.add_user_word(req.word)
        return JSONResponse({"added": req.word, "user_dict_size": len(checker.get_user_dict())})
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": f"Adding user word failed: {str(e)}"})


@spell_router.post(
    "/spell/user-dict/remove",
    summary="Remove word from user dictionary",
    description="Remove a previously added word from the user dictionary.",
)
async def spell_remove_user_word(req: DictWordRequest):
    try:
        from engine.spell_checker.checker import UrduSpellChecker
        checker = UrduSpellChecker()
        result = checker.remove_user_word(req.word)
        return JSONResponse({
            "removed": req.word,
            "success": result,
            "user_dict_size": len(checker.get_user_dict()),
        })
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": f"Removing user word failed: {str(e)}"})


@spell_router.get(
    "/spell/analytics",
    summary="Get spell checker analytics for text",
    description=(
        "Return detailed statistics for a spell-checking session including correction rate, "
        "strategy usage, grammar flags, script detection, and confidence distribution."
    ),
)
async def spell_analytics_endpoint(
    text: str | None = Query(None, description="Urdu text to analyze"),
    mode: str = Query("hybrid", description='Correction mode'),
):
    try:
        from engine.spell_checker.checker import UrduSpellChecker
        checker = UrduSpellChecker()
        if not text:
            return JSONResponse({
                "message": "Provide 'text' query parameter for analytics.",
                "config": {
                    "style": os.environ.get("SPELL_CHECK_STYLE", "default"),
                    "user_dict": os.environ.get("SPELL_CHECK_USER_DICT", "")[:200],
                    "confidence_threshold": float(os.environ.get("SPELL_CHECK_CONFIDENCE_THRESHOLD", "0.35")),
                },
            })
        analytics = checker.get_analytics(text, mode=mode)
        return JSONResponse(analytics)
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": f"Analytics failed: {str(e)}"})

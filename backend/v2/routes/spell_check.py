"""Spell check API route for standalone Urdu text correction."""

from __future__ import annotations

import os
from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

spell_router = APIRouter(prefix="/api/v2", tags=["Spell Check"])


class SpellCheckRequest(BaseModel):
    """Request body for spell check endpoint."""
    text: str = Field(..., description="Urdu text to correct")
    mode: str = Field("hybrid", description='Correction mode: char, distance, or hybrid')


@spell_router.post(
    "/spell/check",
    summary="Spell check Urdu text",
    description="Check and auto-correct Urdu text using the spell checker engine.",
)
async def spell_check_endpoint(request: SpellCheckRequest = Body(default_factory=SpellCheckRequest)):
    """Standalone spell check endpoint.

    Args:
        request: Spell check request with text and mode.
    """
    text = request.text
    mode = request.mode
    if mode not in ("char", "distance", "hybrid"):
        return JSONResponse(
            status_code=400,
            content={"detail": f"Invalid mode '{mode}'. Use 'char', 'distance', or 'hybrid'."},
        )

    try:
        from engine.text_cleaner import TextCleaner
        TextCleaner._spell_checker = None  # force fresh init
        corrected, stats = TextCleaner.clean_and_autocorrect(text, mode=mode)

        return JSONResponse({
            "original": text,
            "corrected": corrected,
            "corrections_applied": stats.get("applied", 0),
            "mode": mode,
            "characters_corrected": stats.get("characters", []),
            "words_corrected": [
                {k: v for k, v in w.items() if k != "score_diff"}
                for w in stats.get("words", [])
            ],
        })
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"detail": f"Spell check failed: {str(e)}"},
        )


@spell_router.get(
    "/spell/info",
    summary="Get spell checker info",
    description="Get information about the loaded spell checker (dictionary size, mode, etc.).",
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
            "enabled": os.environ.get("URDUTEXT_AUTOCORRECT_ENABLED", "false").lower() == "true",
            "mode": os.environ.get("URDUTEXT_AUTOCORRECT_MODE", "hybrid"),
            "max_distance": int(os.environ.get("SPELL_CHECK_MAX_DISTANCE", "2")),
            "use_word_freq": os.environ.get("SPELL_CHECK_USE_WORD_FREQ", "true").lower() == "true",
        },
        "dictionary": {
            "words_count": word_count,
            "bigrams_count": bigram_count,
            "trigrams_count": trigram_count,
            "total_unique_tokens": total_unique,
        },
    })

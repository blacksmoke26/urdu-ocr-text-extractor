"""In-memory result cache with TTL for OCR results."""

from __future__ import annotations

import hashlib
import time
from pathlib import Path
from typing import Optional


class _CacheEntry:
    __slots__ = ("data", "expires_at")

    def __init__(self, data: dict, ttl: int):
        self.data = data
        self.expires_at = time.time() + ttl


class ResultCache:
    """Thread-safe in-memory cache with TTL. Persists to disk optionally."""

    def __init__(self, enabled: bool = True, ttl_seconds: int = 3600, cache_dir: Optional[Path] = None):
        self.enabled = enabled
        self.ttl = ttl_seconds
        self._cache: dict[str, _CacheEntry] = {}
        self._hits = 0
        self._misses = 0
        if cache_dir:
            cache_dir.mkdir(parents=True, exist_ok=True)
            self.cache_dir = cache_dir
        else:
            from config import CACHE_DIR
            self.cache_dir = CACHE_DIR

    def _key(self, filename: str, conf_threshold: float, img_size: int, clean: bool = False) -> str:
        """Generate a deterministic cache key."""
        raw = f"{filename}|{conf_threshold:.2f}|{img_size}|clean={clean}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    def get(self, filename: str, conf_threshold: float, img_size: int, clean: bool = False) -> Optional[dict]:
        key = self._key(filename, conf_threshold, img_size, clean)

        # Check memory first
        entry = self._cache.get(key)
        if entry and time.time() < entry.expires_at:
            self._hits += 1
            return entry.data

        # Expire stale in-memory entry
        if entry:
            del self._cache[key]

        # Check disk persistence (optional optimization for large caches)
        cache_file = self.cache_dir / f"{key}.json"
        if cache_file.exists():
            import json
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    cached = json.load(f)
                self._hits += 1
                # Restore to memory
                self._cache[key] = _CacheEntry(cached, self.ttl)
                return cached
            except (json.JSONDecodeError, IOError):
                pass

        self._misses += 1
        return None

    def set(self, filename: str, conf_threshold: float, img_size: int, clean: bool = False, data: dict | None = None):
        if not self.enabled or data is None:
            return
        key = self._key(filename, conf_threshold, img_size, clean)

        self._cache[key] = _CacheEntry(data, self.ttl)

        # Also persist to disk for resilience
        import json
        cache_file = self.cache_dir / f"{key}.json"
        try:
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
        except IOError:
            pass

    def invalidate(self, filename: str, conf_threshold: float, img_size: int, clean: bool = False):
        key = self._key(filename, conf_threshold, img_size, clean)
        self._cache.pop(key, None)
        cache_file = self.cache_dir / f"{key}.json"
        if cache_file.exists():
            try:
                cache_file.unlink()
            except IOError:
                pass

    def clear(self):
        self._cache.clear()
        # Clean disk cache
        for f in self.cache_dir.glob("*.json"):
            try:
                f.unlink()
            except IOError:
                pass

    @property
    def stats(self) -> dict:
        total = self._hits + self._misses
        hit_rate = round(self._hits / total * 100, 1) if total > 0 else 0.0
        return {
            "enabled": self.enabled,
            "ttl_seconds": self.ttl,
            "entries": len(self._cache),
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate_pct": hit_rate,
        }

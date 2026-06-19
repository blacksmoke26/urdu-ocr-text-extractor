/**
 * Spell check API service — standalone Urdu text correction endpoint.
 */

import {postJson, get} from '../apiClient';
import type {
  SpellCheckResponse,
  SpellInfoResponse,
  AnalyzeResponse,
  SuggestResponse,
  BatchResponse,
  RomanizeResponse,
  AnalyticsResponse,
  UserDictResponse,
  UserDictListResponse,
} from '#/types/api';

/** Check and auto-correct Urdu text using the spell checker engine. */
export const spellCheck = (
  text: string,
  mode: 'char' | 'distance' | 'hybrid' = 'hybrid',
): Promise<SpellCheckResponse> =>
  postJson<SpellCheckResponse>('/spell/check', {text, mode});

/** Get spell checker configuration and dictionary stats. */
export const getSpellInfo = (): Promise<SpellInfoResponse> =>
  get<SpellInfoResponse>('/spell/info');

// ─── v4 Endpoints ───────────────────────────────────────────────

/** Analyze text for errors without auto-correcting. */
export const analyzeText = (text: string): Promise<AnalyzeResponse> =>
  postJson<AnalyzeResponse>('/spell/analyze', {text});

/** Get top-N word-level correction suggestions with confidence scores. */
export const suggestWord = (
  text: string,
  n: number = 3,
): Promise<SuggestResponse> =>
  postJson<SuggestResponse>('/spell/suggest', {text, n});

/** Correct multiple texts in a single request. */
export const batchCorrect = (texts: string[]): Promise<BatchResponse> =>
  postJson<BatchResponse>('/spell/batch', {texts});

/** Approximate Urdu-to-Latin transcription. */
export const romanizeText = (text: string): Promise<RomanizeResponse> =>
  postJson<RomanizeResponse>('/spell/romanize', {text});

/** Get session analytics with correction rate and strategy usage. */
export const getSpellAnalytics = (): Promise<AnalyticsResponse> =>
  get<AnalyticsResponse>('/spell/analytics');

/** Add a word to the user's custom dictionary. */
export const addUserDictWord = (word: string): Promise<UserDictResponse> =>
  postJson<UserDictResponse>('/spell/user-dict/add', {word});

/** Remove a word from the user's custom dictionary. */
export const removeUserDictWord = (word: string): Promise<UserDictResponse> =>
  postJson<UserDictResponse>('/spell/user-dict/remove', {word});

/** List all words in the user's custom dictionary. */
export const getUserDict = (): Promise<UserDictListResponse> =>
  get<UserDictListResponse>('/spell/user-dict');

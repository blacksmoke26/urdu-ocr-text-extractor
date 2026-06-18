/**
 * Spell check API service — standalone Urdu text correction endpoint.
 */

import { postJson, get } from '../apiClient';
import type { SpellCheckResponse, SpellInfoResponse } from '#/types/api';

/** Check and auto-correct Urdu text using the spell checker engine. */
export const spellCheck = (
  text: string,
  mode: 'char' | 'distance' | 'hybrid' = 'hybrid',
): Promise<SpellCheckResponse> =>
  postJson<SpellCheckResponse>('/spell/check', { text, mode });

/** Get spell checker configuration and dictionary stats. */
export const getSpellInfo = (): Promise<SpellInfoResponse> =>
  get<SpellInfoResponse>('/spell/info');

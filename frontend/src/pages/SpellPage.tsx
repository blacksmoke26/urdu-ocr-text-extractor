/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2025 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

import {useCallback, useEffect, useState} from 'react';
import {
  BookOpen,
  Copy,
  FileText,
  Info,
  Loader2,
  Sparkles,
  Target,
  Type,
  UserPlus,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  BarChart3,
  Languages,
  Wand2,
  ScanSearch,
} from 'lucide-react';
import {
  spellCheck,
  getSpellInfo,
  analyzeText,
  suggestWord,
  batchCorrect,
  romanizeText,
  getSpellAnalytics,
  addUserDictWord,
  removeUserDictWord,
  getUserDict,
} from '#/utils/api/spell';
import type {
  AnalyzeResponse,
  SuggestResponse,
  BatchResponse,
  RomanizeResponse,
  AnalyticsResponse,
  UserDictEntry,
  SpellError,
  Suggestion,
} from '#/types/api';
import {useToast} from '#/context/ToastContext';
import {useTheme} from '#/context/ThemeContext';

/* ─── Toast Helper (matches actual addToast API) ───── */

function useToastHelper() {
  const {addToast} = useToast();
  return {
    success: (msg: string) => addToast(msg, 'success'),
    error: (msg: string) => addToast(msg, 'error'),
  };
}

/* ─── Tabs ────────────────────────────────────────────── */

type TabKey = 'correct' | 'analyze' | 'suggest' | 'batch' | 'romanize' | 'dict' | 'analytics';

interface SpellTab {
  key: TabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: SpellTab[] = [
  {key: 'correct', label: 'Correct', icon: Wand2},
  {key: 'analyze', label: 'Analyze', icon: ScanSearch},
  {key: 'suggest', label: 'Suggest', icon: Sparkles},
  {key: 'batch', label: 'Batch', icon: FileText},
  {key: 'romanize', label: 'Romanize', icon: Languages},
  {key: 'dict', label: 'User Dict', icon: UserPlus},
  {key: 'analytics', label: 'Analytics', icon: BarChart3},
];

/* ─── Helpers ─────────────────────────────────────────── */

const CONF_COLORS = [
  [0.9, 'text-emerald-400', 'bg-emerald-500/10 border-emerald-500/20'],
  [0.7, 'text-blue-400', 'bg-blue-500/10 border-blue-500/20'],
  [0, 'text-amber-400', 'bg-amber-500/10 border-amber-500/20'],
] as const;

function confidenceStyle(c: number) {
  for (const [threshold, cls] of CONF_COLORS) if (c >= threshold) return cls;
  return CONF_COLORS[2][1];
}

function confidenceBg(c: number) {
  for (const [threshold, _, bg] of CONF_COLORS) if (c >= threshold) return bg;
  return CONF_COLORS[2][2];
}

/* ─── Main Page ──────────────────────────────────────── */

function SpellPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [activeTab, setActiveTab] = useState<TabKey>('correct');
  const [spellInfo, setSpellInfo] = useState<any>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);

  useEffect(() => {
    getSpellInfo().then(setSpellInfo).catch(() => {
    });
    setTimeout(() => setLoadingInfo(false), 400);
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-2xl border border-violet-500/10 bg-gradient-to-br from-violet-500/5 via-transparent to-purple-500/5 px-6 py-8 sm:px-10 sm:py-10">
        <div className="flex items-center gap-4 mb-3">
          <div
            className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/30 ring-1 ring-white/10">
            <BookOpen className="h-6 w-6 text-white"/>
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight mb-0.5">Urdu Spell Checker</h2>
            <p className="text-sm text-slate-400">
              v4
              · {loadingInfo ? 'loading…' : spellInfo?.dictionary?.total_unique_tokens ? `${spellInfo.dictionary.total_unique_tokens.toLocaleString()} tokens loaded` : 'engine ready'}
            </p>
          </div>
        </div>
      </div>

      {/* Tab Nav */}
      <div className="flex gap-1 px-1 overflow-x-auto border-b border-slate-800/40">
        {TABS.map(({key, label, icon: Icon}) => {
          const active = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                active
                  ? 'border-violet-500 text-violet-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon className="h-4 w-4"/>
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="pb-8">
        {activeTab === 'correct' && <CorrectTab/>}
        {activeTab === 'analyze' && <AnalyzeTab/>}
        {activeTab === 'suggest' && <SuggestTab/>}
        {activeTab === 'batch' && <BatchTab/>}
        {activeTab === 'romanize' && <RomanizeTab/>}
        {activeTab === 'dict' && <DictTab/>}
        {activeTab === 'analytics' && <AnalyticsTab/>}
      </div>
    </div>
  );
}

/* ─── Correct Tab ─────────────────────────────────────── */

function CorrectTab() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const {success, error} = useToastHelper();

  const handleCorrect = useCallback(async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const res = await spellCheck(text.trim());
      setResult(res);
      success('Text corrected successfully');
    } catch (e: any) {
      error(e.message || 'Spell check failed');
    } finally {
      setLoading(false);
    }
  }, [text, success, error]);

  return (
    <div className="space-y-6">
      <TextInput text={text} setText={setText} onRun={handleCorrect} loading={loading}/>

      {result && (
        <div className="space-y-4">
          <ResultCard label="Original" value={result.original} icon={Type}/>
          <ResultCard label="Corrected" value={result.corrected} icon={CheckCircle2} highlight/>

          {result.corrections_applied > 0 && (
            <div className="rounded-2xl p-5 border bg-white/[0.03] border-slate-800/40">
              <h4 className="text-xs font-semibold uppercase tracking-wider mb-3 text-slate-400">
                Corrections Applied ({result.corrections_applied})
              </h4>

              {result.characters_corrected?.length > 0 && (
                <div className="mb-3">
                  <p
                    className="text-[10px] uppercase tracking-wider font-medium mb-2 text-slate-500">Character-level</p>
                  {result.characters_corrected.map((c: any, i: number) => (
                    <CorrectionTag key={i} from={c.from} to={c.to}/>
                  ))}
                </div>
              )}

              {result.words_corrected?.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-medium mb-2 text-slate-500">Word-level</p>
                  {result.words_corrected.map((c: any, i: number) => (
                    <CorrectionTag key={i} from={c.from} to={c.to}/>
                  ))}
                </div>
              )}
            </div>
          )}

          {!result.corrections_applied && result.corrected === result.original && (
            <div className="rounded-2xl p-5 border flex items-center gap-3 bg-emerald-500/5 border-emerald-500/10">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0"/>
              <span className="text-sm text-emerald-300">No spelling errors found! Your text is correct.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CorrectionTag({from, to}: { from: string; to: string }) {
  return (
    <span className="inline-flex items-center gap-2 mr-2 mb-2 text-sm">
      <span className="line-through opacity-50">{from}</span>
      <span className="text-emerald-400 font-medium">→</span>
      <span className="font-semibold text-emerald-400">{to}</span>
    </span>
  );
}

/* ─── Analyze Tab ─────────────────────────────────────── */

function AnalyzeTab() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const {success, error} = useToastHelper();

  const handleAnalyze = useCallback(async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const res = await analyzeText(text.trim());
      console.log('[analyze] API response:', JSON.stringify(res, null, 2));
      setResult(res);
      const analysis = (res as any).analysis ?? res;
      success(`Found ${analysis.total_words || analysis.error_count} word(s)`);
    } catch (e: any) {
      error(e.message || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }, [text, success, error]);

  return (
    <div className="space-y-6">
      <TextInput text={text} setText={setText} onRun={handleAnalyze} loading={loading}/>

      {result && (() => {
        const a = (result as any).analysis ?? result;

        // Extract with fallbacks for every possible key name
        const script = a.script || a.detected_script || 'unknown';
        const errorCount = Number(a.error_count) || Number(a.total_errors) || 0;
        const totalWords = Number(a.total_words) || 0;
        const validCount = Number(a.valid_count) || totalWords;
        const errorsArr = Array.isArray(a.errors) ? a.errors : [];
        const validWordsArr = Array.isArray(a.valid_words) ? a.valid_words : [];

        return (
          <div className="space-y-4">
            {/* Script info */}
            <div className="rounded-2xl p-5 border flex items-center gap-3 bg-white/[0.03] border-slate-800/40">
              <Info className="h-5 w-5 text-violet-400 shrink-0"/>
              <div>
                <p className="text-sm font-medium text-slate-400">Detected Script</p>
                <p className="text-lg font-bold text-white capitalize">{script}</p>
              </div>
            </div>

            {/* Error count */}
            <div className="rounded-2xl p-5 border bg-white/[0.03] border-slate-800/40">
              <div className="flex items-center gap-3">
                {errorCount > 0 ? (
                  <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0"/>
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0"/>
                )}
                <div>
                  <p className="text-sm font-medium text-slate-400">Errors Found</p>
                  <p className="text-2xl font-bold text-white">{errorCount}</p>
                </div>
              </div>
            </div>

            {/* Valid/total words */}
            {totalWords > 0 && (
              <div className="rounded-2xl p-5 border bg-white/[0.03] border-slate-800/40">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-violet-400 shrink-0"/>
                  <div>
                    <p className="text-sm font-medium text-slate-400">Words</p>
                    <p className="text-2xl font-bold text-white">{validCount}<span
                      className="text-sm font-normal text-slate-500 ml-2">/ {totalWords}</span></p>
                  </div>
                </div>
              </div>
            )}

            {/* Grammar flags */}
            {a.grammar_flags && Object.keys(a.grammar_flags).length > 0 && (
              <div className="rounded-2xl p-5 border bg-amber-500/5 border-amber-500/10">
                <h4 className="text-xs font-semibold uppercase tracking-wider mb-3 text-amber-300">Grammar Warnings</h4>
                {a.grammar_flags.missing_negation && (
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400"/>
                    <span className="text-sm text-amber-200">Possible missing negation detected</span>
                  </div>
                )}
                {a.grammar_flags.repetitive_words && (
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400"/>
                    <span className="text-sm text-amber-200">Repetitive words detected</span>
                  </div>
                )}
              </div>
            )}

            {/* Errors list */}
            {errorsArr.length > 0 && (
              <div className="rounded-2xl p-5 border bg-white/[0.03] border-slate-800/40">
                <h4 className="text-xs font-semibold uppercase tracking-wider mb-4 text-slate-400">Error Details</h4>
                <div className="space-y-3">
                  {errorsArr.map((err: SpellError, i: number) => (
                    <ErrorCard key={i} error={err}/>
                  ))}
                </div>
              </div>
            )}

            {/* Valid words list */}
            {validWordsArr.length > 0 && (
              <div className="rounded-2xl p-5 border bg-white/[0.03] border-slate-800/40">
                <h4 className="text-xs font-semibold uppercase tracking-wider mb-4 text-slate-400">Words Analyzed
                  ({validWordsArr.length})</h4>
                <div className="flex flex-wrap gap-2">
                  {validWordsArr.slice(0, 50).map((w: any, i: number) => (
                    <span key={i}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-sm font-medium"
                          dir="rtl">
                      {w.word || w}
                    </span>
                  ))}
                  {validWordsArr.length > 50 && (
                    <span
                      className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 text-sm">+{validWordsArr.length - 50} more</span>
                  )}
                </div>
              </div>
            )}

            {errorCount === 0 && (
              <div className="rounded-2xl p-5 border flex items-center gap-3 bg-emerald-500/5 border-emerald-500/10">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0"/>
                <span className="text-sm text-emerald-300">No errors detected in the text.</span>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function ErrorCard({error}: { error: SpellError }) {
  return (
    <div className="rounded-xl p-4 border bg-white/[0.02] border-slate-800/40">
      <div className="flex items-center gap-3 mb-2">
        <XCircle className="h-4 w-4 text-red-400 shrink-0"/>
        <span className="text-lg font-semibold text-red-400">{error.word}</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
          pos {error.position}
        </span>
        {error.confidence != null && (
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${confidenceBg(error.confidence)} ${confidenceStyle(error.confidence)}`}>
            {(error.confidence * 100).toFixed(0)}%
          </span>
        )}
      </div>
      {error.suggestions.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wider font-medium mb-1 text-slate-500">Suggestions</p>
          <div className="flex flex-wrap gap-2">
            {error.suggestions.map((s, j) => (
              <span key={j}
                    className="px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-sm font-medium">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Suggest Tab ─────────────────────────────────────── */

function SuggestTab() {
  const [text, setText] = useState('');
  const [n, setN] = useState(3);
  const [result, setResult] = useState<SuggestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const {success, error} = useToastHelper();

  const handleSuggest = useCallback(async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const res = await suggestWord(text.trim(), n);
      console.log('[suggest] API response:', JSON.stringify(res, null, 2));
      setResult(res);
    } catch (e: any) {
      error(e.message || 'Suggestion failed');
    } finally {
      setLoading(false);
    }
  }, [text, n, success, error]);

  return (
    <div className="space-y-6">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste or type Urdu text for word-level suggestions…"
        rows={4}
        dir="rtl"
        className="w-full rounded-xl border px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/50 bg-white/[0.03] border-slate-800/40 text-white placeholder:text-slate-600"
      />

      <div className="flex gap-3 items-center">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500">Top N:</label>
          <input
            type="number"
            min={1}
            max={10}
            value={n}
            onChange={(e) => setN(Number(e.target.value))}
            className="w-16 rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 bg-white/[0.03] border-slate-800/40 text-white"
          />
        </div>
        <button
          onClick={handleSuggest}
          disabled={!text.trim() || loading}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white text-sm font-medium shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Sparkles className="h-4 w-4"/>}
          Get Suggestions
        </button>
      </div>

      {result && (
        <div className="space-y-4">
          <ResultCard label="Original" value={result.original ?? result.text ?? '(no original field)'} icon={Type}/>
          <ResultCard label="Auto-Corrected" value={result.corrected ?? result.suggested ?? '(no corrected field)'}
                      icon={CheckCircle2} highlight/>

          {Object.keys(result.suggestions ?? {}).length > 0 && (
            <div className="rounded-2xl p-5 border bg-white/[0.03] border-slate-800/40">
              <h4 className="text-xs font-semibold uppercase tracking-wider mb-4 text-slate-400">Word-Level
                Suggestions</h4>
              <div className="space-y-3">
                {Object.entries(result.suggestions).map(([word, suggestions]: [string, Suggestion[]]) => (
                  <div key={word} className="rounded-xl p-4 border bg-white/[0.02] border-slate-800/40">
                    <p className="text-sm font-semibold text-violet-400 mb-2">{word}</p>
                    <div className="flex flex-wrap gap-2">
                      {suggestions.map((s: Suggestion, j: number) => (
                        <span key={j}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm ${confidenceBg(s.confidence)} ${confidenceStyle(s.confidence)}`}>
                          <span className="font-medium">{s.candidate}</span>
                          <span className="opacity-60 text-xs">({(s.confidence * 100).toFixed(0)}%)</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Batch Tab ───────────────────────────────────────── */

function BatchTab() {
  const [texts, setTexts] = useState(['', '', '']);
  const [result, setResult] = useState<BatchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const {success, error} = useToastHelper();

  const addText = useCallback(() => setTexts((t) => [...t, '']), []);
  const removeText = useCallback((idx: number) => setTexts((t) => t.filter((_, i) => i !== idx)), []);
  const updateText = useCallback((idx: number, val: string) => setTexts((t) => t.map((v, i) => (i === idx ? val : v))), []);

  const handleBatch = useCallback(async () => {
    const valid = texts.filter((t) => t.trim());
    if (!valid.length) return;
    setLoading(true);
    try {
      const res = await batchCorrect(valid);
      setResult(res);
      success(`Processed ${res.total_texts} texts`);
    } catch (e: any) {
      error(e.message || 'Batch correction failed');
    } finally {
      setLoading(false);
    }
  }, [texts, success, error]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-xs font-medium text-slate-500">Enter each text on a separate line:</p>
        {texts.map((t, i) => (
          <div key={i} className="flex gap-2">
            <span className="self-center text-xs font-mono text-slate-600">{i + 1}</span>
            <textarea
              value={t}
              onChange={(e) => updateText(i, e.target.value)}
              placeholder={`Text ${i + 1}…`}
              rows={3}
              dir="rtl"
              className="flex-1 rounded-xl border px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/50 bg-white/[0.03] border-slate-800/40 text-white placeholder:text-slate-600"
            />
            {texts.length > 1 && (
              <button onClick={() => removeText(i)} className="self-start p-2 text-red-400 hover:text-red-300"
                      title="Remove">
                <XCircle className="h-4 w-4"/>
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button onClick={addText}
                className="px-4 py-2.5 rounded-xl border text-sm font-medium transition-all border-slate-800/40 text-slate-400 hover:text-white">
          + Add Text
        </button>
        <button
          onClick={handleBatch}
          disabled={!texts.some((t) => t.trim()) || loading}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white text-sm font-medium shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin"/> : <FileText className="h-4 w-4"/>}
          Correct All
        </button>
      </div>

      {result && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-2xl p-5 border bg-white/[0.03] border-slate-800/40">
            <div className="grid grid-cols-3 gap-4">
              <StatBox label="Texts" value={result.total_texts} color="text-white"/>
              <StatBox label="Corrections" value={result.total_corrections} color="text-violet-400"/>
              <StatBox label="With Errors" value={result.texts_with_errors} color="text-amber-400"/>
            </div>
          </div>

          {/* Per-text results */}
          <div className="rounded-2xl p-5 border bg-white/[0.03] border-slate-800/40">
            <h4 className="text-xs font-semibold uppercase tracking-wider mb-4 text-slate-400">Results</h4>
            <div className="space-y-3">
              {result.results.map((r) => (
                <div key={r.index} className="rounded-xl p-4 border bg-white/[0.02] border-slate-800/40">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                      #{r.index + 1}
                    </span>
                    {r.has_errors ? (
                      <span className="text-xs text-red-400 font-medium">{r.corrections_applied} correction(s)</span>
                    ) : (
                      <span className="text-xs text-emerald-400 font-medium">✓ No errors</span>
                    )}
                  </div>
                  <p className="text-sm mb-1 text-slate-500" dir="rtl">{r.original}</p>
                  {r.corrected !== r.original && (
                    <p className="text-sm text-emerald-400 font-medium" dir="rtl">{r.corrected}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Romanize Tab ────────────────────────────────────── */

function RomanizeTab() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<RomanizeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const {success, error} = useToastHelper();

  const handleRomanize = useCallback(async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const res = await romanizeText(text.trim());
      console.log('[romanize] API response:', JSON.stringify(res, null, 2));
      setResult(res);
    } catch (e: any) {
      error(e.message || 'Romanization failed');
    } finally {
      setLoading(false);
    }
  }, [text, success, error]);

  return (
    <div className="space-y-6">
      <TextInput text={text} setText={setText} onRun={handleRomanize} loading={loading}/>

      {result && (
        <div className="space-y-4">
          {/* Full romanized */}
          <div className="rounded-2xl p-5 border bg-white/[0.03] border-slate-800/40">
            <p className="text-[10px] uppercase tracking-wider font-medium mb-2 text-slate-500">Full Romanization</p>
            <p className="text-xl font-semibold text-violet-400"
               dir="ltr">{result.romanized ?? result.full_transcription ?? '(no transcription)'}</p>
          </div>

          {/* Original */}
          <div className="rounded-2xl p-5 border bg-white/[0.03] border-slate-800/40">
            <p className="text-[10px] uppercase tracking-wider font-medium mb-2 text-slate-500">Original (Urdu)</p>
            <p className="text-base leading-relaxed text-slate-200" dir="rtl">{result.original ?? '(no original)'}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── User Dict Tab ───────────────────────────────────── */

function DictTab() {
  const [word, setWord] = useState('');
  const [words, setWords] = useState<UserDictEntry[]>([]);
  const [adding, setAdding] = useState(false);
  const {success, error} = useToastHelper();

  useEffect(() => {
    getUserDict().then((res) => setWords(res.words)).catch(() => {
    });
  }, []); // initial load on mount

  const loadWords = useCallback(async () => {
    try {
      const res = await getUserDict();
      setWords(res.words);
    } catch { /* silently ignore */
    }
  }, []);

  const handleAdd = useCallback(async () => {
    if (!word.trim()) return;
    setAdding(true);
    try {
      const res = await addUserDictWord(word.trim());
      // Backend returns { added: "word", user_dict_size: 1 }
      if (res.added === word.trim() || res.status === 'added') {
        success(`Added "${word.trim()}" to dictionary`);
        setWord('');
        loadWords();
      } else {
        error(res.message || 'Failed to add word');
      }
    } catch (e: any) {
      error(e.message || 'Add failed');
    } finally {
      setAdding(false);
    }
  }, [word, success, error, loadWords]);

  const handleRemove = useCallback(async (w: string) => {
    try {
      await removeUserDictWord(w);
      setWords((prev) => prev.filter((x) => x.word !== w));
      success(`Removed "${w}" from dictionary`);
    } catch (e: any) {
      error(e.message || 'Remove failed');
    }
  }, [success, error]);

  return (
    <div className="space-y-6">
      {/* Add form */}
      <div className="rounded-2xl p-5 border bg-white/[0.03] border-slate-800/40 flex items-center gap-3">
        <input
          value={word}
          onChange={(e) => setWord(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Type a word to add…"
          dir="rtl"
          className="flex-1 min-w-0 rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 bg-white/[0.03] border-slate-800/40 text-white placeholder:text-slate-600"
        />
        <button
          onClick={handleAdd}
          disabled={!word.trim() || adding}
          className="shrink-0 px-5 py-3 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white text-sm font-medium shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
        >
          {adding ? <Loader2 className="h-4 w-4 animate-spin"/> : <UserPlus className="h-4 w-4"/>}
          Add
        </button>
      </div>

      {/* Words list — horizontal scroll */}
      <div className="rounded-2xl p-5 border bg-white/[0.03] border-slate-800/40">
        <h4 className="text-xs font-semibold uppercase tracking-wider mb-4 text-slate-400">
          Dictionary Words ({words.length})
        </h4>

        {words.length === 0 ? (
          <p className="text-sm text-center py-8 text-slate-600">Your custom dictionary is empty. Add words above.</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory">
            {words.map((w) => (
              <div
                key={w.word}
                className="shrink-0 snap-center rounded-xl border bg-white/[0.03] border-slate-800/40 px-5 py-1 flex items-center gap-3 min-w-[100px]"
              >
                <p className="text-sm font-medium text-white whitespace-nowrap" dir="rtl">{w.word}</p>
                <button
                  onClick={() => handleRemove(w.word)}
                  className="shrink-0 p-1.5 text-red-400 hover:text-red-300 rounded-lg hover:bg-red-500/10 transition-colors"
                  title="Remove word"
                >
                  <XCircle className="h-4 w-4"/>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Analytics Tab ───────────────────────────────────── */

function AnalyticsTab() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSpellAnalytics()
      .then(setData)
      .catch(() => setLoading(false))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 text-violet-400 animate-spin"/>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16">
        <BarChart3 className="h-12 w-12 text-slate-600 mx-auto mb-4"/>
        <p className="text-sm text-slate-500">No analytics data available yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <AnalyticsCard label="Texts Processed" value={(data.total_texts_processed ?? 0).toLocaleString()}
                       icon={FileText}/>
        <AnalyticsCard label="Corrections" value={(data.total_corrections ?? 0).toLocaleString()} icon={Wand2}/>
        <AnalyticsCard label="Correction Rate" value={`${((data.correction_rate ?? 0) * 100).toFixed(1)}%`}
                       icon={TrendingUp}/>
        {data.average_confidence != null && (
          <AnalyticsCard label="Avg Confidence" value={`${((data.average_confidence ?? 0) * 100).toFixed(1)}%`}
                         icon={Target}/>
        )}
      </div>

      {/* Strategy usage */}
      {Object.keys(data.strategy_usage ?? {}).length > 0 && (
        <div className="rounded-2xl p-5 border bg-white/[0.03] border-slate-800/40">
          <h4 className="text-xs font-semibold uppercase tracking-wider mb-4 text-slate-400">Strategy Usage</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.entries(data.strategy_usage ?? {}).map(([strategy, count]) => (
              <div key={strategy} className={`rounded-xl p-4 border bg-white/[0.02] border-slate-800/40`}>
                <p className="text-xs font-medium capitalize text-slate-400">{strategy}</p>
                <p className="text-2xl font-bold text-violet-400 mt-1">{(count ?? 0).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dictionary stats */}
      <div className="rounded-2xl p-5 border bg-white/[0.03] border-slate-800/40">
        <h4 className="text-xs font-semibold uppercase tracking-wider mb-4 text-slate-400">Dictionary Statistics</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatBox label="Words" value={data.dictionary_stats?.words_count ?? 0} color="text-white"/>
          <StatBox label="Bigrams" value={data.dictionary_stats?.bigrams_count ?? 0} color="text-violet-400"/>
          <StatBox label="Trigrams" value={data.dictionary_stats?.trigrams_count ?? 0} color="text-blue-400"/>
          <StatBox label="Total Tokens" value={data.dictionary_stats?.total_unique_tokens ?? 0}
                   color="text-emerald-400"/>
        </div>
      </div>
    </div>
  );
}

/* ─── Shared UI Parts ─────────────────────────────────── */

function TextInput({text, setText, onRun, loading}: {
  text: string;
  setText: (v: string) => void;
  onRun: () => void;
  loading: boolean
}) {
  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste or type Urdu text here…"
        rows={5}
        dir="rtl"
        className="w-full rounded-xl border px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/50 bg-white/[0.03] border-slate-800/40 text-white placeholder:text-slate-600"
      />
      <button
        onClick={onRun}
        disabled={!text.trim() || loading}
        className="px-5 py-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white text-sm font-medium shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Wand2 className="h-4 w-4"/>}
        Run
      </button>
    </div>
  );
}

function ResultCard({label, value, icon: Icon, highlight}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean
}) {
  const [copied, setCopied] = useState(false);
  const display = typeof value === 'string' && value.length > 0 ? value : '(empty)';

  return (
    <div
      className={`rounded-2xl p-5 border ${highlight ? 'border-emerald-500/20' : 'border-slate-800/40'} ${highlight ? 'bg-emerald-500/5' : 'bg-white/[0.03]'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${highlight ? 'text-emerald-400' : 'text-slate-500'}`}/>
          <p className="text-[10px] uppercase tracking-wider font-medium text-slate-500">{label}</p>
        </div>
        <button onClick={() => {
          if (typeof value === 'string') {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }
        }}
                className="p-1.5 rounded-lg transition-colors hover:bg-white/5 text-slate-600 hover:text-white disabled:opacity-30"
                disabled={typeof value !== 'string'}>
          <Copy className="h-3.5 w-3.5"/>
        </button>
      </div>
      <p
        className={`font-urdu rtl text-base leading-relaxed ${highlight ? 'text-emerald-300 font-medium' : 'text-slate-200'}`}
        dir="rtl">
        {display}
      </p>
    </div>
  );
}

function StatBox({label, value, color}: { label: string; value: number | string; color: string }) {
  return (
    <div className={`rounded-xl p-4 border bg-white/[0.02] border-slate-800/40`}>
      <p className="text-[10px] uppercase tracking-wider font-medium mb-1 text-slate-500">{label}</p>
      <p
        className={`text-xl font-bold ${color} tracking-tight`}>{typeof value === 'number' ? value.toLocaleString() : value}</p>
    </div>
  );
}

function AnalyticsCard({label, value, icon: Icon}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className={`rounded-2xl p-5 border bg-white/[0.03] border-slate-800/40`}>
      <Icon className="h-5 w-5 text-violet-400 mb-2"/>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
    </div>
  );
}

export {SpellPage};

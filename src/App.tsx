import { useState, useCallback, useRef, useEffect } from 'react';
import { useASR, isASRSupported } from './hooks/useASR';
import { useTTS, DEFAULT_TTS, type TTSSettings } from './hooks/useTTS';
import { translate, type TranslateAPI } from './services/translate';
import { LanguageSelector, LANGUAGES } from './components/LanguageSelector';
import { DialogBubble, type DialogEntry } from './components/DialogBubble';
import { SettingsPanel } from './components/SettingsPanel';

type ActiveSpeaker = 'A' | 'B' | null;
type AppState = 'idle' | 'listening' | 'translating' | 'speaking';

// ── localStorage helpers ─────────────────────────────────────────────────────
const LS_KEYS = {
  langA: 'voiceswap_langA',
  langB: 'voiceswap_langB',
  translateAPI: 'voiceswap_api',
  geminiKey: 'voiceswap_gemini_key',
  openRouterKey: 'voiceswap_or_key',
  ttsSettings: 'voiceswap_tts',
  autoSpeak: 'voiceswap_auto_speak',
  voiceOverrideA: 'voiceswap_voice_a',
  voiceOverrideB: 'voiceswap_voice_b',
};

function loadLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveLS(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export default function App() {
  // ── Languages (persisted) ────────────────────────────────────────────────
  const [langA, setLangA] = useState(() => loadLS(LS_KEYS.langA, 'ru-RU'));
  const [langB, setLangB] = useState(() => loadLS(LS_KEYS.langB, 'en-US'));

  // ── App state ──────────────────────────────────────────────────────────────
  const [appState, setAppState] = useState<AppState>('idle');
  const [activeSpeaker, setActiveSpeaker] = useState<ActiveSpeaker>(null);
  const [interimText, setInterimText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // ── Dialog history ─────────────────────────────────────────────────────────
  const [dialog, setDialog] = useState<DialogEntry[]>([]);
  const [repeatingId, setRepeatingId] = useState<string | null>(null);
  const dialogEndRef = useRef<HTMLDivElement>(null);

  // ── Settings (persisted) ───────────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(() => loadLS(LS_KEYS.autoSpeak, true));
  const [ttsSettings, setTtsSettings] = useState<TTSSettings>(() =>
    loadLS(LS_KEYS.ttsSettings, DEFAULT_TTS)
  );
  const [translateAPI, setTranslateAPI] = useState<TranslateAPI>(() =>
    loadLS(LS_KEYS.translateAPI, 'gemini')
  );
  const [geminiKey, setGeminiKey] = useState(() => loadLS(LS_KEYS.geminiKey, ''));
  const [openRouterKey, setOpenRouterKey] = useState(() => loadLS(LS_KEYS.openRouterKey, ''));
  const [voiceOverrideA, setVoiceOverrideA] = useState<string | null>(() =>
    loadLS(LS_KEYS.voiceOverrideA, null)
  );
  const [voiceOverrideB, setVoiceOverrideB] = useState<string | null>(() =>
    loadLS(LS_KEYS.voiceOverrideB, null)
  );

  // Persist to localStorage on change
  useEffect(() => saveLS(LS_KEYS.langA, langA), [langA]);
  useEffect(() => saveLS(LS_KEYS.langB, langB), [langB]);
  useEffect(() => saveLS(LS_KEYS.translateAPI, translateAPI), [translateAPI]);
  useEffect(() => saveLS(LS_KEYS.geminiKey, geminiKey), [geminiKey]);
  useEffect(() => saveLS(LS_KEYS.openRouterKey, openRouterKey), [openRouterKey]);
  useEffect(() => saveLS(LS_KEYS.ttsSettings, ttsSettings), [ttsSettings]);
  useEffect(() => saveLS(LS_KEYS.autoSpeak, autoSpeak), [autoSpeak]);
  useEffect(() => saveLS(LS_KEYS.voiceOverrideA, voiceOverrideA), [voiceOverrideA]);
  useEffect(() => saveLS(LS_KEYS.voiceOverrideB, voiceOverrideB), [voiceOverrideB]);

  // ── Refs for async callbacks ───────────────────────────────────────────────
  const activeSpeakerRef = useRef<ActiveSpeaker>(null);
  const appStateRef = useRef<AppState>('idle');
  const langARef = useRef(langA);
  const langBRef = useRef(langB);
  const translateAPIRef = useRef(translateAPI);
  const geminiKeyRef = useRef(geminiKey);
  const openRouterKeyRef = useRef(openRouterKey);
  const autoSpeakRef = useRef(autoSpeak);
  const voiceOverrideARef = useRef(voiceOverrideA);
  const voiceOverrideBRef = useRef(voiceOverrideB);
  const ttsSettingsRef = useRef(ttsSettings);

  useEffect(() => { activeSpeakerRef.current = activeSpeaker; }, [activeSpeaker]);
  useEffect(() => { appStateRef.current = appState; }, [appState]);
  useEffect(() => { langARef.current = langA; }, [langA]);
  useEffect(() => { langBRef.current = langB; }, [langB]);
  useEffect(() => { translateAPIRef.current = translateAPI; }, [translateAPI]);
  useEffect(() => { geminiKeyRef.current = geminiKey; }, [geminiKey]);
  useEffect(() => { openRouterKeyRef.current = openRouterKey; }, [openRouterKey]);
  useEffect(() => { autoSpeakRef.current = autoSpeak; }, [autoSpeak]);
  useEffect(() => { voiceOverrideARef.current = voiceOverrideA; }, [voiceOverrideA]);
  useEffect(() => { voiceOverrideBRef.current = voiceOverrideB; }, [voiceOverrideB]);
  useEffect(() => { ttsSettingsRef.current = ttsSettings; }, [ttsSettings]);

  // ── TTS hook ───────────────────────────────────────────────────────────────
  const tts = useTTS(ttsSettings);

  // ── Capability checks ──────────────────────────────────────────────────────
  const asrSupported = isASRSupported();

  // ── ASR callbacks ──────────────────────────────────────────────────────────
  const handleInterim = useCallback((text: string) => {
    setInterimText(text);
  }, []);

  const handleASREnd = useCallback(() => {
    if (appStateRef.current === 'listening') {
      setAppState('idle');
      setActiveSpeaker(null);
      setInterimText('');
    }
  }, []);

  const handleASRError = useCallback((err: string) => {
    setErrorMsg(err);
    setAppState('idle');
    setActiveSpeaker(null);
    setInterimText('');
    setTimeout(() => setErrorMsg(''), 6000);
  }, []);

  const handleASRResult = useCallback(async (text: string) => {
    const speaker = activeSpeakerRef.current;
    if (!speaker) return;

    setInterimText('');
    setAppState('translating');

    const fromLang = speaker === 'A' ? langARef.current : langBRef.current;
    const toLang   = speaker === 'A' ? langBRef.current : langARef.current;
    const currentAPI = translateAPIRef.current;
    const gemKey = geminiKeyRef.current;
    const orKey = openRouterKeyRef.current;
    const shouldAutoSpeak = autoSpeakRef.current;

    try {
      const result = await translate(text, fromLang, toLang, currentAPI, gemKey || undefined, orKey || undefined);

      const entry: DialogEntry = {
        id: Date.now().toString(),
        speaker,
        original: text,
        translated: result.text,
        fromLang,
        toLang,
        timestamp: new Date(),
        apiUsed: result.api !== 'none' ? result.api : undefined,
      };

      setDialog(prev => [...prev, entry]);
      setActiveSpeaker(null);

      if (shouldAutoSpeak && result.text) {
        setAppState('speaking');

        if (ttsSettingsRef.current.engine === 'web-speech') {
          const targetVoice = speaker === 'A' ? voiceOverrideBRef.current : voiceOverrideARef.current;
          tts.setVoiceOverride(targetVoice);
        }

        try {
          await tts.speak(result.text, toLang, speaker === 'A');
          setDialog(prev => prev.map(e =>
            e.id === entry.id ? { ...e, ttsEngine: ttsSettingsRef.current.engine } : e
          ));
        } catch (err) {
          console.warn('[TTS] speak error:', err);
        }
      }

      setAppState('idle');
    } catch (err) {
      const errMsg = (err as Error).message;
      setErrorMsg(`Ошибка перевода: ${errMsg}`);
      setAppState('idle');
      setActiveSpeaker(null);
      setTimeout(() => setErrorMsg(''), 7000);
    }
  }, [tts]);

  // ── ASR instances ──────────────────────────────────────────────────────────
  const asrA = useASR({ lang: langA, onResult: handleASRResult, onInterim: handleInterim, onError: handleASRError, onEnd: handleASREnd });
  const asrB = useASR({ lang: langB, onResult: handleASRResult, onInterim: handleInterim, onError: handleASRError, onEnd: handleASREnd });

  // ── Scroll to bottom ───────────────────────────────────────────────────────
  useEffect(() => {
    if (dialogEndRef.current) {
      setTimeout(() => dialogEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [dialog]);

  // ── Controls ───────────────────────────────────────────────────────────────
  const startListening = useCallback((speaker: 'A' | 'B') => {
    if (appStateRef.current !== 'idle') return;
    if (tts.isSpeaking) tts.stop();
    setActiveSpeaker(speaker);
    activeSpeakerRef.current = speaker;
    setAppState('listening');
    setInterimText('');
    setErrorMsg('');
    if (speaker === 'A') asrA.start(); else asrB.start();
  }, [tts, asrA, asrB]);

  const stopListening = useCallback(() => {
    if (activeSpeakerRef.current === 'A') asrA.stop();
    else if (activeSpeakerRef.current === 'B') asrB.stop();
  }, [asrA, asrB]);

  const swapLanguages = useCallback(() => {
    if (appStateRef.current !== 'idle') return;
    const tmpA = langARef.current;
    const tmpVA = voiceOverrideARef.current;
    setLangA(langBRef.current);
    setLangB(tmpA);
    setVoiceOverrideA(voiceOverrideBRef.current);
    setVoiceOverrideB(tmpVA);
  }, []);

  const handleRepeat = useCallback(async (entry: DialogEntry) => {
    if (tts.isSpeaking || appStateRef.current !== 'idle') return;
    setRepeatingId(entry.id);

    if (ttsSettingsRef.current.engine === 'web-speech') {
      const targetVoice = entry.speaker === 'A' ? voiceOverrideBRef.current : voiceOverrideARef.current;
      tts.setVoiceOverride(targetVoice);
    }

    try {
      await tts.speak(entry.translated, entry.toLang, entry.speaker === 'A');
    } catch (err) {
      console.warn('[Repeat] TTS error:', err);
    } finally {
      setRepeatingId(null);
    }
  }, [tts]);

  const clearDialog = useCallback(() => setDialog([]), []);

  // ── Computed ───────────────────────────────────────────────────────────────
  const isListening   = appState === 'listening';
  const isTranslating = appState === 'translating';
  const isSpeaking    = appState === 'speaking';
  const isBusy        = appState !== 'idle';

  const langAInfo = LANGUAGES.find(l => l.code === langA);
  const langBInfo = LANGUAGES.find(l => l.code === langB);

  const hasGeminiKey = !!geminiKey;
  const hasOpenRouterKey = !!openRouterKey;
  const hasELKey = !!ttsSettings.elevenLabsKey;

  const isLLMActive = (translateAPI === 'gemini' && hasGeminiKey) || (translateAPI === 'openrouter' && hasOpenRouterKey);
  const isELActive = ttsSettings.engine === 'elevenlabs' && hasELKey;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[100dvh] bg-slate-950 text-white flex flex-col select-none overflow-hidden">

      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/60 px-4 safe-top">
        <div className="flex items-center justify-between max-w-lg mx-auto h-14">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-900/50">
              <span className="text-lg leading-none">🎙️</span>
            </div>
            <div>
              <h1 className="text-[15px] font-black text-white leading-tight tracking-tight">VoiceSwap</h1>
              <div className="flex items-center gap-1.5">
                <p className="text-[10px] text-slate-500 leading-tight">Голосовой переводчик</p>
                {isLLMActive && (
                  <span className="text-[8px] font-bold bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-1.5 py-0.5 rounded-full">
                    LLM
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {translateAPI === 'gemini' && (
              <div className={`flex items-center gap-1 text-[9px] px-2 py-1 rounded-lg border ${
                hasGeminiKey
                  ? 'bg-emerald-900/30 text-emerald-400 border-emerald-700/30'
                  : 'bg-amber-900/20 text-amber-400 border-amber-700/30'
              }`}>
                🧠 {hasGeminiKey ? 'Gemini ✓' : 'Без ключа'}
              </div>
            )}
            {translateAPI === 'openrouter' && (
              <div className={`flex items-center gap-1 text-[9px] px-2 py-1 rounded-lg border ${
                hasOpenRouterKey
                  ? 'bg-purple-900/30 text-purple-400 border-purple-700/30'
                  : 'bg-amber-900/20 text-amber-400 border-amber-700/30'
              }`}>
                🤖 {hasOpenRouterKey ? 'DeepSeek ✓' : 'Без ключа'}
              </div>
            )}
            {ttsSettings.engine === 'elevenlabs' && (
              <div className={`flex items-center gap-1 text-[9px] px-2 py-1 rounded-lg border ${
                hasELKey
                  ? 'bg-violet-900/30 text-violet-400 border-violet-700/30'
                  : 'bg-amber-900/20 text-amber-400 border-amber-700/30'
              }`}>
                🎙 {hasELKey ? 'EL ✓' : 'Без ключа'}
              </div>
            )}
            {!asrSupported && (
              <span className="text-[9px] text-red-400 bg-red-900/30 px-2 py-1 rounded-lg border border-red-700/30">ASR ✗</span>
            )}
            {dialog.length > 0 && (
              <button onClick={clearDialog} className="px-2.5 py-1.5 rounded-xl bg-slate-800/60 text-slate-500 text-xs font-medium active:scale-95 transition-transform border border-slate-700/40">
                🗑
              </button>
            )}
            <button onClick={() => setShowSettings(true)}
              className="w-9 h-9 rounded-xl bg-slate-800/60 text-slate-300 flex items-center justify-center active:scale-95 transition-transform border border-slate-700/40">
              ⚙️
            </button>
          </div>
        </div>
      </header>

      {/* Language selectors */}
      <div className="px-4 pt-3 pb-1 max-w-lg mx-auto w-full">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <LanguageSelector value={langA} onChange={setLangA} label="Говорит A" />
          </div>
          <button onClick={swapLanguages} disabled={isBusy}
            className="mb-0.5 w-11 h-11 rounded-xl bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600/50 flex items-center justify-center text-xl active:scale-90 transition-all disabled:opacity-40 shadow-lg"
            style={{ WebkitTapHighlightColor: 'transparent' }}>
            🔄
          </button>
          <div className="flex-1">
            <LanguageSelector value={langB} onChange={setLangB} label="Говорит B" />
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="px-4 pt-2 pb-1 max-w-lg mx-auto w-full">
        {errorMsg ? (
          <div className="bg-red-950/60 border border-red-700/40 rounded-2xl px-4 py-3 flex items-start gap-2.5">
            <span className="text-lg mt-0.5 flex-shrink-0">⚠️</span>
            <span className="text-sm text-red-300 leading-snug">{errorMsg}</span>
          </div>
        ) : isListening ? (
          <div className="bg-slate-800/80 border border-red-500/30 rounded-2xl px-4 py-3 shadow-lg shadow-red-900/10">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Слушаю {activeSpeaker} · {activeSpeaker === 'A' ? langAInfo?.name : langBInfo?.name}
              </span>
              <div className="ml-auto flex gap-0.5 items-end h-4">
                {[2,3,4,3,2].map((h,i) => (
                  <div key={i} className="w-1 bg-red-400 rounded-full"
                    style={{ height: `${h*3}px`, animation: `wave ${0.3+i*0.1}s ease-in-out infinite alternate` }} />
                ))}
              </div>
            </div>
            <p className="text-sm text-white min-h-[1.25rem]">
              {interimText || <span className="text-slate-600 italic text-xs">Говорите сейчас...</span>}
            </p>
          </div>
        ) : isTranslating ? (
          <div className={`border rounded-2xl px-4 py-3 flex items-center gap-3 ${
            translateAPI === 'gemini' && hasGeminiKey
              ? 'bg-emerald-950/40 border-emerald-700/40'
              : translateAPI === 'openrouter' && hasOpenRouterKey
              ? 'bg-purple-950/40 border-purple-700/40'
              : 'bg-indigo-950/40 border-indigo-700/40'
          }`}>
            <div className={`w-5 h-5 border-2 border-t-transparent rounded-full animate-spin flex-shrink-0 ${
              translateAPI === 'gemini' && hasGeminiKey ? 'border-emerald-400'
              : translateAPI === 'openrouter' && hasOpenRouterKey ? 'border-purple-400'
              : 'border-indigo-400'
            }`} />
            <div>
              <p className={`text-sm font-medium ${
                translateAPI === 'gemini' && hasGeminiKey ? 'text-emerald-300'
                : translateAPI === 'openrouter' && hasOpenRouterKey ? 'text-purple-300'
                : 'text-indigo-300'
              }`}>
                {translateAPI === 'gemini' && hasGeminiKey ? '🧠 Gemini переводит...'
                : translateAPI === 'openrouter' && hasOpenRouterKey ? '🤖 DeepSeek переводит...'
                : 'Перевод...'}
              </p>
              <p className={`text-xs opacity-60 ${
                translateAPI === 'gemini' && hasGeminiKey ? 'text-emerald-400'
                : translateAPI === 'openrouter' && hasOpenRouterKey ? 'text-purple-400'
                : 'text-indigo-400'
              }`}>
                {translateAPI === 'gemini' && hasGeminiKey ? 'Google AI · контекст и идиомы'
                : translateAPI === 'openrouter' && hasOpenRouterKey ? 'DeepSeek-V3 · контекст и тон'
                : `API: ${translateAPI}`}
              </p>
            </div>
          </div>
        ) : isSpeaking ? (
          <div className={`border rounded-2xl px-4 py-3 flex items-center gap-3 ${
            ttsSettings.engine === 'elevenlabs' && hasELKey
              ? 'bg-violet-950/40 border-violet-700/40'
              : 'bg-emerald-950/40 border-emerald-700/40'
          }`}>
            <SoundWave color={ttsSettings.engine === 'elevenlabs' && hasELKey ? 'violet' : 'emerald'} />
            <div>
              <p className={`text-sm font-medium ${ttsSettings.engine === 'elevenlabs' && hasELKey ? 'text-violet-300' : 'text-emerald-300'}`}>
                {ttsSettings.engine === 'elevenlabs' && hasELKey ? '🎙 ElevenLabs говорит...' : 'Воспроизведение...'}
              </p>
              <p className={`text-xs opacity-50 ${ttsSettings.engine === 'elevenlabs' && hasELKey ? 'text-violet-400' : 'text-emerald-400'}`}>
                Нажмите Стоп чтобы прервать
              </p>
            </div>
          </div>
        ) : (
          <div className="h-14 flex items-center justify-center">
            {dialog.length === 0 ? (
              <p className="text-xs text-slate-700 text-center px-4">
                {asrSupported
                  ? '👇 Нажмите кнопку говорящего и начинайте'
                  : '❌ Браузер не поддерживает распознавание. Используйте Chrome или Safari.'}
              </p>
            ) : (
              <p className="text-xs text-slate-800">История разговора ↑</p>
            )}
          </div>
        )}
      </div>

      {/* Dialog history */}
      <div className="flex-1 overflow-y-auto px-4 pb-2 max-w-lg mx-auto w-full" style={{ overscrollBehavior: 'contain' }}>
        {dialog.map(entry => (
          <DialogBubble
            key={entry.id}
            entry={entry}
            onRepeat={handleRepeat}
            isRepeating={repeatingId === entry.id}
          />
        ))}
        <div ref={dialogEndRef} className="h-1" />
      </div>

      {/* Main controls */}
      <div className="sticky bottom-0 bg-slate-950/95 backdrop-blur-md border-t border-slate-800/60 px-4 pt-3 safe-bottom z-30">
        <div className="max-w-lg mx-auto">
          {/* Engine badge row */}
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className={`text-[9px] px-2 py-0.5 rounded-full border font-medium ${
              isLLMActive
                ? translateAPI === 'gemini'
                  ? 'bg-emerald-900/40 text-emerald-400 border-emerald-700/30'
                  : 'bg-purple-900/40 text-purple-400 border-purple-700/30'
                : 'bg-slate-800/60 text-slate-600 border-slate-700/30'
            }`}>
              🌍 {isLLMActive ? (translateAPI === 'gemini' ? 'Gemini Flash' : 'DeepSeek-V3') : translateAPI}
            </span>
            <span className="text-slate-800 text-[8px]">+</span>
            <span className={`text-[9px] px-2 py-0.5 rounded-full border font-medium ${
              isELActive
                ? 'bg-violet-900/40 text-violet-400 border-violet-700/30'
                : 'bg-slate-800/60 text-slate-600 border-slate-700/30'
            }`}>
              🔊 {isELActive ? 'ElevenLabs Flash' : 'Web Speech'}
            </span>
          </div>

          {/* Mic buttons */}
          <div className="flex gap-3 mb-2.5">
            <MicButton
              speaker="A"
              langInfo={langAInfo}
              isActive={activeSpeaker === 'A' && isListening}
              isDisabled={isBusy && !(activeSpeaker === 'A' && isListening)}
              onPress={() => startListening('A')}
              gradient="from-indigo-600 to-blue-700"
              activeGradient="from-indigo-500 to-blue-600"
              ringColor="ring-indigo-500/60"
            />
            <MicButton
              speaker="B"
              langInfo={langBInfo}
              isActive={activeSpeaker === 'B' && isListening}
              isDisabled={isBusy && !(activeSpeaker === 'B' && isListening)}
              onPress={() => startListening('B')}
              gradient="from-emerald-600 to-teal-700"
              activeGradient="from-emerald-500 to-teal-600"
              ringColor="ring-emerald-500/60"
            />
          </div>

          {/* Stop button */}
          <button
            onClick={isListening
              ? stopListening
              : () => { tts.stop(); setAppState('idle'); }
            }
            disabled={!isBusy}
            className={`w-full py-3 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 border ${
              isBusy
                ? isListening
                  ? 'bg-red-600/90 text-white border-red-500/60 shadow-lg shadow-red-900/20'
                  : isSpeaking
                  ? 'bg-slate-700 text-slate-200 border-slate-600'
                  : 'bg-slate-800 text-slate-400 border-slate-700 cursor-default'
                : 'bg-slate-900/60 text-slate-700 border-slate-800/60 cursor-not-allowed'
            }`}
            style={{ WebkitTapHighlightColor: 'transparent' }}>
            {isListening ? (
              <><span>⏹</span><span>Стоп</span></>
            ) : isSpeaking ? (
              <><span>🔇</span><span>Замолчать</span></>
            ) : isTranslating ? (
              <><span className="w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" /><span>Переводим...</span></>
            ) : (
              <><span>⏹</span><span>Стоп</span></>
            )}
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <SettingsPanel
          ttsSettings={ttsSettings}
          onTTSChange={setTtsSettings}
          autoSpeak={autoSpeak}
          onAutoSpeakChange={setAutoSpeak}
          translateAPI={translateAPI}
          onTranslateAPIChange={setTranslateAPI}
          geminiKey={geminiKey}
          onGeminiKeyChange={setGeminiKey}
          openRouterKey={openRouterKey}
          onOpenRouterKeyChange={setOpenRouterKey}
          voices={tts.voices}
          langA={langA}
          langB={langB}
          voiceOverrideA={voiceOverrideA}
          voiceOverrideB={voiceOverrideB}
          onVoiceOverrideAChange={setVoiceOverrideA}
          onVoiceOverrideBChange={setVoiceOverrideB}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface MicButtonProps {
  speaker: 'A' | 'B';
  langInfo?: { flag: string; name: string };
  isActive: boolean;
  isDisabled: boolean;
  onPress: () => void;
  gradient: string;
  activeGradient: string;
  ringColor: string;
}

function MicButton({ speaker, langInfo, isActive, isDisabled, onPress, gradient, activeGradient, ringColor }: MicButtonProps) {
  return (
    <button
      onClick={onPress}
      disabled={isDisabled}
      className={`flex-1 rounded-3xl font-bold text-white transition-all flex flex-col items-center justify-center gap-1.5 shadow-xl select-none border
        ${isActive
          ? `bg-gradient-to-br ${activeGradient} ring-4 ${ringColor} scale-[0.97] shadow-2xl border-white/10`
          : isDisabled
          ? `bg-gradient-to-br ${gradient} opacity-25 cursor-not-allowed border-white/5`
          : `bg-gradient-to-br ${gradient} active:scale-[0.96] border-white/10`
        }`}
      style={{ WebkitTapHighlightColor: 'transparent', minHeight: '120px' }}>

      <div className="relative">
        {isActive ? (
          <>
            <span className="text-5xl">🎙️</span>
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white/30 shadow-[0_0_8px_rgba(239,68,68,1)] animate-pulse" />
          </>
        ) : (
          <span className="text-5xl">🎤</span>
        )}
      </div>

      <div className="text-3xl font-black tracking-tight">{speaker}</div>

      <div className="text-xs font-medium opacity-75 flex items-center gap-1">
        {langInfo && <span>{langInfo.flag}</span>}
        <span className="max-w-[80px] truncate">{langInfo?.name.split(' ')[0] || '...'}</span>
      </div>

      {isActive && (
        <div className="flex gap-1 items-end h-5 mt-0.5">
          {[1.5,2.5,3.5,4,3.5,2.5,1.5].map((h,i) => (
            <div key={i} className="w-1 bg-white/70 rounded-full"
              style={{ height: `${h*5}px`, animation: `wave ${0.35+i*0.07}s ease-in-out infinite alternate` }} />
          ))}
        </div>
      )}
    </button>
  );
}

function SoundWave({ color = 'emerald' }: { color?: 'emerald' | 'violet' }) {
  const cls = color === 'violet' ? 'bg-violet-400' : 'bg-emerald-400';
  return (
    <div className="flex gap-0.5 items-end h-6 flex-shrink-0">
      {[2,3,5,4,6,4,5,3,2].map((h,i) => (
        <div key={i} className={`w-1 ${cls} rounded-full`}
          style={{ height: `${h*4}px`, animation: `wave ${0.3+i*0.07}s ease-in-out infinite alternate` }} />
      ))}
    </div>
  );
}
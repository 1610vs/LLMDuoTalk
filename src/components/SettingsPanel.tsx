import { useState } from 'react';
import type { TTSSettings } from '../hooks/useTTS';
import { EL_VOICE_PRESETS, isTTSSupported } from '../hooks/useTTS';
import type { TranslateAPI } from '../services/translate';
import { isASRSupported } from '../hooks/useASR';

interface DiagResult { label: string; ok: boolean; detail: string; }

interface SettingsPanelProps {
  ttsSettings: TTSSettings;
  onTTSChange: (s: TTSSettings) => void;
  autoSpeak: boolean;
  onAutoSpeakChange: (v: boolean) => void;
  translateAPI: TranslateAPI;
  onTranslateAPIChange: (api: TranslateAPI) => void;
  geminiKey: string;
  onGeminiKeyChange: (k: string) => void;
  openRouterKey: string;
  onOpenRouterKeyChange: (k: string) => void;
  voices: SpeechSynthesisVoice[];
  langA: string;
  langB: string;
  voiceOverrideA: string | null;
  voiceOverrideB: string | null;
  onVoiceOverrideAChange: (v: string | null) => void;
  onVoiceOverrideBChange: (v: string | null) => void;
  onClose: () => void;
}

export function SettingsPanel({
  ttsSettings, onTTSChange,
  autoSpeak, onAutoSpeakChange,
  translateAPI, onTranslateAPIChange,
  geminiKey, onGeminiKeyChange,
  openRouterKey, onOpenRouterKeyChange,
  voices, langA, langB,
  voiceOverrideA, voiceOverrideB,
  onVoiceOverrideAChange, onVoiceOverrideBChange,
  onClose,
}: SettingsPanelProps) {
  const [diagResults, setDiagResults] = useState<DiagResult[]>([]);
  const [diagRunning, setDiagRunning] = useState(false);
  const [showGemKey, setShowGemKey] = useState(false);
  const [showOrKey, setShowOrKey] = useState(false);
  const [showElKey, setShowElKey] = useState(false);

  const isEL = ttsSettings.engine === 'elevenlabs';
  const isGem = translateAPI === 'gemini';
  const isOR = translateAPI === 'openrouter';

  const voicesForLangA = voices.filter(v =>
    v.lang.toLowerCase().startsWith(langA.split('-')[0].toLowerCase())
  );
  const voicesForLangB = voices.filter(v =>
    v.lang.toLowerCase().startsWith(langB.split('-')[0].toLowerCase())
  );

  const runDiag = async () => {
    setDiagRunning(true);
    const results: DiagResult[] = [];

    const isHTTPS = location.protocol === 'https:' || location.hostname === 'localhost';
    results.push({ label: 'HTTPS / localhost', ok: isHTTPS, detail: isHTTPS ? location.protocol + '//' + location.hostname : '❗ Нужен HTTPS для микрофона!' });

    const asrOk = isASRSupported();
    results.push({ label: 'Web Speech API (ASR)', ok: asrOk, detail: asrOk ? 'SpeechRecognition доступен' : 'Используйте Chrome или Safari.' });

    const ttsOk = isTTSSupported();
    results.push({ label: 'Speech Synthesis (TTS)', ok: ttsOk, detail: ttsOk ? `${voices.length} голосов` : 'Не поддерживается.' });

    // MyMemory
    try {
      const res = await Promise.race([
        fetch('https://api.mymemory.translated.net/get?q=test&langpair=en|ru'),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
      ]);
      results.push({ label: 'MyMemory API', ok: (res as Response).ok, detail: (res as Response).ok ? 'OK' : `HTTP ${(res as Response).status}` });
    } catch (e) {
      results.push({ label: 'MyMemory API', ok: false, detail: `Недоступен: ${(e as Error).message}` });
    }

    // Gemini
    if (geminiKey) {
      try {
        const res = await Promise.race([
          fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash?key=${geminiKey}`),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
        ]);
        results.push({ label: 'Gemini API', ok: (res as Response).ok, detail: (res as Response).ok ? 'Ключ валиден ✓' : `HTTP ${(res as Response).status}` });
      } catch (e) {
        results.push({ label: 'Gemini API', ok: false, detail: `Ошибка: ${(e as Error).message}` });
      }
    }

    // OpenRouter
    if (openRouterKey) {
      try {
        const res = await Promise.race([
          fetch('https://openrouter.ai/api/v1/models', { headers: { 'Authorization': `Bearer ${openRouterKey}` } }),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
        ]);
        results.push({ label: 'OpenRouter API', ok: (res as Response).ok, detail: (res as Response).ok ? 'Ключ валиден ✓' : `HTTP ${(res as Response).status}` });
      } catch (e) {
        results.push({ label: 'OpenRouter API', ok: false, detail: `Ошибка: ${(e as Error).message}` });
      }
    }

    // ElevenLabs
    if (ttsSettings.elevenLabsKey) {
      try {
        const res = await Promise.race([
          fetch('https://api.elevenlabs.io/v1/user', { headers: { 'xi-api-key': ttsSettings.elevenLabsKey } }),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
        ]);
        const data = (res as Response).ok ? await (res as Response).json() : null;
        results.push({
          label: 'ElevenLabs API',
          ok: (res as Response).ok,
          detail: data ? `${data.subscription?.character_count ?? '?'} / ${data.subscription?.character_limit ?? '?'} символов` : `HTTP ${(res as Response).status}`,
        });
      } catch (e) {
        results.push({ label: 'ElevenLabs API', ok: false, detail: `Ошибка: ${(e as Error).message}` });
      }
    }

    // Mic permissions
    try {
      const perm = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      results.push({
        label: 'Микрофон',
        ok: perm.state === 'granted',
        detail: perm.state === 'granted' ? 'Разрешён ✓' : perm.state === 'prompt' ? 'Требует подтверждения' : '❗ Запрещён',
      });
    } catch {
      results.push({ label: 'Микрофон', ok: false, detail: 'Невозможно проверить' });
    }

    setDiagResults(results);
    setDiagRunning(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/98 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60 flex-shrink-0">
        <h2 className="text-base font-bold text-white flex items-center gap-2">⚙️ Настройки</h2>
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-700 text-slate-300 flex items-center justify-center active:scale-95 text-sm font-bold" style={{ WebkitTapHighlightColor: 'transparent' }}>✕</button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6 pb-16" style={{ overscrollBehavior: 'contain' }}>

        {/* ── ENGINE SELECTION ─────────────────────────────────────────────── */}
        <Section icon="🚀" title="Движок перевода + голоса">
          <div className="grid grid-cols-3 gap-2">
            <EngineCard
              active={!isGem && !isOR && !isEL}
              title="Базовый"
              subtitle="MyMemory + Web Speech"
              badge="🆓 Без ключей"
              badgeColor="slate"
              onClick={() => { onTranslateAPIChange('mymemory'); onTTSChange({ ...ttsSettings, engine: 'web-speech' }); }}
            />
            <EngineCard
              active={isGem && !isEL}
              title="Улучшенный"
              subtitle="Gemini + Premium голоса"
              badge="🧠 Бесплатно"
              badgeColor="emerald"
              onClick={() => { onTranslateAPIChange('gemini'); onTTSChange({ ...ttsSettings, engine: 'web-speech' }); }}
            />
            <EngineCard
              active={isOR && isEL}
              title="Премиум"
              subtitle="DeepSeek + ElevenLabs"
              badge="🔑 API ключи"
              badgeColor="purple"
              onClick={() => { onTranslateAPIChange('openrouter'); onTTSChange({ ...ttsSettings, engine: 'elevenlabs' }); }}
            />
          </div>
          <p className="text-[10px] text-slate-600 mt-2 px-1">
            При ошибке API приложение автоматически откатывается на следующий уровень.
          </p>
        </Section>

        {/* ── TRANSLATE API ────────────────────────────────────────────────── */}
        <Section icon="🌍" title="Перевод">
          <div className="space-y-2">
            {([
              { id: 'gemini' as const, name: 'Gemini 2.5 Flash', desc: 'Бесплатный LLM · Google AI · 1500 зап/день · идиомы · контекст', premium: false, color: 'emerald' },
              { id: 'openrouter' as const, name: 'OpenRouter (DeepSeek-V3)', desc: 'Бесплатный tier · ~50 зап/день · лучшее качество', premium: true, color: 'purple' },
              { id: 'mymemory' as const, name: 'MyMemory', desc: 'Бесплатно · ~5000 зап/день · статистический перевод', premium: false, color: 'slate' },
              { id: 'lingva' as const, name: 'Lingva Translate', desc: 'Бесплатно · без лимитов · на основе Google', premium: false, color: 'slate' },
              { id: 'libretranslate' as const, name: 'LibreTranslate', desc: 'Open source · может быть медленнее', premium: false, color: 'slate' },
            ]).map(api => (
              <button key={api.id} onClick={() => onTranslateAPIChange(api.id)}
                className={`w-full text-left px-4 py-3 rounded-2xl border transition-all active:scale-[0.98] ${
                  translateAPI === api.id
                    ? api.color === 'emerald' ? 'border-emerald-500/70 bg-emerald-900/30 text-white'
                    : api.color === 'purple' ? 'border-purple-500/70 bg-purple-900/30 text-white'
                    : 'border-indigo-500/70 bg-indigo-900/30 text-white'
                    : 'border-slate-700/60 bg-slate-800/60 text-slate-300'
                }`} style={{ WebkitTapHighlightColor: 'transparent' }}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{api.name}</span>
                  <div className="flex items-center gap-1.5">
                    {api.premium && <span className="text-[9px] bg-purple-900/50 text-purple-400 px-1.5 py-0.5 rounded-full border border-purple-700/40">PRO</span>}
                    {!api.premium && api.id !== 'mymemory' && api.id !== 'lingva' && api.id !== 'libretranslate' && (
                      <span className="text-[9px] bg-emerald-900/50 text-emerald-400 px-1.5 py-0.5 rounded-full border border-emerald-700/40">FREE</span>
                    )}
                    {translateAPI === api.id && <span className="text-indigo-400 font-bold text-sm">✓</span>}
                  </div>
                </div>
                <span className="text-xs text-slate-500 mt-0.5 block">{api.desc}</span>
              </button>
            ))}
          </div>

          {/* Gemini key input */}
          {isGem && (
            <div className="mt-3">
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">Gemini API Key</label>
              <div className="relative">
                <input
                  type={showGemKey ? 'text' : 'password'}
                  value={geminiKey}
                  onChange={e => onGeminiKeyChange(e.target.value)}
                  placeholder="AIza..."
                  className="w-full bg-slate-800 border border-slate-600/70 rounded-xl px-3 py-2.5 pr-10 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                  style={{ fontSize: '16px' }}
                />
                <button onClick={() => setShowGemKey(!showGemKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-base">
                  {showGemKey ? '🙈' : '👁'}
                </button>
              </div>
              <p className="text-[10px] text-slate-600 mt-1">
                Получите ключ на <span className="text-emerald-500">aistudio.google.com</span> → Get API key → бесплатно
              </p>
            </div>
          )}

          {/* OpenRouter key input */}
          {isOR && (
            <div className="mt-3">
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">OpenRouter API Key</label>
              <div className="relative">
                <input
                  type={showOrKey ? 'text' : 'password'}
                  value={openRouterKey}
                  onChange={e => onOpenRouterKeyChange(e.target.value)}
                  placeholder="sk-or-v1-..."
                  className="w-full bg-slate-800 border border-slate-600/70 rounded-xl px-3 py-2.5 pr-10 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30"
                  style={{ fontSize: '16px' }}
                />
                <button onClick={() => setShowOrKey(!showOrKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-base">
                  {showOrKey ? '🙈' : '👁'}
                </button>
              </div>
              <p className="text-[10px] text-slate-600 mt-1">
                Получите ключ на <span className="text-purple-500">openrouter.ai</span> → Keys
              </p>
            </div>
          )}
        </Section>

        {/* ── TTS ENGINE ───────────────────────────────────────────────────── */}
        <Section icon="🔊" title="Синтез речи (TTS)">
          <div className="grid grid-cols-2 gap-2 mb-3">
            <EngineCard
              active={ttsSettings.engine === 'web-speech'}
              title="Web Speech"
              subtitle="Системные голоса · Premium на iOS"
              badge="🆓 Бесплатно"
              badgeColor="emerald"
              onClick={() => onTTSChange({ ...ttsSettings, engine: 'web-speech' })}
            />
            <EngineCard
              active={ttsSettings.engine === 'elevenlabs'}
              title="ElevenLabs"
              subtitle="Flash v2.5 · ИИ-голос · человеческое качество"
              badge="🔑 API ключ"
              badgeColor="violet"
              onClick={() => onTTSChange({ ...ttsSettings, engine: 'elevenlabs' })}
            />
          </div>

          {isEL ? (
            <div className="space-y-3">
              {/* ElevenLabs key */}
              <div>
                <label className="block text-xs text-slate-400 mb-1.5 font-medium">ElevenLabs API Key</label>
                <div className="relative">
                  <input
                    type={showElKey ? 'text' : 'password'}
                    value={ttsSettings.elevenLabsKey}
                    onChange={e => onTTSChange({ ...ttsSettings, elevenLabsKey: e.target.value })}
                    placeholder="sk_..."
                    className="w-full bg-slate-800 border border-slate-600/70 rounded-xl px-3 py-2.5 pr-10 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                    style={{ fontSize: '16px' }}
                  />
                  <button onClick={() => setShowElKey(!showElKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-base">
                    {showElKey ? '🙈' : '👁'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-600 mt-1">elevenlabs.io → Profile → API Key</p>
              </div>

              {/* Voice IDs */}
              <ELVoiceSelect
                label="Голос для цели A (слышит B)"
                value={ttsSettings.voiceIdA}
                onChange={id => onTTSChange({ ...ttsSettings, voiceIdA: id })}
              />
              <ELVoiceSelect
                label="Голос для цели B (слышит A)"
                value={ttsSettings.voiceIdB}
                onChange={id => onTTSChange({ ...ttsSettings, voiceIdB: id })}
              />

              {/* EL quality sliders */}
              <div className="bg-slate-800/60 rounded-2xl p-4 space-y-4 border border-slate-700/40">
                <SliderRow
                  label={`Стабильность: ${ttsSettings.stability.toFixed(2)}`}
                  min={0} max={1} step={0.05}
                  value={ttsSettings.stability}
                  onChange={v => onTTSChange({ ...ttsSettings, stability: v })}
                />
                <SliderRow
                  label={`Схожесть: ${ttsSettings.similarityBoost.toFixed(2)}`}
                  min={0} max={1} step={0.05}
                  value={ttsSettings.similarityBoost}
                  onChange={v => onTTSChange({ ...ttsSettings, similarityBoost: v })}
                />
                <SliderRow
                  label={`Громкость: ${Math.round(ttsSettings.volume * 100)}%`}
                  min={0} max={1} step={0.05}
                  value={ttsSettings.volume}
                  onChange={v => onTTSChange({ ...ttsSettings, volume: v })}
                />
              </div>
            </div>
          ) : (
            <div className="bg-slate-800/60 rounded-2xl p-4 space-y-4 border border-slate-700/40">
              <SliderRow
                label={`Скорость: ${ttsSettings.rate.toFixed(1)}×`}
                min={0.5} max={2.0} step={0.1}
                value={ttsSettings.rate}
                onChange={v => onTTSChange({ ...ttsSettings, rate: v })}
              />
              <SliderRow
                label={`Тон: ${ttsSettings.pitch.toFixed(1)}`}
                min={0.5} max={2.0} step={0.1}
                value={ttsSettings.pitch}
                onChange={v => onTTSChange({ ...ttsSettings, pitch: v })}
              />
              <SliderRow
                label={`Громкость: ${Math.round(ttsSettings.volume * 100)}%`}
                min={0} max={1} step={0.05}
                value={ttsSettings.volume}
                onChange={v => onTTSChange({ ...ttsSettings, volume: v })}
              />
              <div className="flex items-center justify-between pt-1">
                <div>
                  <span className="text-sm text-slate-300 block">Женский голос</span>
                  <span className="text-xs text-slate-500">Автовыбор премиум-голоса</span>
                </div>
                <Toggle value={ttsSettings.preferFemale} onChange={v => onTTSChange({ ...ttsSettings, preferFemale: v })} />
              </div>
            </div>
          )}

          {/* Web Speech voice override (only if web-speech engine) */}
          {!isEL && voices.length > 0 && (
            <div className="mt-3 space-y-2">
              {voicesForLangA.length > 0
                ? <VoiceSelect label={`Голос A (${langA})`} voices={voicesForLangA} value={voiceOverrideA} onChange={onVoiceOverrideAChange} />
                : <p className="text-sm text-slate-500 bg-slate-800/40 rounded-xl px-4 py-3">Голоса для {langA} не найдены</p>}
              {voicesForLangB.length > 0
                ? <VoiceSelect label={`Голос B (${langB})`} voices={voicesForLangB} value={voiceOverrideB} onChange={onVoiceOverrideBChange} />
                : <p className="text-sm text-slate-500 bg-slate-800/40 rounded-xl px-4 py-3">Голоса для {langB} не найдены</p>}
              <p className="text-[10px] text-slate-600 px-1">
                📱 встроенный · ☁️ онлайн · ⭐ премиум (Siri-качество)
              </p>
            </div>
          )}
        </Section>

        {/* ── AUTOMATION ───────────────────────────────────────────────────── */}
        <Section icon="🤖" title="Автоматизация">
          <div className="bg-slate-800/60 rounded-2xl border border-slate-700/40">
            <div className="flex items-center justify-between px-4 py-3.5">
              <div>
                <span className="text-sm text-slate-200 block font-medium">Автопроизношение</span>
                <span className="text-xs text-slate-500">Перевод зачитывается сразу</span>
              </div>
              <Toggle value={autoSpeak} onChange={onAutoSpeakChange} />
            </div>
          </div>
        </Section>

        {/* ── DIAGNOSTICS ──────────────────────────────────────────────────── */}
        <Section icon="🔍" title="Диагностика">
          <button onClick={runDiag} disabled={diagRunning}
            className="w-full py-3.5 rounded-2xl bg-slate-700/80 text-slate-200 font-semibold text-sm active:scale-[0.98] transition-transform disabled:opacity-50 border border-slate-600/40"
            style={{ WebkitTapHighlightColor: 'transparent' }}>
            {diagRunning ? '⏳ Проверка...' : '🔧 Запустить диагностику'}
          </button>
          {diagResults.length > 0 && (
            <div className="mt-3 space-y-2">
              {diagResults.map((r, i) => (
                <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${r.ok ? 'bg-emerald-900/20 border-emerald-700/30' : 'bg-red-900/20 border-red-700/30'}`}>
                  <span className="text-lg flex-shrink-0">{r.ok ? '✅' : '❌'}</span>
                  <div>
                    <div className={`text-sm font-semibold ${r.ok ? 'text-emerald-300' : 'text-red-300'}`}>{r.label}</div>
                    <div className={`text-xs mt-0.5 ${r.ok ? 'text-emerald-500' : 'text-red-400'}`}>{r.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── INFO ─────────────────────────────────────────────────────────── */}
        <div className="bg-slate-800/30 rounded-2xl p-4 border border-slate-700/30">
          <h3 className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-2">ℹ️ Браузер</h3>
          <p className="text-[10px] text-slate-700 break-all leading-relaxed">{navigator.userAgent}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <InfoTile label="Голосов" value={String(voices.length)} />
            <InfoTile label="Протокол" value={location.protocol.replace(':', '')} />
            <InfoTile label="TTS Engine" value={ttsSettings.engine === 'elevenlabs' ? 'EL' : 'WS'} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
        <span>{icon}</span> {title}
      </h3>
      {children}
    </section>
  );
}

function EngineCard({ active, title, subtitle, badge, badgeColor, onClick }: {
  active: boolean; title: string; subtitle: string; badge: string;
  badgeColor: 'slate' | 'emerald' | 'purple' | 'violet'; onClick: () => void;
}) {
  const borderColor = active
    ? badgeColor === 'emerald' ? 'border-emerald-500/60 bg-emerald-900/20'
    : badgeColor === 'purple' ? 'border-purple-500/60 bg-purple-900/20'
    : badgeColor === 'violet' ? 'border-violet-500/60 bg-violet-900/20'
    : 'border-slate-500/60 bg-slate-800/40'
    : 'border-slate-700/60 bg-slate-800/40';

  return (
    <button onClick={onClick}
      className={`p-3 rounded-2xl border text-left transition-all active:scale-[0.97] ${borderColor}`}
      style={{ WebkitTapHighlightColor: 'transparent' }}>
      <div className="font-bold text-sm text-white mb-0.5">{title}</div>
      <div className="text-[10px] text-slate-400 mb-2 leading-snug">{subtitle}</div>
      <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${
        badgeColor === 'emerald' ? 'bg-emerald-900/40 text-emerald-400 border-emerald-700/40'
        : badgeColor === 'purple' ? 'bg-purple-900/40 text-purple-400 border-purple-700/40'
        : badgeColor === 'violet' ? 'bg-violet-900/40 text-violet-400 border-violet-700/40'
        : 'bg-slate-800/60 text-slate-500 border-slate-700/40'
      }`}>
        {badge}
      </span>
      {active && (
        <div className={`mt-2 text-xs font-bold ${
          badgeColor === 'emerald' ? 'text-emerald-400'
          : badgeColor === 'purple' ? 'text-purple-400'
          : badgeColor === 'violet' ? 'text-violet-400'
          : 'text-slate-400'
        }`}>✓ Активен</div>
      )}
    </button>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-800 rounded-lg p-2 text-center">
      <span className="text-slate-500 block text-[10px]">{label}</span>
      <span className="text-slate-300 font-bold text-xs">{value}</span>
    </div>
  );
}

function SliderRow({ label, min, max, step, value, onChange }: {
  label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm text-slate-300">{label}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))} className="w-full cursor-pointer" />
      <div className="flex justify-between text-xs text-slate-600 mt-1">
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-indigo-500' : 'bg-slate-600'}`}
      style={{ WebkitTapHighlightColor: 'transparent' }}>
      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-md transition-transform ${value ? 'translate-x-7' : 'translate-x-1'}`} />
    </button>
  );
}

function VoiceSelect({ label, voices, value, onChange }: {
  label: string; voices: SpeechSynthesisVoice[]; value: string | null; onChange: (v: string | null) => void;
}) {
  const isPremium = (v: SpeechSynthesisVoice) =>
    /premium|enhanced|siri|google/i.test(v.name + ' ' + (v.voiceURI || ''));

  return (
    <div className="bg-slate-800/60 rounded-2xl border border-slate-700/40 px-4 py-3">
      <label className="block text-xs text-slate-400 mb-2 font-medium">{label}</label>
      <select value={value || ''} onChange={e => onChange(e.target.value || null)}
        className="w-full bg-slate-700 text-white border border-slate-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
        style={{ fontSize: '16px' }}>
        <option value="">🎲 Автовыбор</option>
        {voices.map(v => (
          <option key={v.name} value={v.name}>
            {isPremium(v) ? '⭐' : v.localService ? '📱' : '☁️'} {v.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function ELVoiceSelect({ label, value, onChange }: {
  label: string; value: string; onChange: (id: string) => void;
}) {
  return (
    <div className="bg-slate-800/60 rounded-2xl border border-slate-700/40 px-4 py-3">
      <label className="block text-xs text-slate-400 mb-2 font-medium">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-slate-700 text-white border border-slate-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
        style={{ fontSize: '16px' }}>
        {EL_VOICE_PRESETS.map(v => (
          <option key={v.id} value={v.id}>
            {v.gender === 'female' ? '👩' : '👨'} {v.name} ({v.langs.slice(0,4).join(', ')})
          </option>
        ))}
        {!EL_VOICE_PRESETS.find(p => p.id === value) && value && (
          <option value={value}>📎 {value.slice(0, 24)}...</option>
        )}
      </select>
      <div className="mt-2 relative">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Или вставьте свой Voice ID..."
          className="w-full bg-slate-800 border border-slate-700/60 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-violet-500"
          style={{ fontSize: '14px' }}
        />
      </div>
    </div>
  );
}
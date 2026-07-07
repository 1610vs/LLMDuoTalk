import { LANGUAGES } from './LanguageSelector';

export interface DialogEntry {
  id: string;
  speaker: 'A' | 'B';
  original: string;
  translated: string;
  fromLang: string;
  toLang: string;
  timestamp: Date;
  apiUsed?: string;
  ttsEngine?: string;
}

interface DialogBubbleProps {
  entry: DialogEntry;
  onRepeat: (entry: DialogEntry) => void;
  isRepeating?: boolean;
}

export function DialogBubble({ entry, onRepeat, isRepeating = false }: DialogBubbleProps) {
  const isA = entry.speaker === 'A';
  const fromLang = LANGUAGES.find(l => l.code === entry.fromLang);
  const toLang = LANGUAGES.find(l => l.code === entry.toLang);
  const timeStr = entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`flex flex-col mb-4 ${isA ? 'items-start' : 'items-end'}`}>
      {/* Speaker label */}
      <div className={`flex items-center gap-1.5 mb-1.5 ${isA ? 'flex-row' : 'flex-row-reverse'}`}>
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shadow-lg ${
          isA
            ? 'bg-gradient-to-br from-indigo-500 to-blue-600'
            : 'bg-gradient-to-br from-emerald-500 to-teal-600'
        }`}>
          {entry.speaker}
        </div>
        <span className="text-[10px] text-slate-600">{timeStr}</span>
        {fromLang && <span className="text-sm">{fromLang.flag}</span>}
        <span className="text-[10px] text-slate-700">→</span>
        {toLang && <span className="text-sm">{toLang.flag}</span>}
        {entry.apiUsed && (
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
            entry.apiUsed === 'openrouter'
              ? 'bg-purple-900/40 text-purple-400 border border-purple-700/30'
              : 'bg-slate-800/60 text-slate-600 border border-slate-700/30'
          }`}>
            {entry.apiUsed === 'openrouter' ? '🤖 LLM' : entry.apiUsed}
          </span>
        )}
      </div>

      {/* Bubble */}
      <div className={`max-w-[88%] rounded-2xl shadow-lg overflow-hidden ${isA ? 'rounded-tl-sm' : 'rounded-tr-sm'}`}>
        {/* Original */}
        <div className="px-4 pt-3 pb-2 text-sm text-slate-300 border-b bg-slate-800/90 border-slate-700/60">
          <span className="text-[9px] text-slate-600 block mb-0.5 uppercase tracking-wider">
            {fromLang?.name || entry.fromLang}
          </span>
          <span className="leading-snug">{entry.original}</span>
        </div>
        {/* Translated */}
        <div className={`px-4 pt-2.5 pb-3 text-base font-medium leading-snug ${
          isA
            ? 'bg-gradient-to-br from-indigo-950/80 to-blue-950/80 text-blue-100'
            : 'bg-gradient-to-br from-emerald-950/80 to-teal-950/80 text-emerald-100'
        }`}>
          <span className="text-[9px] opacity-40 block mb-0.5 uppercase tracking-wider">
            {toLang?.name || entry.toLang}
          </span>
          {entry.translated}
        </div>
      </div>

      {/* Actions */}
      <div className={`flex items-center gap-2 mt-1.5 ${isA ? 'flex-row' : 'flex-row-reverse'}`}>
        <button
          onClick={() => onRepeat(entry)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all active:scale-95 ${
            isRepeating
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
              : 'bg-slate-800/70 text-slate-500 border border-slate-700/40 active:text-slate-200'
          }`}
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          {isRepeating ? (
            <><span className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin" /><span>Звучит...</span></>
          ) : (
            <><span>🔊</span><span>Повтор</span></>
          )}
        </button>
        {entry.ttsEngine && (
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${
            entry.ttsEngine === 'elevenlabs'
              ? 'bg-violet-900/30 text-violet-500 border-violet-800/30'
              : 'text-slate-700 border-slate-800'
          }`}>
            {entry.ttsEngine === 'elevenlabs' ? '🎙 EL' : '🔊 WS'}
          </span>
        )}
      </div>
    </div>
  );
}

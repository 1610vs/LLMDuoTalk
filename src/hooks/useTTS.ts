// Hybrid TTS: ElevenLabs Flash v2.5 + Web Speech API fallback
import { useCallback, useEffect, useRef, useState } from 'react';

export type TTSEngine = 'web-speech' | 'elevenlabs';

export interface TTSSettings {
  rate: number;       // 0.5–2.0 (Web Speech only)
  pitch: number;      // 0.5–2.0 (Web Speech only)
  volume: number;     // 0–1.0
  preferFemale: boolean;
  engine: TTSEngine;
  elevenLabsKey: string;
  voiceIdA: string;   // ElevenLabs voice ID for speaker A target
  voiceIdB: string;   // ElevenLabs voice ID for speaker B target
  stability: number;       // EL: 0–1
  similarityBoost: number; // EL: 0–1
}

export const DEFAULT_TTS: TTSSettings = {
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  preferFemale: true,
  engine: 'web-speech',
  elevenLabsKey: '',
  voiceIdA: '21m00Tcm4TlvDq8ikWAM', // Rachel (EN, multilingual)
  voiceIdB: 'AZnzlk1XvdvUeBnXmlld', // Bella
  stability: 0.50,
  similarityBoost: 0.75,
};

// Curated ElevenLabs voice presets per language
export interface ELVoicePreset {
  id: string;
  name: string;
  gender: 'female' | 'male';
  langs: string[]; // BCP-47 prefixes
}

export const EL_VOICE_PRESETS: ELVoicePreset[] = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel',   gender: 'female', langs: ['en', 'ru', 'uk', 'ro', 'de', 'fr', 'es', 'it', 'pt', 'pl', 'nl', 'tr'] },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Bella',    gender: 'female', langs: ['en', 'ru', 'de', 'fr', 'es'] },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah',    gender: 'female', langs: ['en', 'ru', 'uk', 'de', 'fr', 'es', 'it', 'pt', 'pl', 'tr'] },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda',  gender: 'female', langs: ['en', 'de', 'fr', 'it'] },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily',     gender: 'female', langs: ['en', 'fr', 'de', 'pl', 'uk'] },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni',   gender: 'male',   langs: ['en', 'ru', 'de', 'pl'] },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold',   gender: 'male',   langs: ['en', 'de', 'fr', 'es'] },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam',     gender: 'male',   langs: ['en', 'ru', 'uk', 'ro', 'de', 'fr', 'es', 'it', 'pt', 'pl', 'tr'] },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam',      gender: 'male',   langs: ['en', 'ru', 'uk', 'de', 'fr', 'es', 'nl'] },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel',   gender: 'male',   langs: ['en', 'de', 'fr', 'cs', 'sk', 'hu'] },
];

export function isTTSSupported(): boolean {
  return 'speechSynthesis' in window;
}

function getWebVoicesForLang(
  lang: string,
  preferFemale: boolean,
  all: SpeechSynthesisVoice[]
): SpeechSynthesisVoice[] {
  const lc = lang.toLowerCase();
  const prefix = lc.split('-')[0];
  let voices = all.filter(v => v.lang.toLowerCase() === lc);
  if (!voices.length) voices = all.filter(v => v.lang.toLowerCase().startsWith(prefix));
  if (!voices.length) return [];

  const femaleKw = ['female','woman','girl','zira','hazel','susan','kate','karen','samantha',
    'victoria','fiona','moira','tessa','veena','yelena','alice','amelie','anna','ioana',
    'andreea','milena','dariya','luciana'];
  const maleKw = ['male','man','guy','daniel','alex','fred','jorge','diego','tarik','luca',
    'thomas','nicolas','reed','nikos'];
  const kw = preferFemale ? femaleKw : maleKw;
  const gendered = voices.filter(v => kw.some(k => v.name.toLowerCase().includes(k)));
  return gendered.length ? gendered : voices;
}

export function useTTS(settings: TTSSettings) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const androidIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceOverrideRef = useRef<string | null>(null);
  const settingsRef = useRef(settings);

  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // Load Web Speech voices
  useEffect(() => {
    if (!isTTSSupported()) return;
    let attempts = 0;

    const load = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) { setVoices(v); setIsLoaded(true); return true; }
      return false;
    };
    if (load()) return;

    const handler = () => { load(); };
    window.speechSynthesis.addEventListener('voiceschanged', handler);
    const iv = setInterval(() => { attempts++; if (load() || attempts >= 15) clearInterval(iv); }, 300);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', handler);
      clearInterval(iv);
    };
  }, []);

  const setVoiceOverride = useCallback((name: string | null) => {
    voiceOverrideRef.current = name;
  }, []);

  // ── ElevenLabs TTS ─────────────────────────────────────────────────────────
  const speakElevenLabs = useCallback(async (
    text: string,
    voiceId: string,
    apiKey: string
  ): Promise<void> => {
    const s = settingsRef.current;
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?optimize_streaming_latency=3`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_flash_v2_5',
        voice_settings: {
          stability: s.stability,
          similarity_boost: s.similarityBoost,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`ElevenLabs HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.volume = s.volume;
    currentAudioRef.current = audio;

    return new Promise<void>((resolve, reject) => {
      audio.onended = () => { URL.revokeObjectURL(url); currentAudioRef.current = null; resolve(); };
      audio.onerror = (e) => { URL.revokeObjectURL(url); currentAudioRef.current = null; reject(e); };
      audio.play().catch(reject);
    });
  }, []);

  // ── Web Speech TTS ──────────────────────────────────────────────────────────
  const speakWebSpeech = useCallback((text: string, lang: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const s = settingsRef.current;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = s.rate;
      utterance.pitch = s.pitch;
      utterance.volume = s.volume;
      utterance.lang = lang;

      const all = window.speechSynthesis.getVoices();
      if (voiceOverrideRef.current) {
        const ov = all.find(v => v.name === voiceOverrideRef.current);
        if (ov) utterance.voice = ov;
      } else {
        const best = getWebVoicesForLang(lang, s.preferFemale, all);
        if (best.length) utterance.voice = best[0];
      }

      utterance.onstart = () => {
        setIsSpeaking(true);
        if (/Android/.test(navigator.userAgent)) {
          androidIntervalRef.current = setInterval(() => {
            if (window.speechSynthesis.paused) window.speechSynthesis.resume();
          }, 500);
        }
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        if (androidIntervalRef.current) { clearInterval(androidIntervalRef.current); androidIntervalRef.current = null; }
        resolve();
      };

      utterance.onerror = (e) => {
        setIsSpeaking(false);
        if (androidIntervalRef.current) { clearInterval(androidIntervalRef.current); androidIntervalRef.current = null; }
        if (e.error === 'interrupted' || e.error === 'canceled') resolve();
        else reject(new Error(`TTS error: ${e.error}`));
      };

      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      setTimeout(() => {
        try { window.speechSynthesis.speak(utterance); }
        catch (err) { setIsSpeaking(false); reject(err); }
      }, isIOS ? 100 : 0);
    });
  }, []);

  // ── Public speak ────────────────────────────────────────────────────────────
  const speak = useCallback(async (
    text: string,
    lang: string,
    isSpeakerA?: boolean
  ): Promise<void> => {
    if (!text.trim()) return;
    const s = settingsRef.current;

    if (s.engine === 'elevenlabs' && s.elevenLabsKey) {
      setIsSpeaking(true);
      try {
        const voiceId = isSpeakerA !== undefined
          ? (isSpeakerA ? s.voiceIdA : s.voiceIdB)
          : s.voiceIdA;
        await speakElevenLabs(text, voiceId, s.elevenLabsKey);
        setIsSpeaking(false);
        return;
      } catch (err) {
        console.warn('[TTS] ElevenLabs failed, falling back to Web Speech:', err);
        setIsSpeaking(false);
        if (window.speechSynthesis) window.speechSynthesis.cancel();
      }
    }

    // Web Speech fallback
    if (!isTTSSupported()) throw new Error('TTS не поддерживается');
    window.speechSynthesis.cancel();
    await speakWebSpeech(text, lang);
  }, [speakElevenLabs, speakWebSpeech]);

  const stop = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if (isTTSSupported()) window.speechSynthesis.cancel();
    setIsSpeaking(false);
    if (androidIntervalRef.current) { clearInterval(androidIntervalRef.current); androidIntervalRef.current = null; }
  }, []);

  return { isSpeaking, speak, stop, voices, isLoaded, setVoiceOverride };
}

// Web Speech API ASR hook with mobile workarounds
import { useCallback, useEffect, useRef, useState } from 'react';

export function isASRSupported(): boolean {
  return !!(
    (window as unknown as Record<string, unknown>).SpeechRecognition ||
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition
  );
}

type SpeechRecognitionType = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionErrorEvent {
  error: string;
  message: string;
}

function createRecognition(): SpeechRecognitionType | null {
  const W = window as unknown as Record<string, unknown>;
  const SR =
    (W.SpeechRecognition as new () => SpeechRecognitionType) ||
    (W.webkitSpeechRecognition as new () => SpeechRecognitionType);
  if (!SR) return null;
  return new SR();
}

export interface UseASROptions {
  lang: string;
  onResult: (text: string) => void;
  onInterim: (text: string) => void;
  onError: (err: string) => void;
  onEnd: () => void;
}

export function useASR({ lang, onResult, onInterim, onError, onEnd }: UseASROptions) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionType | null>(null);
  const isListeningRef = useRef(false);
  const finalTextRef = useRef('');

  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) { /* ignore */ }
    }
    setIsListening(false);
  }, []);

  const start = useCallback(() => {
    if (isListeningRef.current) return;

    const rec = createRecognition();
    if (!rec) {
      onError('Web Speech API не поддерживается в этом браузере');
      return;
    }

    finalTextRef.current = '';
    recognitionRef.current = rec;

    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setIsListening(true);
      isListeningRef.current = true;
    };

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = finalTextRef.current;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          final += (final ? ' ' : '') + transcript;
          finalTextRef.current = final;
        } else {
          interim += transcript;
        }
      }
      onInterim(interim || final);
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.warn('[ASR] Error:', event.error);
      if (event.error === 'no-speech') { setIsListening(false); onEnd(); return; }
      if (event.error === 'aborted') { setIsListening(false); return; }
      const msgs: Record<string, string> = {
        'network': 'Ошибка сети. Проверьте интернет-соединение.',
        'not-allowed': 'Нет доступа к микрофону. Разрешите в настройках браузера.',
        'service-not-allowed': 'Сервис распознавания речи недоступен.',
        'audio-capture': 'Микрофон не найден.',
        'language-not-supported': `Язык ${lang} не поддерживается.`,
      };
      onError(msgs[event.error] || `Ошибка ASR: ${event.error}`);
      setIsListening(false);
    };

    rec.onend = () => {
      setIsListening(false);
      isListeningRef.current = false;
      const finalText = finalTextRef.current;
      if (finalText.trim()) onResult(finalText.trim());
      else onEnd();
      finalTextRef.current = '';
    };

    try {
      rec.start();
    } catch (err) {
      console.error('[ASR] start() failed:', err);
      onError('Не удалось запустить распознавание. Попробуйте ещё раз.');
      setIsListening(false);
    }
  }, [lang, onResult, onInterim, onError, onEnd]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (_) { /* ignore */ }
      }
    };
  }, []);

  return { isListening, start, stop };
}

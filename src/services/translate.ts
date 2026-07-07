// Translation service — hybrid: OpenRouter LLM + MyMemory/Lingva fallback

export type TranslateAPI = 'mymemory' | 'lingva' | 'libretranslate' | 'openrouter';

export interface TranslateResult {
  text: string;
  api: TranslateAPI | 'none';
}

const TIMEOUT_MS = 20000;

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
  );
}

async function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  return Promise.race([fetch(url, options), timeout(TIMEOUT_MS)]) as Promise<Response>;
}

function chunkText(text: string, maxLen = 450): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let current = '';
  const words = text.split(' ');
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxLen) {
      if (current) chunks.push(current.trim());
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

// ── MyMemory ─────────────────────────────────────────────────────────────────
async function translateMyMemory(text: string, from: string, to: string): Promise<string> {
  const chunks = chunkText(text);
  const results: string[] = [];
  for (const chunk of chunks) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${from}|${to}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
    const data = await res.json();
    if (data.responseStatus === 429) throw new Error('MyMemory rate limit');
    if (data.responseStatus !== 200) throw new Error(`MyMemory error: ${data.responseDetails}`);
    results.push(data.responseData.translatedText);
  }
  return results.join(' ');
}

// ── Lingva ───────────────────────────────────────────────────────────────────
async function translateLingva(text: string, from: string, to: string): Promise<string> {
  const fromCode = from.split('-')[0];
  const toCode = to.split('-')[0];
  const chunks = chunkText(text);
  const results: string[] = [];
  for (const chunk of chunks) {
    const url = `https://lingva.ml/api/v1/${fromCode}/${toCode}/${encodeURIComponent(chunk)}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`Lingva HTTP ${res.status}`);
    const data = await res.json();
    if (!data.translation) throw new Error('Lingva: no translation');
    results.push(data.translation);
  }
  return results.join(' ');
}

// ── LibreTranslate ───────────────────────────────────────────────────────────
async function translateLibre(text: string, from: string, to: string): Promise<string> {
  const fromCode = from.split('-')[0];
  const toCode = to.split('-')[0];
  const chunks = chunkText(text);
  const results: string[] = [];
  for (const chunk of chunks) {
    const res = await fetchWithTimeout('https://libretranslate.com/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: chunk, source: fromCode, target: toCode, format: 'text' }),
    });
    if (!res.ok) throw new Error(`LibreTranslate HTTP ${res.status}`);
    const data = await res.json();
    if (!data.translatedText) throw new Error('LibreTranslate: no translation');
    results.push(data.translatedText);
  }
  return results.join(' ');
}

// ── OpenRouter LLM ───────────────────────────────────────────────────────────
const LANG_NAMES: Record<string, string> = {
  en: 'English', ru: 'Russian', uk: 'Ukrainian', ro: 'Romanian',
  de: 'German', fr: 'French', es: 'Spanish', it: 'Italian',
  pt: 'Portuguese', pl: 'Polish', nl: 'Dutch', sv: 'Swedish',
  nb: 'Norwegian', da: 'Danish', fi: 'Finnish', tr: 'Turkish',
  cs: 'Czech', sk: 'Slovak', bg: 'Bulgarian', hr: 'Croatian',
  sr: 'Serbian', hu: 'Hungarian', el: 'Greek', lt: 'Lithuanian',
  lv: 'Latvian', et: 'Estonian',
};

export async function translateOpenRouter(
  text: string,
  from: string,
  to: string,
  apiKey: string
): Promise<string> {
  const fromCode = from.split('-')[0];
  const toCode = to.split('-')[0];
  const fromName = LANG_NAMES[fromCode] || fromCode;
  const toName = LANG_NAMES[toCode] || toCode;

  const res = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': 'VoiceSwap Translator',
    },
    body: JSON.stringify({
      model: 'deepseek/deepseek-chat-v3-0324:free',
      messages: [
        {
          role: 'system',
          content: `You are an expert conversational translator specializing in spoken, natural language.
Translate from ${fromName} to ${toName}.

Rules:
- Match the exact register and tone (slang→slang, formal→formal, casual→casual).
- Translate idioms into culturally equivalent expressions in the target language — NEVER literal.
- Optimized for spoken voice communication — natural rhythm, contractions allowed.
- Output ONLY the translated text. No quotes, no explanations, no notes, no alternatives.`,
        },
        { role: 'user', content: text },
      ],
      temperature: 0.2,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`OpenRouter HTTP ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const result = data.choices?.[0]?.message?.content?.trim();
  if (!result) throw new Error('OpenRouter: empty response');
  return result;
}

// ── Main translate ───────────────────────────────────────────────────────────
export async function translate(
  text: string,
  from: string,
  to: string,
  preferredApi: TranslateAPI = 'mymemory',
  openRouterKey?: string
): Promise<TranslateResult> {
  if (!text.trim()) return { text: '', api: 'none' };

  // If OpenRouter selected and key provided — try it first
  if (preferredApi === 'openrouter' && openRouterKey) {
    try {
      const translated = await translateOpenRouter(text, from, to, openRouterKey);
      return { text: translated, api: 'openrouter' };
    } catch (err) {
      console.warn('[translate] OpenRouter failed, falling back:', err);
      // Fall through to free APIs
    }
  }

  // Free API chain
  const freeApis: Array<{ name: TranslateAPI; fn: () => Promise<string> }> = [
    { name: 'mymemory', fn: () => translateMyMemory(text, from, to) },
    { name: 'lingva', fn: () => translateLingva(text, from, to) },
    { name: 'libretranslate', fn: () => translateLibre(text, from, to) },
  ];

  // If non-OpenRouter preferred, put it first
  const preferred = preferredApi !== 'openrouter' ? preferredApi : 'mymemory';
  const ordered = [
    ...freeApis.filter(a => a.name === preferred),
    ...freeApis.filter(a => a.name !== preferred),
  ];

  let lastError: Error | null = null;
  for (const api of ordered) {
    try {
      const translated = await api.fn();
      return { text: translated, api: api.name };
    } catch (err) {
      lastError = err as Error;
      console.warn(`[translate] ${api.name} failed:`, err);
    }
  }

  throw lastError || new Error('All translation APIs failed');
}

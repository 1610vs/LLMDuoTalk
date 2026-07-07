export interface Language {
  code: string;
  name: string;
  flag: string;
}

export const LANGUAGES: Language[] = [
  { code: 'en-US', name: 'English (US)',  flag: '🇺🇸' },
  { code: 'en-GB', name: 'English (UK)',  flag: '🇬🇧' },
  { code: 'ru-RU', name: 'Русский',       flag: '🏳️' },
  { code: 'uk-UA', name: 'Українська',    flag: '🇺🇦' },
  { code: 'ro-RO', name: 'Română',        flag: '🇷🇴' },
  { code: 'el-GR', name: 'Ελληνικά',     flag: '🇬🇷' },
  { code: 'hu-HU', name: 'Magyar',        flag: '🇭🇺' },
  { code: 'lt-LT', name: 'Lietuvių',     flag: '🇱🇹' },
  { code: 'fr-FR', name: 'Français',     flag: '🇫🇷' },
  { code: 'de-DE', name: 'Deutsch',       flag: '🇩🇪' },
  { code: 'it-IT', name: 'Italiano',      flag: '🇮🇹' },
  { code: 'es-ES', name: 'Español',      flag: '🇪🇸' },
  { code: 'pt-PT', name: 'Português',    flag: '🇵🇹' },
  { code: 'pl-PL', name: 'Polski',        flag: '🇵🇱' },
  { code: 'fi-FI', name: 'Suomi',         flag: '🇫🇮' },
  { code: 'tr-TR', name: 'Türkçe',       flag: '🇹🇷' },
  { code: 'nl-NL', name: 'Nederlands',    flag: '🇳🇱' },
  { code: 'sv-SE', name: 'Svenska',       flag: '🇸🇪' },
  { code: 'nb-NO', name: 'Norsk',         flag: '🇳🇴' },
  { code: 'da-DK', name: 'Dansk',         flag: '🇩🇰' },
  { code: 'cs-CZ', name: 'Čeština',      flag: '🇨🇿' },
  { code: 'sk-SK', name: 'Slovenčina',   flag: '🇸🇰' },
  { code: 'bg-BG', name: 'Български',   flag: '🇧🇬' },
  { code: 'hr-HR', name: 'Hrvatski',      flag: '🇭🇷' },
  { code: 'sr-RS', name: 'Српски',       flag: '🇷🇸' },
  { code: 'lv-LV', name: 'Latviešu',    flag: '🇱🇻' },
  { code: 'et-EE', name: 'Eesti',         flag: '🇪🇪' },
];

interface LanguageSelectorProps {
  value: string;
  onChange: (code: string) => void;
  label?: string;
  className?: string;
}

export function LanguageSelector({ value, onChange, label, className = '' }: LanguageSelectorProps) {
  const selected = LANGUAGES.find(l => l.code === value);
  return (
    <div className={`relative ${className}`}>
      {label && (
        <span className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-widest">
          {label}
        </span>
      )}
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full appearance-none bg-slate-800 text-white border border-slate-600/70 rounded-xl px-3 py-2.5 pr-9 text-sm font-medium focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 cursor-pointer"
          style={{ fontSize: '16px' }}
        >
          {LANGUAGES.map(lang => (
            <option key={lang.code} value={lang.code}>
              {lang.flag} {lang.name}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      {selected && (
        <div className="mt-1 text-center text-xl" aria-hidden="true">{selected.flag}</div>
      )}
    </div>
  );
}

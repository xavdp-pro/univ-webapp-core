import { useI18n } from '../i18n/I18nProvider'
import { SUPPORTED_LOCALES } from '../i18n'

/** Two-language toggle. With more locales, replace by a <Select>. */
export default function LanguageSwitcher({ className = '' }) {
  const { locale, setLocale, t } = useI18n()
  return (
    <div className={`inline-flex overflow-hidden rounded-lg border border-line ${className}`} role="group" aria-label={t('language.switch')}>
      {SUPPORTED_LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLocale(code)}
          aria-pressed={code === locale}
          className={`h-9 px-2.5 text-xs font-semibold uppercase transition-colors ${
            code === locale ? 'bg-accent-soft text-accent' : 'bg-surface text-fg-muted hover:bg-surface-2'
          }`}
          title={t(`language.${code}`)}
        >
          {code}
        </button>
      ))}
    </div>
  )
}

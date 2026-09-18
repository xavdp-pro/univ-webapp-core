import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'

const STORAGE_KEY = 'theme'

function currentTheme() {
  return document.documentElement.classList.contains('theme-dark') ? 'dark' : 'light'
}

export function applyTheme(theme) {
  document.documentElement.classList.toggle('theme-dark', theme === 'dark')
  document.documentElement.classList.toggle('theme-light', theme !== 'dark')
}

/**
 * Light/dark switch. The tokens in src/index.css do the work; index.html applies
 * the saved choice before first paint so this component only keeps it in sync.
 */
export default function ThemeToggle({ className = '' }) {
  const { t } = useI18n()
  const [theme, setTheme] = useState(currentTheme)

  useEffect(() => {
    applyTheme(theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // storage unavailable
    }
  }, [theme])

  const dark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-fg-muted transition-colors hover:bg-surface-2 hover:text-accent ${className}`}
      title={dark ? t('theme.light') : t('theme.dark')}
      aria-label={dark ? t('theme.enableLight') : t('theme.enableDark')}
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  )
}

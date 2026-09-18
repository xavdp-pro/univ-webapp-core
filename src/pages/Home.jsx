import { useEffect, useState } from 'react'
import { Activity, Database, Radio } from 'lucide-react'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthProvider'
import { useI18n } from '../i18n/I18nProvider'

/** Placeholder home page: shows the session and the API health. Replace in a fork. */
export default function Home() {
  const { user } = useAuth()
  const { t } = useI18n()
  const [health, setHealth] = useState(null)

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ ok: false }))
  }, [])

  const dbUp = health?.db === 'up'

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black tracking-tight text-fg">{t('home.title')}</h1>
        <p className="mt-1 text-sm text-fg-muted">{t('home.connectedAs', { name: user?.name || user?.email })}</p>
      </header>

      <p className="max-w-2xl text-sm leading-relaxed text-fg-muted">{t('home.intro')}</p>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="min-w-0 rounded-xl border border-line bg-surface p-4">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-fg-faint">
            <Activity size={14} /> {t('home.health')}
          </p>
          <p className="mt-2 truncate font-mono text-sm text-fg">{health ? (health.ok ? 'ok' : 'down') : '…'}</p>
        </div>
        <div className="min-w-0 rounded-xl border border-line bg-surface p-4">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-fg-faint">
            <Database size={14} /> DB
          </p>
          <p className={`mt-2 text-sm font-medium ${dbUp ? 'text-success' : 'text-danger'}`}>{health ? t(dbUp ? 'home.dbUp' : 'home.dbDown') : '…'}</p>
        </div>
        <div className="min-w-0 rounded-xl border border-line bg-surface p-4">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-fg-faint">
            <Radio size={14} /> Socket.IO
          </p>
          <p className="mt-2 text-sm font-medium text-fg">{health ? t(health.realtime ? 'home.realtimeOn' : 'home.realtimeOff') : '…'}</p>
        </div>
      </section>

      {/* A <pre> inside a grid cell needs min-w-0 on the cell, or phones overflow sideways. */}
      <section className="grid gap-3 lg:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-line bg-surface p-4">
          <pre className="overflow-x-auto font-mono text-xs text-fg-muted">{JSON.stringify(health, null, 2)}</pre>
        </div>
      </section>
    </div>
  )
}

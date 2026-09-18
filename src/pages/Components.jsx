import { useState } from 'react'
import { useI18n } from '../i18n/I18nProvider'
import Select from '../components/ui/Select'
import SlideOver from '../components/ui/SlideOver'
import ConfirmModal from '../components/ui/ConfirmModal'
import { toast } from '../components/ui/ToastHost'

/** Living catalogue of the UI primitives. Delete it in a fork, or keep it as a style guide. */
export default function Components() {
  const { t } = useI18n()
  const [slideOpen, setSlideOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [shortValue, setShortValue] = useState('b')
  const [longValue, setLongValue] = useState(null)

  const shortOptions = ['a', 'b', 'c'].map((v) => ({ value: v, label: t('components.option', { n: v.toUpperCase() }) }))
  const longOptions = Array.from({ length: 40 }, (_, i) => ({ value: i + 1, label: t('components.option', { n: i + 1 }) }))

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black tracking-tight text-fg">{t('components.title')}</h1>
        <p className="mt-1 text-sm text-fg-muted">{t('components.intro')}</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2 rounded-xl border border-line bg-surface p-4">
          <label className="block text-xs font-bold uppercase tracking-wide text-fg-faint">{t('components.selectShort')}</label>
          <Select value={shortValue} onChange={setShortValue} options={shortOptions} />
        </div>
        <div className="min-w-0 space-y-2 rounded-xl border border-line bg-surface p-4">
          <label className="block text-xs font-bold uppercase tracking-wide text-fg-faint">{t('components.selectLong')}</label>
          <Select value={longValue} onChange={setLongValue} options={longOptions} clearable />
        </div>
      </section>

      <section className="flex flex-wrap gap-3">
        <button type="button" onClick={() => setSlideOpen(true)} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover">
          {t('components.openSlideOver')}
        </button>
        <button type="button" onClick={() => setConfirmOpen(true)} className="rounded-lg border border-danger/50 px-4 py-2 text-sm font-semibold text-danger hover:bg-danger-soft">
          {t('components.openConfirm')}
        </button>
        <button type="button" onClick={() => toast(t('components.toastSuccess'))} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-fg hover:bg-surface-2">
          {t('components.toastSuccess')}
        </button>
        <button type="button" onClick={() => toast(t('components.toastError'), { type: 'error' })} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-fg hover:bg-surface-2">
          {t('components.toastError')}
        </button>
      </section>

      <SlideOver isOpen={slideOpen} onClose={() => setSlideOpen(false)} title={t('components.slideOverTitle')}>
        <p className="text-sm text-fg-muted">{t('components.slideOverBody')}</p>
      </SlideOver>

      <ConfirmModal
        open={confirmOpen}
        title={t('components.confirmTitle')}
        message={t('components.confirmMessage')}
        confirmLabel={t('common.delete')}
        confirmationText="DELETE"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false)
          toast(t('components.confirmed'))
        }}
      />
    </div>
  )
}

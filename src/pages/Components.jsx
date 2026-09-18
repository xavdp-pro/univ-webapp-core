import { useState } from 'react'
import { useI18n } from '../i18n/I18nProvider'
import Select from '../components/ui/Select'
import SlideOver from '../components/ui/SlideOver'
import ConfirmModal from '../components/ui/ConfirmModal'
import Field from '../components/ui/Field'
import TextInput from '../components/ui/TextInput'
import TextArea from '../components/ui/TextArea'
import { Checkbox, Switch } from '../components/ui/Checkbox'
import { useForm } from '../components/ui/useForm'
import { email, maxLength, minLength, required } from '../components/ui/formValidators'
import { toast } from '../components/ui/ToastHost'

const DEMO_RULES = {
  name: [required(), minLength(2), maxLength(60)],
  email: [required(), email()],
  message: maxLength(200),
  accept: required('form.required', { checked: true }),
}

/** The form demo: local rules, a simulated ajax submit, errors under the fields. */
function FormDemo() {
  const { t, tError } = useI18n()
  const form = useForm({
    initialValues: { name: '', email: '', message: '', notify: true, accept: false },
    rules: DEMO_RULES,
    submit: (values) => new Promise((resolve) => setTimeout(() => resolve(values), 400)),
    onSuccess: (values) => {
      toast(t('components.formSent', { name: values.name }))
      form.reset()
    },
  })

  return (
    <section className="min-w-0 rounded-xl border border-line bg-surface p-4" data-demo="form">
      <h2 className="text-base font-bold text-fg">{t('components.formTitle')}</h2>
      <p className="mb-4 mt-1 text-xs text-fg-muted">{t('components.formIntro')}</p>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          form.handleSubmit(event)
        }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <Field label={t('components.formName')} hint={t('components.formNameHint')} error={form.error('name')} required>
          <TextInput {...form.field('name')} autoComplete="name" />
        </Field>
        <Field label={t('components.formEmail')} error={form.error('email')} required>
          <TextInput type="email" inputMode="email" autoComplete="email" {...form.field('email')} />
        </Field>
        <Field label={t('components.formMessage')} error={form.error('message')} className="sm:col-span-2">
          <TextArea rows={3} placeholder={t('components.formMessagePlaceholder')} {...form.field('message')} />
        </Field>
        <Field label={t('components.formNotify')} inline>
          <Switch {...form.field('notify')} />
        </Field>
        <Field label={t('components.formAccept')} error={form.error('accept')} inline required>
          <Checkbox {...form.field('accept')} />
        </Field>
        {form.submitError && (
          <p role="alert" className="rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-xs font-medium text-danger sm:col-span-2">
            {t('form.submitError', { reason: tError(form.submitError) })}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={form.submitting} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-60">
            {form.submitting ? t('form.saving') : t('components.formSubmit')}
          </button>
          <button type="button" onClick={() => form.reset()} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-fg hover:bg-surface-2">
            {t('components.formReset')}
          </button>
          <span className="text-xs text-fg-faint">{t('components.formDemoNote')}</span>
        </div>
      </form>
    </section>
  )
}

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

      <FormDemo />

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

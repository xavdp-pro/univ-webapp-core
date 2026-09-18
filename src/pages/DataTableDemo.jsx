import { useCallback, useMemo, useState } from 'react'
import { Archive, Trash2 } from 'lucide-react'
import { api } from '../api/client'
import { useI18n } from '../i18n/I18nProvider'
import DataTable from '../components/ui/DataTable'
import { toast } from '../components/ui/ToastHost'

const CATEGORIES = ['A', 'B', 'C', 'D']
const STATUSES = ['open', 'pending', 'closed']
const OUTCOMES = ['link_sent', 'not_authorized', 'send_failed', 'rate_limited', 'verify_ok', 'verify_unknown', 'verify_reused', 'verify_expired', 'verify_no_longer_authorized']

/** Small seeded generator so the demo rows are the same on every load. */
function seeded(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let x = Math.imul(s ^ (s >>> 15), 1 | s)
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

function makeDemoRows(count = 57) {
  const random = seeded(42)
  const start = Date.UTC(2026, 0, 1)
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    reference: `REF-${String(i + 1).padStart(4, '0')}`,
    label: `Item ${String.fromCharCode(65 + (i % 26))}${Math.floor(random() * 900 + 100)}`,
    category: CATEGORIES[Math.floor(random() * CATEGORIES.length)],
    status: STATUSES[Math.floor(random() * STATUSES.length)],
    amount: Math.round(random() * 250000) / 100,
    updatedAt: new Date(start + Math.floor(random() * 250) * 86_400_000).toISOString(),
  }))
}

const STATUS_CLASS = {
  open: 'bg-success-soft text-success',
  pending: 'bg-warning-soft text-warning',
  closed: 'bg-surface-2 text-fg-muted',
}

function Badge({ children, className = '' }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}>{children}</span>
}

/** Demo of DataTable in both modes. Delete it in a fork, or keep it as a reference. */
export default function DataTableDemo() {
  const { t, locale } = useI18n()
  const [rows, setRows] = useState(() => makeDemoRows())

  const money = useMemo(() => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }), [locale])
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }), [locale])
  const dateTimeFmt = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }), [locale])

  const clientColumns = useMemo(() => [
    { key: 'reference', header: 'dataTableDemo.reference', sortable: true, width: '9rem', mobile: 'primary', hideable: false },
    { key: 'label', header: 'dataTableDemo.label', sortable: true, mobile: 'secondary' },
    { key: 'category', header: 'dataTableDemo.category', sortable: true, width: '8rem', hideBelow: 'lg', render: (row) => t(`dataTableDemo.category${row.category}`), searchValue: (row) => t(`dataTableDemo.category${row.category}`) },
    {
      key: 'status',
      header: 'dataTableDemo.status',
      sortable: true,
      width: '8rem',
      render: (row) => <Badge className={STATUS_CLASS[row.status]}>{t(`dataTableDemo.status${row.status[0].toUpperCase()}${row.status.slice(1)}`)}</Badge>,
    },
    { key: 'amount', header: 'dataTableDemo.amount', sortable: true, align: 'right', width: '8rem', render: (row) => money.format(row.amount), searchable: false },
    { key: 'updatedAt', header: 'dataTableDemo.updatedAt', sortable: true, width: '8rem', hideBelow: 'xl', render: (row) => dateFmt.format(new Date(row.updatedAt)), searchable: false },
  ], [t, money, dateFmt])

  const clientFilters = useMemo(() => [
    { key: 'category', label: 'dataTableDemo.filterCategory', options: CATEGORIES.map((c) => ({ value: c, label: t(`dataTableDemo.category${c}`) })) },
    { key: 'status', label: 'dataTableDemo.filterStatus', options: STATUSES.map((s) => ({ value: s, label: t(`dataTableDemo.status${s[0].toUpperCase()}${s.slice(1)}`) })) },
  ], [t])

  const bulkActions = useMemo(() => [
    {
      key: 'archive',
      label: 'dataTableDemo.archive',
      icon: Archive,
      confirm: { title: 'dataTableDemo.archiveTitle', message: 'dataTableDemo.archiveMessage', confirmLabel: 'dataTableDemo.archive' },
      onAction: (selected) => toast(t('dataTableDemo.archived', { n: selected.length })),
    },
  ], [t])

  const rowActions = useMemo(() => [
    {
      key: 'delete',
      label: 'common.delete',
      icon: Trash2,
      danger: true,
      confirm: { title: 'dataTableDemo.deleteTitle', message: 'dataTableDemo.deleteMessage', confirmLabel: 'common.delete' },
      onAction: (row) => {
        setRows((current) => current.filter((r) => r.id !== row.id))
        toast(t('dataTableDemo.deleted'))
      },
    },
  ], [t])

  const serverColumns = useMemo(() => [
    { key: 'createdAt', header: 'dataTableDemo.createdAt', sortable: true, width: '10rem', render: (row) => (row.createdAt ? dateTimeFmt.format(new Date(row.createdAt)) : ''), mobile: 'secondary' },
    { key: 'email', header: 'dataTableDemo.email', sortable: true, mobile: 'primary', hideable: false },
    { key: 'outcome', header: 'dataTableDemo.outcome', sortable: true, width: '12rem', render: (row) => <Badge className={row.outcome === 'verify_ok' || row.outcome === 'link_sent' ? 'bg-success-soft text-success' : 'bg-surface-2 text-fg-muted'}>{row.outcome}</Badge> },
    { key: 'ip', header: 'dataTableDemo.ip', sortable: true, width: '9rem', hideBelow: 'lg' },
    { key: 'detail', header: 'dataTableDemo.detail', hideBelow: 'xl', mobile: 'hidden' },
  ], [dateTimeFmt])

  const serverFilters = useMemo(() => [
    { key: 'outcome', label: 'dataTableDemo.filterOutcome', options: OUTCOMES.map((o) => ({ value: o, label: o })) },
  ], [])

  const fetchAuthRequests = useCallback((params) => api.listAuthRequests(params), [])

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-black tracking-tight text-fg">{t('dataTableDemo.title')}</h1>
        <p className="mt-1 text-sm text-fg-muted">{t('dataTableDemo.intro')}</p>
      </header>

      <section className="min-w-0 space-y-3" data-demo="client">
        <div>
          <h2 className="text-base font-bold text-fg">{t('dataTableDemo.clientTitle')}</h2>
          <p className="text-xs text-fg-muted">{t('dataTableDemo.clientIntro')}</p>
        </div>
        <DataTable
          id="demo-client"
          columns={clientColumns}
          columnPicker
          rows={rows}
          rowKey="id"
          filters={clientFilters}
          defaultSort={{ key: 'reference', dir: 'asc' }}
          defaultPageSize={10}
          selectable
          bulkActions={bulkActions}
          rowActions={rowActions}
          onRowClick={(row) => toast(t('dataTableDemo.opened', { ref: row.reference }))}
        />
      </section>

      <section className="min-w-0 space-y-3" data-demo="server">
        <div>
          <h2 className="text-base font-bold text-fg">{t('dataTableDemo.serverTitle')}</h2>
          <p className="text-xs text-fg-muted">{t('dataTableDemo.serverIntro')}</p>
        </div>
        <DataTable
          id="demo-server"
          columns={serverColumns}
          columnPicker
          rowKey="id"
          fetcher={fetchAuthRequests}
          filters={serverFilters}
          defaultSort={{ key: 'createdAt', dir: 'desc' }}
          defaultPageSize={10}
        />
      </section>
    </div>
  )
}

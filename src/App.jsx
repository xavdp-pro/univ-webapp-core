import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { api } from './api/client'
import { AuthProvider } from './auth/AuthProvider'
import { I18nProvider, useI18n } from './i18n/I18nProvider'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Home from './pages/Home'
import Components from './pages/Components'
import DataTableDemo from './pages/DataTableDemo'
import { useRealtime } from './lib/realtime'

function Shell() {
  const { t } = useI18n()
  const [meta, setMeta] = useState({ appName: t('app.name'), realtimeEnabled: false })

  useEffect(() => {
    api.meta().then((m) => setMeta((prev) => ({ ...prev, ...m }))).catch(() => {})
  }, [])

  useEffect(() => {
    document.title = meta.appName
  }, [meta.appName])

  useRealtime(meta.realtimeEnabled)

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login appName={meta.appName} />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout appName={meta.appName} />}>
            <Route path="/" element={<Home />} />
            <Route path="/components" element={<Components />} />
            <Route path="/data-table" element={<DataTableDemo />} />
            {/* Business routes of a fork go here. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </I18nProvider>
  )
}

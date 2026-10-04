import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { BalancePage } from './pages/BalancePage'
import { ConectoresPage } from './pages/ConectoresPage'
import { HomePage } from './pages/HomePage'
import { PresupuestoPage } from './pages/PresupuestoPage'
import './styles.css'

const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="presupuesto" element={<PresupuestoPage />} />
          <Route path="balance" element={<BalancePage />} />
          <Route path="conectores" element={<ConectoresPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)

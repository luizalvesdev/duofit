import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthContext'
import { GuestOnly, RequireAuth } from './auth/guards'
import { AppLayout } from './components/AppLayout'
import './index.css'
import { AuthPage } from './pages/AuthPage'
import { HomePage } from './pages/HomePage'
import { ProfilePage } from './pages/ProfilePage'
import { BodyTab } from './pages/progress/BodyTab'
import { ExerciseProgressPage } from './pages/progress/ExerciseProgressPage'
import { HistoryTab } from './pages/progress/HistoryTab'
import { ProgressPage } from './pages/progress/ProgressPage'
import { RecordsTab } from './pages/progress/RecordsTab'
import { SessionDetailPage } from './pages/progress/SessionDetailPage'
import { SessionPage } from './pages/SessionPage'
import { TemplateEditorPage } from './pages/TemplateEditorPage'
import { WorkoutsPage } from './pages/WorkoutsPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<GuestOnly />}>
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/cadastro" element={<AuthPage mode="register" />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/treinos" element={<WorkoutsPage />} />
              <Route path="/progresso" element={<ProgressPage />}>
                <Route index element={<HistoryTab />} />
                <Route path="recordes" element={<RecordsTab />} />
                <Route path="corpo" element={<BodyTab />} />
              </Route>
            </Route>
            <Route path="/progresso/treino/:id" element={<SessionDetailPage />} />
            <Route path="/progresso/exercicio/:id" element={<ExerciseProgressPage />} />
            <Route path="/perfil" element={<ProfilePage />} />
            <Route path="/treinos/nova" element={<TemplateEditorPage />} />
            <Route path="/treinos/:id" element={<TemplateEditorPage />} />
            <Route path="/treino" element={<SessionPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

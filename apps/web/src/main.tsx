import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthContext'
import { GuestOnly, RequireAuth } from './auth/guards'
import { AppLayout } from './components/AppLayout'
import './index.css'
import { AuthPage } from './pages/AuthPage'
import { DietPage } from './pages/diet/DietPage'
import { MealsPage } from './pages/diet/MealsPage'
import { PlanPage } from './pages/diet/PlanPage'
import { DuoPage } from './pages/duo/DuoPage'
import { DietReviewPage } from './pages/ai/DietReviewPage'
import { QuestionnairePage } from './pages/ai/QuestionnairePage'
import { WeekReviewPage } from './pages/ai/WeekReviewPage'
import { WorkoutDraftPage } from './pages/ai/WorkoutDraftPage'
import { MemberExercisePage, MemberRecordsPage, MemberSessionPage } from './pages/duo/MemberRoutes'
import { MemberPage } from './pages/duo/MemberPage'
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordPages'
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
            <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
          </Route>
          {/* Outside GuestOnly: an e-mailed link must work even if another account is signed in on this device. */}
          <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/treinos" element={<WorkoutsPage />} />
              <Route path="/dieta" element={<DietPage />} />
              <Route path="/dupla" element={<DuoPage />} />
              <Route path="/progresso" element={<ProgressPage />}>
                <Route index element={<HistoryTab />} />
                <Route path="recordes" element={<RecordsTab />} />
                <Route path="corpo" element={<BodyTab />} />
              </Route>
            </Route>
            <Route path="/dieta/plano" element={<PlanPage />} />
            <Route path="/dieta/refeicoes" element={<MealsPage />} />
            <Route path="/dupla/:campaignId/:userId" element={<MemberPage />} />
            <Route path="/dupla/:campaignId/:userId/recordes" element={<MemberRecordsPage />} />
            <Route path="/dupla/:campaignId/:userId/treino/:id" element={<MemberSessionPage />} />
            <Route path="/dupla/:campaignId/:userId/exercicio/:id" element={<MemberExercisePage />} />
            <Route path="/progresso/treino/:id" element={<SessionDetailPage />} />
            <Route path="/progresso/exercicio/:id" element={<ExerciseProgressPage />} />
            <Route path="/ia/semana" element={<WeekReviewPage />} />
            <Route path="/ia/dieta" element={<DietReviewPage />} />
            <Route path="/ia/questionario" element={<QuestionnairePage />} />
            <Route path="/ia/treino" element={<WorkoutDraftPage />} />
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

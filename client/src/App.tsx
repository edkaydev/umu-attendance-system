import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { RequireAuth, RequireRole, DASHBOARD_BY_ROLE } from './components/RouteGuards'
import { AppLayout } from './components/Layout'
import { InstallPrompt } from './components/InstallPrompt'
import { CookieBanner } from './components/CookieBanner'

import Login from './pages/Login'
import AccessDenied from './pages/AccessDenied'
import ChangePassword from './pages/ChangePassword'
import ProfileSetup from './pages/ProfileSetup'
import StudentDashboard from './pages/StudentDashboard'
import StudentAttendance from './pages/StudentAttendance'
import LecturerDashboard from './pages/LecturerDashboard'
import SessionsList from './pages/SessionsList'
import OpenSession from './pages/OpenSession'
import LiveSession from './pages/LiveSession'
import SessionDetail from './pages/SessionDetail'
import FacultyAdminDashboard from './pages/FacultyAdminDashboard'
import FacultyAdminSessions from './pages/FacultyAdminSessions'
import FacultyUnits, { FacultyUserUnits } from './pages/FacultyUnits'
import ReportsPage from './pages/ReportsPage'
import SystemAdminDashboard from './pages/SystemAdminDashboard'
import AcademicSetup from './pages/AcademicSetup'
import UserManagement from './pages/UserManagement'
import ImportData from './pages/ImportData'
import SystemLogPage from './pages/SystemLogPage'
import GlobalSettings from './pages/GlobalSettings'
import ResetPasswordPage from './pages/ResetPasswordPage'
import UpdateSystemPage from './pages/UpdateSystemPage'
import NotFound from './pages/NotFound'

function HomeRedirect() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-umu-red border-t-transparent" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (user.mustChangePassword) return <Navigate to="/password/change" replace />
  if (!user.profileComplete) return <Navigate to="/profile/setup" replace />
  return <Navigate to={DASHBOARD_BY_ROLE[user.role]} replace state={{ from: location.pathname }} />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route path="/access-denied" element={<AccessDenied />} />
            <Route
              path="/profile/setup"
              element={
                <RequireAuth>
                  <ProfileSetup />
                </RequireAuth>
              }
            />

            {/* Force password change on first login */}
            <Route
              path="/password/change"
              element={
                <RequireAuth>
                  <ChangePassword />
                </RequireAuth>
              }
            />

            {/* Student */}
            <Route
              path="/student"
              element={
                <RequireAuth>
                  <RequireRole roles={['student']}>
                    <AppLayout>
                      <StudentDashboard />
                    </AppLayout>
                  </RequireRole>
                </RequireAuth>
              }
            />
            <Route
              path="/student/attendance"
              element={
                <RequireAuth>
                  <RequireRole roles={['student']}>
                    <AppLayout>
                      <StudentAttendance />
                    </AppLayout>
                  </RequireRole>
                </RequireAuth>
              }
            />
            <Route
              path="/student/profile"
              element={
                <RequireAuth>
                  <RequireRole roles={['student']}>
                    <AppLayout>
                      <ProfileSetup edit />
                    </AppLayout>
                  </RequireRole>
                </RequireAuth>
              }
            />

            {/* Lecturer */}
            <Route
              path="/lecturer"
              element={
                <RequireAuth>
                  <RequireRole roles={['lecturer']}>
                    <AppLayout>
                      <LecturerDashboard />
                    </AppLayout>
                  </RequireRole>
                </RequireAuth>
              }
            />
            <Route
              path="/lecturer/profile"
              element={
                <RequireAuth>
                  <RequireRole roles={['lecturer']}>
                    <AppLayout>
                      <ProfileSetup edit />
                    </AppLayout>
                  </RequireRole>
                </RequireAuth>
              }
            />
            <Route
              path="/lecturer/sessions"
              element={
                <RequireAuth>
                  <RequireRole roles={['lecturer']}>
                    <AppLayout>
                      <SessionsList />
                    </AppLayout>
                  </RequireRole>
                </RequireAuth>
              }
            />
            <Route
              path="/lecturer/sessions/new"
              element={
                <RequireAuth>
                  <RequireRole roles={['lecturer']}>
                    <AppLayout>
                      <OpenSession />
                    </AppLayout>
                  </RequireRole>
                </RequireAuth>
              }
            />
            <Route
              path="/lecturer/sessions/:sessionId"
              element={
                <RequireAuth>
                  <RequireRole roles={['lecturer']}>
                    <AppLayout>
                      <SessionDetail />
                    </AppLayout>
                  </RequireRole>
                </RequireAuth>
              }
            />
            <Route
              path="/lecturer/sessions/:sessionId/live"
              element={
                <RequireAuth>
                  <RequireRole roles={['lecturer']}>
                    <AppLayout>
                      <LiveSession />
                    </AppLayout>
                  </RequireRole>
                </RequireAuth>
              }
            />

            {/* Faculty Admin */}
            <Route
              path="/faculty-admin"
              element={
                <RequireAuth>
                  <RequireRole roles={['faculty_admin']}>
                    <AppLayout>
                      <FacultyAdminDashboard />
                    </AppLayout>
                  </RequireRole>
                </RequireAuth>
              }
            />
            <Route
              path="/faculty-admin/reports"
              element={
                <RequireAuth>
                  <RequireRole roles={['faculty_admin']}>
                    <AppLayout>
                      <ReportsPage />
                    </AppLayout>
                  </RequireRole>
                </RequireAuth>
              }
            />
            <Route
              path="/faculty-admin/units"
              element={
                <RequireAuth>
                  <RequireRole roles={['faculty_admin']}>
                    <AppLayout>
                      <FacultyUnits />
                    </AppLayout>
                  </RequireRole>
                </RequireAuth>
              }
            />
            <Route
              path="/faculty-admin/units/:userId"
              element={
                <RequireAuth>
                  <RequireRole roles={['faculty_admin']}>
                    <AppLayout>
                      <FacultyUserUnits />
                    </AppLayout>
                  </RequireRole>
                </RequireAuth>
              }
            />
            <Route
              path="/faculty-admin/sessions"
              element={
                <RequireAuth>
                  <RequireRole roles={['faculty_admin']}>
                    <AppLayout>
                      <FacultyAdminSessions />
                    </AppLayout>
                  </RequireRole>
                </RequireAuth>
              }
            />
            <Route
              path="/faculty-admin/sessions/:sessionId"
              element={
                <RequireAuth>
                  <RequireRole roles={['faculty_admin']}>
                    <AppLayout>
                      <SessionDetail />
                    </AppLayout>
                  </RequireRole>
                </RequireAuth>
              }
            />

            {/* System Admin */}
            <Route
              path="/system-admin"
              element={
                <RequireAuth>
                  <RequireRole roles={['system_admin']}>
                    <AppLayout>
                      <SystemAdminDashboard />
                    </AppLayout>
                  </RequireRole>
                </RequireAuth>
              }
            />
            <Route
              path="/system-admin/academic"
              element={
                <RequireAuth>
                  <RequireRole roles={['system_admin']}>
                    <AppLayout>
                      <AcademicSetup />
                    </AppLayout>
                  </RequireRole>
                </RequireAuth>
              }
            />
            <Route
              path="/system-admin/users"
              element={
                <RequireAuth>
                  <RequireRole roles={['system_admin']}>
                    <AppLayout>
                      <UserManagement />
                    </AppLayout>
                  </RequireRole>
                </RequireAuth>
              }
            />
            <Route
              path="/system-admin/reset-password"
              element={
                <RequireAuth>
                  <RequireRole roles={['system_admin']}>
                    <AppLayout>
                      <ResetPasswordPage />
                    </AppLayout>
                  </RequireRole>
                </RequireAuth>
              }
            />
            <Route
              path="/system-admin/imports"
              element={
                <RequireAuth>
                  <RequireRole roles={['system_admin']}>
                    <AppLayout>
                      <ImportData />
                    </AppLayout>
                  </RequireRole>
                </RequireAuth>
              }
            />
            <Route
              path="/system-admin/logs"
              element={
                <RequireAuth>
                  <RequireRole roles={['system_admin']}>
                    <AppLayout>
                      <SystemLogPage />
                    </AppLayout>
                  </RequireRole>
                </RequireAuth>
              }
            />
            <Route
              path="/system-admin/settings"
              element={
                <RequireAuth>
                  <RequireRole roles={['system_admin']}>
                    <AppLayout>
                      <GlobalSettings />
                    </AppLayout>
                  </RequireRole>
                </RequireAuth>
              }
            />
            <Route
              path="/system-admin/update"
              element={
                <RequireAuth>
                  <RequireRole roles={['system_admin']}>
                    <AppLayout>
                      <UpdateSystemPage />
                    </AppLayout>
                  </RequireRole>
                </RequireAuth>
              }
            />

            <Route path="*" element={<NotFound />} />
          </Routes>
          <InstallPrompt />
          <CookieBanner />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

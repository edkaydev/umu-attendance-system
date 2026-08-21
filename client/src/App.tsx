import { lazy, Suspense, useEffect } from 'react'
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

// Portal pages are loaded on demand so the sign-in experience does not download
// reports, charts, and administration tools that the user may never open.
const StudentDashboard = lazy(() => import('./pages/StudentDashboard'))
const StudentAttendance = lazy(() => import('./pages/StudentAttendance'))
const LecturerDashboard = lazy(() => import('./pages/LecturerDashboard'))
const SessionsList = lazy(() => import('./pages/SessionsList'))
const OpenSession = lazy(() => import('./pages/OpenSession'))
const LiveSession = lazy(() => import('./pages/LiveSession'))
const SessionDetail = lazy(() => import('./pages/SessionDetail'))
const FacultyAdminDashboard = lazy(() => import('./pages/FacultyAdminDashboard'))
const FacultyAdminSessions = lazy(() => import('./pages/FacultyAdminSessions'))
const FacultyUnits = lazy(() => import('./pages/FacultyUnits'))
const FacultyUserUnits = lazy(() => import('./pages/FacultyUnits').then((module) => ({ default: module.FacultyUserUnits })))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const SystemAdminDashboard = lazy(() => import('./pages/SystemAdminDashboard'))
const AcademicSetup = lazy(() => import('./pages/AcademicSetup'))
const UserManagement = lazy(() => import('./pages/UserManagement'))
const ImportData = lazy(() => import('./pages/ImportData'))
const SystemLogPage = lazy(() => import('./pages/SystemLogPage'))
const GlobalSettings = lazy(() => import('./pages/GlobalSettings'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))

const NotFound = lazy(() => import('./pages/NotFound'))

function RouteLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3" role="status" aria-live="polite">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-umu-red border-t-transparent" />
      <p className="text-body-sm text-text-secondary">Loading page…</p>
    </div>
  )
}

function HomeRedirect() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3" role="status" aria-live="polite">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-umu-red border-t-transparent" />
        <p className="text-body-sm text-text-secondary">Loading UMU Attendance…</p>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (user.mustChangePassword) return <Navigate to="/password/change" replace />
  if (!user.profileComplete) return <Navigate to="/profile/setup" replace />
  return <Navigate to={DASHBOARD_BY_ROLE[user.role]} replace state={{ from: location.pathname }} />
}

function DocumentTitle() {
  const { pathname } = useLocation()

  useEffect(() => {
    const title =
      pathname === '/login' ? 'Sign in' :
      pathname === '/access-denied' ? 'Access denied' :
      pathname === '/profile/setup' ? 'Set up profile' :
      pathname === '/password/change' ? 'Change password' :
      pathname === '/student' ? 'Student dashboard' :
      pathname === '/student/attendance' ? 'My attendance' :
      pathname === '/student/profile' ? 'My profile' :
      pathname.startsWith('/lecturer/sessions/new') ? 'Open session' :
      pathname.endsWith('/live') ? 'Live session' :
      pathname.startsWith('/lecturer/sessions/') ? 'Session details' :
      pathname === '/lecturer/sessions' ? 'My sessions' :
      pathname === '/lecturer' ? 'Lecturer dashboard' :
      pathname === '/lecturer/profile' ? 'My profile' :
      pathname === '/faculty-admin' ? 'Faculty dashboard' :
      pathname.startsWith('/faculty-admin/reports') ? 'Faculty reports' :
      pathname.startsWith('/faculty-admin/sessions') ? 'Faculty sessions' :
      pathname.startsWith('/faculty-admin/units') ? 'Faculty units' :
      pathname === '/system-admin' ? 'System dashboard' :
      pathname.startsWith('/system-admin/academic') ? 'Academic setup' :
      pathname.startsWith('/system-admin/users') ? 'User management' :
      pathname === '/system-admin/reset-password' ? 'Reset user password' :
      pathname.startsWith('/system-admin/imports') ? 'Data imports' :
      pathname.startsWith('/system-admin/logs') ? 'System log' :
      pathname.startsWith('/system-admin/settings') ? 'Global settings' :
      pathname === '/404' ? 'Page not found' :
      'UMU Attendance'
    document.title = `${title} | UMU Attendance`
  }, [pathname])

  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <DocumentTitle />
      <AuthProvider>
        <ToastProvider>
          <Suspense fallback={<RouteLoading />}>
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
            <Route path="*" element={<NotFound />} />            </Routes>
          </Suspense>
          <InstallPrompt />
          <CookieBanner />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

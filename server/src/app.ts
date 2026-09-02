import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import passport from './config/google-oauth'
import { startSessionScheduler } from './utils/sessionScheduler'
import { securityHeaders, customSecurityHeaders } from './middleware/security'
import { csrfToken, csrfProtection } from './middleware/csrf'
import { securityEventLogger } from './middleware/securityLogger'
import authRoutes from './routes/auth.routes'
import academicRoutes from './routes/academic.routes'
import userRoutes from './routes/user.routes'
import profileRoutes from './routes/profile.routes'
import assignmentRoutes from './routes/assignment.routes'
import sessionRoutes from './routes/session.routes'
import checkinRoutes from './routes/checkin.routes'
import attendanceRoutes from './routes/attendance.routes'
import alertRoutes from './routes/alert.routes'
import dashboardRoutes from './routes/dashboard.routes'
import reportRoutes from './routes/report.routes'
import auditLogRoutes from './routes/audit-log.routes'
import settingsRoutes from './routes/settings.routes'
import enrollmentRoutes from './routes/enrollment.routes'
import { notFoundHandler, errorHandler } from './middleware/error'
import { authenticate } from './middleware/auth'
import { ensureDemoData } from './services/bootstrap.service'
import { getSseStream } from './controllers/events.controller'

const app = express()

app.set('trust proxy', 1)

// Security headers
app.use(securityHeaders)
app.use(customSecurityHeaders)

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  })
)
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))
app.use(cookieParser())
app.use(passport.initialize())

// Security event logging
app.use(securityEventLogger)

// CSRF protection - generate token for GET requests, validate for others
app.use(csrfToken)
app.use(csrfProtection)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/auth', authRoutes)
app.use('/api/academic', academicRoutes)
app.use('/api/users', userRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/assignments', assignmentRoutes)
app.use('/api/sessions', sessionRoutes)
app.use('/api/checkin', checkinRoutes)
app.use('/api/attendance', attendanceRoutes)
app.use('/api/alerts', alertRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/audit-logs', auditLogRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/enrollments', enrollmentRoutes)

// Realtime change signals (SSE) — cookie-authenticated, no payloads
app.get('/api/events', authenticate, getSseStream)

// 404 + global error handler (must be last)
app.use(notFoundHandler)
app.use(errorHandler)

const PORT = Number(process.env.PORT) || 4000
app.listen(PORT, () => {
  console.log(`UMU Attendance API listening on http://localhost:${PORT}`)
  // After a full database wipe the demo dataset (all accounts, password
  // Umu@2026) is rebuilt automatically so nobody is ever locked out.
  ensureDemoData().catch((e) => console.error('[bootstrap] seed failed:', e))
  startSessionScheduler()
})

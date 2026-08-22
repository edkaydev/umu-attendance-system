import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import passport from './config/google-oauth'
import { startSessionScheduler, stopSessionScheduler } from './utils/sessionScheduler'
import { logError } from './utils/errors'
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

const app = express()

app.set('trust proxy', 1)

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  })
)
app.use(express.json())
app.use(cookieParser())
app.use(passport.initialize())

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

// 404 + global error handler (must be last)
app.use(notFoundHandler)
app.use(errorHandler)

const PORT = Number(process.env.PORT) || 4000
const server = app.listen(PORT, () => {
  console.log(`UMU Attendance API listening on http://localhost:${PORT}`)
  startSessionScheduler()
})

// Without this a failed bind (port already in use, no permission) is thrown as
// an unhandled 'error' event and the process dies with no explanation.
server.on('error', (err) => {
  logError('server:listen', err, { port: PORT })
  process.exit(1)
})

// A rejected promise nobody awaited must not disappear — log it with its stack
// so background work (scheduler, mailer, PDF rendering) can be diagnosed.
process.on('unhandledRejection', (reason) => {
  logError('unhandledRejection', reason)
})

// The process state is undefined after an uncaught exception; log it and let
// the supervisor (Docker / systemd) restart with a clean slate.
process.on('uncaughtException', (err) => {
  logError('uncaughtException', err)
  stopSessionScheduler()
  server.close(() => process.exit(1))
  // Don't hang forever if connections stay open.
  setTimeout(() => process.exit(1), 5_000).unref()
})

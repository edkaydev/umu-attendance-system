import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import passport from './config/google-oauth'
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

// 404 + global error handler (must be last)
app.use(notFoundHandler)
app.use(errorHandler)

const PORT = Number(process.env.PORT) || 4000
app.listen(PORT, () => {
  console.log(`UMU Attendance API listening on http://localhost:${PORT}`)
})

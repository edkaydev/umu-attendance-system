import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import passport from './config/google-oauth'
import authRoutes from './routes/auth.routes'
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

// 404 + global error handler (must be last)
app.use(notFoundHandler)
app.use(errorHandler)

const PORT = Number(process.env.PORT) || 4000
app.listen(PORT, () => {
  console.log(`UMU Attendance API listening on http://localhost:${PORT}`)
})

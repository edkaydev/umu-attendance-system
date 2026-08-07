import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { sessionApi } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Modal } from '../components/ui/Modal'
import { ApiClientError } from '../api/client'

type LiveData = Awaited<ReturnType<typeof sessionApi.live>>

function useCountdown(expiresAt: string | undefined): number {
  const [left, setLeft] = useState(() => {
    if (!expiresAt) return 0
    return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
  })

  useEffect(() => {
    if (!expiresAt) return
    const tick = () => {
      setLeft(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])

  return left
}

export default function LiveSession() {
  const { sessionId = '' } = useParams()
  const toast = useToast()
  const navigate = useNavigate()

  const [data, setData] = useState<LiveData | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [closing, setClosing] = useState(false)
  const [extending, setExtending] = useState(false)
  const [copied, setCopied] = useState(false)
  const firstLoad = useRef(true)

  const load = useCallback(async () => {
    try {
      const live = await sessionApi.live(sessionId)
      setData(live)
      if (live.session.status === 'closed' && !firstLoad.current) {
        toast.info('Session was closed')
      }
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to load live session')
    } finally {
      firstLoad.current = false
      setLoaded(true)
    }
  }, [sessionId, toast])

  useEffect(() => {
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [load])

  const secondsLeft = useCountdown(data?.session.status === 'open' ? data.session.codeExpiresAt : undefined)

  async function handleCopy() {
    if (!data) return
    try {
      await navigator.clipboard.writeText(data.session.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }

  async function handleExtend() {
    setExtending(true)
    try {
      const res = await sessionApi.extend(sessionId, 5)
      toast.success(`Session extended until ${new Date(res.session.codeExpiresAt).toLocaleTimeString()}`)
      await load()
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to extend session')
    } finally {
      setExtending(false)
    }
  }

  async function handleClose() {
    setClosing(true)
    try {
      const res = await sessionApi.close(sessionId)
      toast.success(`Session closed. ${res.absenteesAutoMarked} student(s) auto-marked absent.`)
      navigate(`/lecturer/sessions/${sessionId}`)
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to close session')
    } finally {
      setClosing(false)
      setConfirmClose(false)
    }
  }

  if (!loaded) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-umu-red border-t-transparent" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-h2 font-bold text-text-primary">Session not found</h1>
        <p className="max-w-sm text-body text-text-secondary">
          This session could not be loaded. It may have been closed or removed.
        </p>
      </div>
    )
  }

  const closed = data.session.status === 'closed'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-h2 font-bold text-text-primary">{data.session.courseUnit.name}</h1>
          <p className="text-body-sm text-text-secondary">
            {data.session.courseUnit.code} · {data.session.mode === 'online' ? 'Online' : 'Physical'}
            {data.session.mode === 'physical' && data.session.venue ? ` · ${data.session.venue}` : ''}
            {data.session.startsAt
              ? ` · ${new Date(data.session.startsAt).toLocaleString()}`
              : ` · opened ${new Date(data.session.openedAt).toLocaleTimeString()}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {closed ? (
            <>
              <span className="rounded-full bg-surface-2 px-4 py-1.5 text-sm font-medium text-text-secondary">
                Closed
              </span>
              <Link to={`/lecturer/sessions/${sessionId}`}>
                <Button variant="secondary">View Attendance</Button>
              </Link>
            </>
          ) : (
            <Button variant="danger" onClick={() => setConfirmClose(true)}>
              Close Session
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* Code panel */}
        <Card className="text-center">
          {closed ? (
            <>
              <p className="text-body-sm text-text-secondary">This session is closed.</p>
              <p className="mt-2 text-body-sm text-text-primary">
                It can only be reopened on the same day.
              </p>
            </>
          ) : (
            <>
              <p className="mb-4 text-label font-semibold uppercase tracking-widest text-text-secondary">
                Session Code
              </p>
              {/* Scales with available width — 72px on wide screens, shrinks to fit mobile */}
              <div className="code-box mx-auto w-full max-w-xl rounded-lg border-2 border-umu-yellow bg-[#FFFDF0] px-4 py-5">
                <p className="session-code code-font font-bold leading-none text-umu-red">
                  {data.session.code}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="mt-3 flex items-center gap-1.5 mx-auto text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
              >
                {copied ? (
                  <>
                    <svg className="h-3.5 w-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                    Copy code
                  </>
                )}
              </button>
              <p className={`mt-4 text-body-sm font-medium ${secondsLeft <= 30 ? 'text-danger' : 'text-text-secondary'}`}>
                {secondsLeft > 0
                  ? `Expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`
                  : 'Code expired — extend to keep it live or close the session'}
              </p>
              <Button
                variant="secondary"
                fullWidth
                className="mt-4"
                loading={extending}
                disabled={closed}
                onClick={handleExtend}
              >
                Extend time (+5 min)
              </Button>
            </>
          )}

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded border border-border bg-surface-1 p-3">
              <p className="text-h3 font-bold text-text-primary">{data.presentCount}</p>
              <p className="text-xs text-text-secondary">Checked in</p>
            </div>
            <div className="rounded border border-border bg-surface-1 p-3">
              <p className="text-h3 font-bold text-text-primary">{data.enrolledCount}</p>
              <p className="text-xs text-text-secondary">Enrolled</p>
            </div>
          </div>
        </Card>

        {/* Present list */}
        <Card title="Checked In">
          {data.present.length === 0 ? (
            <p className="py-12 text-center text-body-sm text-text-secondary">
              Waiting for students to check in… (auto-refreshes every 5s)
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.present.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-success-light text-xs font-bold text-success">
                      ✓
                    </span>
                    <div>
                      <p className="text-sm font-medium text-text-primary">{r.student.fullName}</p>
                      <p className="text-xs text-text-secondary">
                        {r.student.regNumber ?? '—'} · {new Date(r.checkedInAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal open={confirmClose} onClose={() => setConfirmClose(false)} title="Close this session?">
        <p className="mb-6 text-body-sm text-text-primary">
          Closing auto-marks every enrolled student who has not checked in as <b>Absent</b> and
          triggers attendance alerts. This cannot be undone after today.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setConfirmClose(false)}>
            Cancel
          </Button>
          <Button variant="danger" loading={closing} onClick={handleClose}>
            Close Session
          </Button>
        </div>
      </Modal>
    </div>
  )
}

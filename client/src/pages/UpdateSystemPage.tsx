import { useEffect, useRef, useState } from 'react'
import { settingsApi } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ApiClientError } from '../api/client'

type UpdateState = 'idle' | 'running' | 'done' | 'failed'

export default function UpdateSystemPage() {
  const toast = useToast()

  const [state, setState]   = useState<UpdateState>('idle')
  const [log, setLog]       = useState('')
  const [starting, setStarting] = useState(false)
  const logRef = useRef<HTMLPreElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auto-scroll the log box to bottom whenever log updates
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [log])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const { log: newLog, done } = await settingsApi.updateLog()
        setLog(newLog)
        if (done) {
          clearInterval(pollRef.current!)
          pollRef.current = null
          const failed = newLog.includes('[UPDATE FAILED]')
          setState(failed ? 'failed' : 'done')
          if (failed) toast.error('Update failed — check the log below.')
          else toast.success('System updated successfully!')
        }
      } catch {
        // polling errors are silent — the log box will show the last state
      }
    }, 2000)
  }

  async function handleUpdate() {
    setStarting(true)
    setLog('')
    setState('running')
    try {
      const { message } = await settingsApi.updateSystem()
      toast.success(message)
      startPolling()
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to start update')
      setState('idle')
    } finally {
      setStarting(false)
    }
  }

  const stateColour =
    state === 'done'    ? 'text-success' :
    state === 'failed'  ? 'text-danger'  :
    state === 'running' ? 'text-warning' : 'text-text-disabled'

  const stateLabel =
    state === 'done'    ? '✓ Update complete' :
    state === 'failed'  ? '✗ Update failed'   :
    state === 'running' ? '⟳ Running…'        : 'Ready'

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div>
        <h1 className="text-h1 font-bold text-text-primary">Update System</h1>
        <p className="mt-1 text-body text-text-secondary">
          Pull the latest code from GitHub and redeploy the application.
        </p>
      </div>

      {/* ── What it does ── */}
      <div className="rounded border border-border bg-surface-1 px-5 py-4 text-body-sm text-text-secondary">
        <p className="font-semibold text-text-primary mb-2">This will run on the server:</p>
        <ol className="list-decimal pl-5 space-y-1 font-mono text-xs text-text-primary">
          <li>git pull origin main</li>
          <li>cd client &amp;&amp; npm install &amp;&amp; npm run build</li>
          <li>docker compose up -d --build</li>
          <li>docker compose exec app npx prisma migrate deploy</li>
        </ol>
        <p className="mt-3 text-warning font-medium">
          ⚠ The server will restart briefly during step 3. You may be logged out and need to sign back in.
        </p>
      </div>

      {/* ── Trigger card ── */}
      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-text-primary">Deploy Latest Version</p>
            <p className="text-body-sm text-text-secondary mt-0.5">
              Make sure your changes are pushed to <span className="font-mono">main</span> on GitHub before clicking.
            </p>
          </div>
          <Button
            variant="secondary"
            loading={starting || state === 'running'}
            disabled={state === 'running'}
            onClick={handleUpdate}
            className="shrink-0"
          >
            {state === 'running' ? 'Updating…' : 'Update System'}
          </Button>
        </div>

        {/* Status badge */}
        {state !== 'idle' && (
          <p className={`mt-4 text-body-sm font-semibold ${stateColour}`}>
            {stateLabel}
          </p>
        )}
      </Card>

      {/* ── Live log ── */}
      {log && (
        <Card title="Deployment Log">
          <pre
            ref={logRef}
            className="max-h-[420px] overflow-y-auto rounded border border-border bg-gray-950 p-4 text-xs leading-relaxed text-green-400 whitespace-pre-wrap"
          >
            {log}
          </pre>
          {state === 'done' && (
            <p className="mt-3 text-body-sm text-success font-medium">
              ✓ Deployment finished. Refresh the page to load the new version.
            </p>
          )}
          {state === 'failed' && (
            <p className="mt-3 text-body-sm text-danger font-medium">
              ✗ Something went wrong. Check the log above and fix the issue before retrying.
            </p>
          )}
        </Card>
      )}
    </div>
  )
}

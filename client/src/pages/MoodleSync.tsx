import { useCallback, useEffect, useState } from 'react'
import { moodleApi, MoodleConfigInfo, MoodleConnectionTest, MoodleFullSyncResult, MoodleSyncRunInfo, MoodleSyncStats } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { ApiClientError } from '../api/client'

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-surface-1 px-3 py-2">
      <p className="text-label font-semibold uppercase tracking-wide text-text-secondary">{label}</p>
      <p className="mt-0.5 text-h3 font-bold text-text-primary">{value}</p>
    </div>
  )
}

function StatsGrid({ stats }: { stats: MoodleSyncStats }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-7">
      <StatBlock label="Fetched" value={stats.fetched} />
      <StatBlock label="Created" value={stats.created} />
      <StatBlock label="Updated" value={stats.updated} />
      <StatBlock label="Unchanged" value={stats.unchanged} />
      <StatBlock label="Skipped" value={stats.skipped} />
      <StatBlock label="Conflicts" value={stats.conflicts} />
      <StatBlock label="Errors" value={stats.errors} />
    </div>
  )
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

export default function MoodleSync() {
  const toast = useToast()
  const [config, setConfig] = useState<MoodleConfigInfo | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<MoodleConnectionTest | null>(null)
  const [lastRun, setLastRun] = useState<MoodleSyncRunInfo | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<MoodleFullSyncResult | null>(null)

  const loadStatus = useCallback(() => {
    moodleApi.config().then(setConfig).catch(() => setConfig(null))
    moodleApi
      .syncStatus()
      .then(({ lastRun }) => setLastRun(lastRun))
      .catch(() => setLastRun(null))
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await moodleApi.testConnection()
      setTestResult(result)
      if (!result.configured) toast.error('Moodle is not configured on this server.')
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Connection test failed')
    } finally {
      setTesting(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const result = await moodleApi.sync()
      setSyncResult(result)
      toast.success('Moodle sync completed')
      loadStatus()
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h2 font-bold text-text-primary">Moodle Sync</h1>
        <p className="text-body-sm text-text-secondary">
          Pull lecturers, students and their course links from Moodle into the Attendance System — one-way and on-demand.
        </p>
      </div>

      {/* Configuration */}
      <Card title="Configuration">
        {config === null ? (
          <p className="text-body-sm text-text-secondary">Loading configuration…</p>
        ) : !config.configured ? (
          <div className="space-y-2">
            <p className="text-body text-text-secondary">
              Moodle integration is <span className="font-semibold text-text-primary">not configured</span> on this server.
            </p>
            <p className="text-body-sm text-text-secondary">
              The System Administrator must set <code className="rounded bg-surface-2 px-1.5 py-0.5">MOODLE_BASE_URL</code> and{' '}
              <code className="rounded bg-surface-2 px-1.5 py-0.5">MOODLE_WS_TOKEN</code> in the server environment, then restart.
            </p>
          </div>
        ) : (
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-label font-semibold uppercase tracking-wide text-text-secondary">Base URL</dt>
              <dd className="text-body font-medium text-text-primary">{config.baseUrl}</dd>
            </div>
            <div>
              <dt className="text-label font-semibold uppercase tracking-wide text-text-secondary">Web service</dt>
              <dd className="text-body font-medium text-text-primary">{config.wsService}</dd>
            </div>
            <div>
              <dt className="text-label font-semibold uppercase tracking-wide text-text-secondary">Token</dt>
              <dd className="text-body font-medium text-text-primary">{config.tokenSet ? 'Set' : 'Not set'}</dd>
            </div>
          </dl>
        )}
      </Card>

      {/* Test connection */}
      <Card title="Test connection">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleTest} loading={testing} disabled={!config?.configured}>
            Test Connection
          </Button>
        </div>
        {testResult && (
          <div className="mt-4 rounded-md border border-border bg-surface-1 p-4">
            {testResult.configured ? (
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-label font-semibold uppercase tracking-wide text-text-secondary">Site</dt>
                  <dd className="text-body font-medium text-text-primary">{testResult.siteName}</dd>
                </div>
                <div>
                  <dt className="text-label font-semibold uppercase tracking-wide text-text-secondary">URL</dt>
                  <dd className="text-body font-medium text-text-primary">{testResult.siteUrl}</dd>
                </div>
                <div>
                  <dt className="text-label font-semibold uppercase tracking-wide text-text-secondary">Release</dt>
                  <dd className="text-body font-medium text-text-primary">{testResult.release}</dd>
                </div>
                <div>
                  <dt className="text-label font-semibold uppercase tracking-wide text-text-secondary">Service account</dt>
                  <dd className="text-body font-medium text-text-primary">{testResult.serviceUsername}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-body-sm text-text-secondary">Moodle is not configured on this server.</p>
            )}
          </div>
        )}
      </Card>

      {/* Sync now */}
      <Card title="Synchronize now">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleSync} loading={syncing} disabled={!config?.configured}>
            Sync Now
          </Button>
          {lastRun && (
            <p className="text-body-sm text-text-secondary">
              Last run: {new Date(lastRun.startedAt).toLocaleString()} · {lastRun.status}
            </p>
          )}
        </div>

        {syncResult && (
          <div className="mt-5 space-y-5">
            <div>
              <h4 className="mb-2 text-h4 font-semibold text-text-primary">Courses</h4>
              <StatsGrid stats={syncResult.courses} />
            </div>
            <div>
              <h4 className="mb-2 text-h4 font-semibold text-text-primary">Users</h4>
              <StatsGrid stats={syncResult.users} />
            </div>
            <div>
              <h4 className="mb-2 text-h4 font-semibold text-text-primary">Enrolments / assignments</h4>
              <StatsGrid stats={syncResult.enrolments} />
            </div>
            <p className="text-body-sm text-text-secondary">Duration: {formatDuration(syncResult.durationMs)}</p>
            {syncResult.warnings.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
                <p className="text-body font-semibold text-amber-900">
                  {syncResult.warnings.length} warning{syncResult.warnings.length > 1 ? 's' : ''}
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1">
                  {syncResult.warnings.map((w, i) => (
                    <li key={i} className="text-body-sm text-amber-800">{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}

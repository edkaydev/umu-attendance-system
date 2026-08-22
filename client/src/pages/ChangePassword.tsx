import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { authApi } from '../api/endpoints'
import { errorMessage } from '../api/client'
import { Button } from '../components/ui/Button'
import { PasswordInput } from '../components/ui/PasswordInput'
import { Card } from '../components/ui/Card'

export default function ChangePassword() {
  const { user, refresh } = useAuth()
  const toast = useToast()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match')
      return
    }

    setSaving(true)
    try {
      await authApi.changePassword(currentPassword, newPassword)
      toast.success('Password changed successfully')
      // Refresh auth state — RequireAuth will redirect to the right place
      // (dashboard if profileComplete, /profile/setup if not).
      await refresh()
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to change password'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white p-6">
      <div className="w-full max-w-md">
        <img src="/umu-logo.png" alt="Uganda Martyrs University crest" className="mx-auto mb-6 h-24 w-auto" />
        <h1 className="text-h1 font-bold text-text-primary">Change Password</h1>
        <p className="mt-1 mb-6 text-body-lg text-text-secondary">
          For security, you must set a new password before continuing.
        </p>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <PasswordInput
              label="Current Password"
              autoComplete="current-password"
              placeholder="Your temporary password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <PasswordInput
              label="New Password"
              autoComplete="new-password"
              placeholder="At least 6 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              showStrength
            />
            <PasswordInput
              label="Confirm New Password"
              autoComplete="new-password"
              placeholder="Repeat new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <Button fullWidth type="submit" loading={saving}>
              Change Password
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}

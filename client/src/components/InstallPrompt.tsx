import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    const onInstalled = () => {
      setInstalled(true)
      setVisible(false)
    }
    const onAppInstalled = () => {
      setVisible(false)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    window.addEventListener('appinstalled', onAppInstalled)

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true)
      setVisible(false)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  if (!visible || installed) return null

  async function install() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice.outcome === 'accepted') {
      setVisible(false)
      setInstalled(true)
    }
    setDeferredPrompt(null)
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-[55] flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-white px-5 py-4 shadow-lg md:bottom-6 md:left-auto md:right-6 md:w-[380px]">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-umu-red font-display-bold text-lg text-white">
          U
        </span>
        <div>
          <p className="text-sm font-semibold text-text-primary">Install UMU Attendance</p>
          <p className="text-xs text-text-secondary">Get instant access from your home screen.</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setVisible(false)}
          className="min-h-[36px] rounded px-3 text-sm font-medium text-text-secondary hover:bg-surface-1"
        >
          Not now
        </button>
        <button
          onClick={install}
          className="min-h-[36px] rounded bg-umu-red px-4 text-sm font-semibold text-white hover:bg-umu-red-dark"
        >
          Install
        </button>
      </div>
    </div>
  )
}

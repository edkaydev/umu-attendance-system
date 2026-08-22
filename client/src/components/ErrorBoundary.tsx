import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** Last-resort guard: renders a usable error screen instead of a blank white page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('Unhandled UI error:', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white p-6 text-center">
        <h1 className="text-h2 font-bold text-text-primary">Something went wrong</h1>
        <p className="max-w-md text-body text-text-secondary">
          An unexpected error occurred while displaying this page. Reloading usually fixes it.
        </p>
        <pre className="max-w-md overflow-x-auto rounded bg-surface-1 p-3 text-left text-body-sm text-text-secondary">
          {this.state.error.message}
        </pre>
        <button
          onClick={() => window.location.reload()}
          className="min-h-[44px] rounded bg-umu-red px-6 py-2 text-body font-semibold text-white hover:bg-umu-red-dark"
        >
          Reload
        </button>
      </div>
    )
  }
}

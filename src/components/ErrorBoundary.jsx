import { Component } from 'react'

/**
 * Error Boundary — catches any React render crash and shows a recovery UI
 * instead of a white screen. Wraps the entire app in App.jsx.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', padding: 32,
          fontFamily: 'Inter, system-ui, sans-serif', textAlign: 'center',
          background: 'var(--bg, #f8f9fa)'
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text1, #1a1a1a)', margin: '0 0 8px' }}>
            Κάτι πήγε στραβά
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text2, #666)', margin: '0 0 24px', maxWidth: 300 }}>
            Η εφαρμογή αντιμετώπισε πρόβλημα. Δοκιμάστε να ξαναφορτώσετε.
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={this.handleReset} style={{
              padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border, #e0e0e0)',
              background: 'white', fontSize: 14, fontWeight: 500, cursor: 'pointer'
            }}>
              Δοκιμή ξανά
            </button>
            <button onClick={this.handleReload} style={{
              padding: '10px 20px', borderRadius: 8, border: 'none',
              background: 'var(--blue, #2563eb)', color: 'white',
              fontSize: 14, fontWeight: 500, cursor: 'pointer'
            }}>
              Ανανέωση σελίδας
            </button>
          </div>
          {this.state.error && (
            <details style={{ marginTop: 24, fontSize: 12, color: 'var(--text3, #999)', maxWidth: 400 }}>
              <summary style={{ cursor: 'pointer' }}>Τεχνικές λεπτομέρειες</summary>
              <pre style={{ textAlign: 'left', whiteSpace: 'pre-wrap', marginTop: 8 }}>
                {this.state.error.toString()}
              </pre>
            </details>
          )}
        </div>
      )
    }

    return this.props.children
  }
}

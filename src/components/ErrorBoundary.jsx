import { Component } from 'react'
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react'

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

  handleReset = () => this.setState({ hasError: false, error: null })
  handleReload = () => window.location.reload()

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <main className="error-boundary-screen">
        <section className="error-boundary-card" role="alert" aria-live="assertive">
          <div className="error-boundary-icon" aria-hidden="true">
            <AlertTriangle size={25} strokeWidth={1.5} />
          </div>
          <h1>Κάτι πήγε στραβά</h1>
          <p>Η εφαρμογή δεν μπόρεσε να ολοκληρώσει αυτή την προβολή. Τα αποθηκευμένα δεδομένα σας δεν επηρεάζονται.</p>
          <div className="error-boundary-actions">
            <button type="button" className="action-btn" onClick={this.handleReset}>
              <RotateCcw size={16} strokeWidth={1.5} aria-hidden="true" /> Δοκιμή ξανά
            </button>
            <button type="button" className="action-btn primary" onClick={this.handleReload}>
              <RefreshCw size={16} strokeWidth={1.5} aria-hidden="true" /> Ανανέωση σελίδας
            </button>
          </div>
          {this.state.error && (
            <details className="error-boundary-details">
              <summary>Τεχνικές λεπτομέρειες</summary>
              <pre>{this.state.error.toString()}</pre>
            </details>
          )}
        </section>
      </main>
    )
  }
}

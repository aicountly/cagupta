// Redirect www → non-www canonical domain
if (window.location.hostname.startsWith('www.')) {
  window.location.replace(window.location.href.replace(window.location.hostname, window.location.hostname.substring(4)));
}

import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import { MsalProvider } from '@azure/msal-react'
import { msalInstance } from './auth/MsalConfig.js'
import { loginWithMicrosoft } from './services/authService.js'
import './index.css'
import { bootstrapPortalTheme } from './theme/portalThemes.js'
import App from './App.jsx'

bootstrapPortalTheme()

/** Surfaces React render errors on production (e.g. MSAL misconfig) instead of a blank page. */
class RootErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error(error, info?.componentStack)
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error?.message || String(this.state.error)
      return (
        <div style={{
          padding: 24,
          fontFamily: 'system-ui, sans-serif',
          maxWidth: 560,
          margin: '10vh auto',
        }}>
          <h1 style={{ fontSize: 18, marginBottom: 12 }}>Something went wrong loading the app</h1>
          <p style={{ color: '#64748b', marginBottom: 16 }}>
            Please hard-refresh the page. If this persists, open the browser console (F12 → Console) and share any red errors with support.
          </p>
          <pre style={{
            fontSize: 12,
            background: '#f1f5f9',
            padding: 12,
            borderRadius: 8,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
          }}>{msg}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

function mountApp() {
  const rootEl = document.getElementById('root')
  if (!rootEl) {
    console.error('Missing #root element in index.html')
    return
  }
  createRoot(rootEl).render(
    <StrictMode>
      <RootErrorBoundary>
        <MsalProvider instance={msalInstance}>
          <App />
        </MsalProvider>
      </RootErrorBoundary>
    </StrictMode>
  )
}

// Always mount after MSAL bootstrap attempt. Previously, a rejected initialize() left a blank page (never called createRoot).
msalInstance.initialize()
  .then(() => msalInstance.handleRedirectPromise())
  .then((response) => {
    if (response && response.idToken) {
      return loginWithMicrosoft(response).catch((err) => {
        sessionStorage.setItem('msal_login_error', err.message || 'Microsoft login failed. Please contact the administrator.')
      })
    }
  })
  .catch((err) => {
    console.error(err)
  })
  .finally(() => {
    mountApp()
  })

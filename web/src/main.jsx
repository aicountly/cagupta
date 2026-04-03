import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MsalProvider } from '@azure/msal-react'
import { msalInstance } from './auth/MsalConfig.js'
import { loginWithMicrosoft } from './services/authService.js'
import './index.css'
import App from './App.jsx'

msalInstance.initialize().then(() => {
  msalInstance.handleRedirectPromise().then((response) => {
    if (response && response.idToken) {
      loginWithMicrosoft(response).catch(() => {})
    }
  }).catch(() => {}).finally(() => {
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <MsalProvider instance={msalInstance}>
          <App />
        </MsalProvider>
      </StrictMode>
    )
  })
})
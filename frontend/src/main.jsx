import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import CcTitleTooltips from './components/CcTitleTooltips.jsx'
import { applyClaraTypography } from './typographyScale'
import { initBrowserTelemetry } from './telemetry/browserTelemetry'

try {
  applyClaraTypography(localStorage.getItem('claracore_font_size') || 'normal')
} catch {
  applyClaraTypography('normal')
}

initBrowserTelemetry()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <CcTitleTooltips />
    <App />
  </StrictMode>,
)

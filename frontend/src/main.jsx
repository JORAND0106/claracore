import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { applyClaraTypography } from './typographyScale'

try {
  applyClaraTypography(localStorage.getItem('claracore_font_size') || 'normal')
} catch {
  applyClaraTypography('normal')
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

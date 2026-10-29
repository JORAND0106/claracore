import { useEffect, useState } from 'react'
import { API_BASE } from '../apiBase'

function shortSha(raw) {
  const s = String(raw || '').trim()
  if (!s) return null
  return s.length > 7 ? s.slice(0, 7) : s
}

/**
 * Identificador discreto de la versión desplegada (FE + BE).
 * Visible para comprobar qué commit está sirviendo producción.
 */
export default function DeployVersionBadge({ t }) {
  const fe = shortSha(import.meta.env.VITE_GIT_SHA)
  const [be, setBe] = useState(null)

  useEffect(() => {
    let vivo = true
    fetch(`${API_BASE}/healthz`, { method: 'GET' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!vivo) return
        setBe(shortSha(body?.git_sha || body?.version_deploy))
      })
      .catch(() => {
        if (vivo) setBe(null)
      })
    return () => { vivo = false }
  }, [])

  const label = [
    fe ? `FE ${fe}` : null,
    be ? `BE ${be}` : null,
  ].filter(Boolean).join(' · ')
  if (!label) return null

  const muted = t?.textMuted || '#64748b'
  const border = t?.border || '#e2e8f0'
  const bg = t?.bgCard || 'rgba(255,255,255,0.92)'

  return (
    <div
      data-testid="deploy-version-badge"
      title="Identificador de la versión desplegada (frontend y servidor)"
      style={{
        position: 'fixed',
        right: 10,
        bottom: 8,
        zIndex: 40,
        pointerEvents: 'none',
        fontSize: 10,
        lineHeight: 1.2,
        letterSpacing: '0.02em',
        color: muted,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 6,
        padding: '3px 7px',
        opacity: 0.85,
        fontVariantNumeric: 'tabular-nums',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      }}
    >
      {label}
    </div>
  )
}

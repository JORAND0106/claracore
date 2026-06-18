import { useEffect, useRef, useState } from 'react'
import { useModulo } from '../context/ModuloContext'

function isRefreshShortcut(e) {
  if (e.key === 'F5') return true
  const k = String(e.key || '').toLowerCase()
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === 'r') return true
  if ((e.ctrlKey || e.metaKey) && k === 'r') return true
  return false
}

/**
 * Mensaje para beforeunload (botón recarga del navegador).
 * Chrome/Edge suelen mostrar texto genérico; Firefox a veces muestra este texto.
 * Estrategia: desaconsejar el botón del navegador y dirigir a F5 → modal ClaraCore.
 */
const AVISO_RECARGA_NAVEGADOR =
  'Riesgo de borrar la caché y perder el trabajo en pantalla. '
  + 'No use el botón de recarga del navegador. Pulse F5 o Ctrl+F5 y luego Actualizar.'

/**
 * Intercepta F5 / Ctrl+R y ofrece «Actualizar» del módulo activo.
 * El botón de recarga del navegador dispara beforeunload con el aviso estratégico.
 */
export default function RefreshCacheGuard({ theme, active = false }) {
  const { moduloRefresh } = useModulo()
  const [open, setOpen] = useState(false)
  const [actualizando, setActualizando] = useState(false)
  const allowUnloadRef = useRef(false)

  const t = theme || {}
  const primary = t.primary || '#0077B6'
  const busy = actualizando || !!moduloRefresh?.busy
  const puedeActualizar = !!moduloRefresh?.fn && !moduloRefresh?.disabled

  useEffect(() => {
    if (!active) return undefined

    const onKeyDown = (e) => {
      if (!isRefreshShortcut(e)) return
      e.preventDefault()
      e.stopPropagation()
      setOpen(true)
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [active])

  useEffect(() => {
    if (!active) return undefined

    const onBeforeUnload = (e) => {
      if (allowUnloadRef.current) return
      e.preventDefault()
      e.returnValue = AVISO_RECARGA_NAVEGADOR
      return AVISO_RECARGA_NAVEGADOR
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [active])

  if (!open) return null

  const cerrar = () => {
    if (busy) return
    setOpen(false)
  }

  const recargarPagina = () => {
    allowUnloadRef.current = true
    setOpen(false)
    window.location.reload()
  }

  const actualizarModulo = async () => {
    if (!puedeActualizar || busy) return
    setActualizando(true)
    try {
      await moduloRefresh.fn()
      setOpen(false)
    } catch { /* el módulo muestra su propio error */ } finally {
      setActualizando(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100030,
        background: 'rgba(15, 41, 66, 0.58)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onClick={cerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="refresh-cache-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          background: t.bgCard || '#fff',
          border: `1px solid ${t.border || '#E2E8F0'}`,
          borderRadius: 16,
          boxShadow: t.shadow || '0 28px 80px rgba(0,0,0,0.28)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '32px 36px 20px', textAlign: 'center' }}>
          <div
            style={{
              width: 64,
              height: 64,
              margin: '0 auto 18px',
              borderRadius: '50%',
              background: `${primary}14`,
              border: `2px solid ${primary}33`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <i
              className="ti ti-alert-triangle"
              style={{ fontSize: '2rem', color: primary, lineHeight: 1 }}
              aria-hidden
            />
          </div>
          <h2
            id="refresh-cache-title"
            style={{
              margin: '0 0 10px',
              fontSize: 'var(--cc-title)',
              fontWeight: 800,
              color: t.text || '#0F172A',
              letterSpacing: '-0.02em',
            }}
          >
            Forma segura de actualizar
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: 'var(--cc-body)',
              color: t.textMuted || '#64748B',
              lineHeight: 1.55,
              maxWidth: 400,
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            Bien — F5 o Ctrl+F5 abre esta ventana sin borrar la caché.
            Pulse <strong>Actualizar</strong> para refrescar los datos del módulo.
          </p>
        </div>

        {moduloRefresh && (
          <div
            style={{
              margin: '8px 36px 28px',
              padding: '20px 22px',
              borderRadius: 12,
              background: `${primary}08`,
              border: `1px solid ${primary}28`,
            }}
          >
            <p
              style={{
                margin: '0 0 14px',
                fontSize: 'var(--cc-sm)',
                color: t.text || '#334155',
                lineHeight: 1.5,
                textAlign: 'center',
              }}
            >
              Actualice los datos <strong>sin perder la caché</strong> con el botón del módulo:
            </p>
            <button
              type="button"
              onClick={() => void actualizarModulo()}
              disabled={!puedeActualizar || busy}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                width: '100%',
                padding: '14px 20px',
                border: 'none',
                borderRadius: 10,
                background: puedeActualizar && !busy ? primary : `${primary}55`,
                color: '#fff',
                fontSize: 'var(--cc-body)',
                fontWeight: 700,
                cursor: puedeActualizar && !busy ? 'pointer' : 'not-allowed',
                boxShadow: puedeActualizar && !busy ? `0 4px 14px ${primary}44` : 'none',
              }}
            >
              <i
                className="ti ti-refresh"
                style={{
                  fontSize: '1.25rem',
                  lineHeight: 1,
                  animation: busy ? 'dashRefreshSpin 0.85s linear infinite' : 'none',
                }}
                aria-hidden
              />
              {busy ? 'Actualizando…' : `Actualizar ${moduloRefresh.label}`}
            </button>
          </div>
        )}

        <div
          style={{
            padding: '18px 36px 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            borderTop: `1px solid ${t.border || '#E2E8F0'}`,
            background: t.bg || '#F8FAFC',
          }}
        >
          <button
            type="button"
            onClick={cerrar}
            disabled={busy}
            style={{
              background: t.bgCard || '#fff',
              color: t.text || '#334155',
              border: `1px solid ${t.border || '#CBD5E1'}`,
              borderRadius: 10,
              padding: '10px 22px',
              fontSize: 'var(--cc-sm)',
              fontWeight: 600,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={recargarPagina}
            disabled={busy}
            style={{
              background: 'transparent',
              color: '#B45309',
              border: 'none',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 'var(--cc-sm)',
              fontWeight: 600,
              cursor: busy ? 'wait' : 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
          >
            Recargar página de todos modos
          </button>
        </div>
      </div>
    </div>
  )
}

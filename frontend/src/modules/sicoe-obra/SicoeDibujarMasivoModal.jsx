import { useRef, useState } from 'react'
import {
  ejecutarDibujoMasivoHuellas,
  progresoDibujoPct,
  resumenDibujoVacio,
} from './sicoeDibujarMasivoApi'

/**
 * Modal Desarrollador: dibuja huellas faltantes del contrato.
 */
export default function SicoeDibujarMasivoModal({
  t,
  API_URL,
  token,
  contratoId,
  onClose,
  onDone,
}) {
  const [corriendo, setCorriendo] = useState(false)
  const [error, setError] = useState('')
  const [progreso, setProgreso] = useState({ procesados: 0, total: 0, pct: 0, resumen: resumenDibujoVacio() })
  const [finalizado, setFinalizado] = useState(false)
  const abortRef = useRef(null)

  const iniciar = async () => {
    setError('')
    setFinalizado(false)
    setCorriendo(true)
    setProgreso({ procesados: 0, total: 0, pct: 0, resumen: resumenDibujoVacio() })
    const ac = new AbortController()
    abortRef.current = ac
    try {
      const result = await ejecutarDibujoMasivoHuellas({
        API_URL,
        contratoId,
        token,
        batchSize: 40,
        signal: ac.signal,
        onProgreso: (p) => setProgreso(p),
      })
      setProgreso((prev) => ({
        ...prev,
        resumen: result.resumen,
        total: result.total,
        procesados: result.resumen.procesados,
        pct: progresoDibujoPct({
          procesados: result.resumen.procesados,
          total: result.total,
        }),
        done: true,
      }))
      setFinalizado(true)
      onDone?.(result)
    } catch (e) {
      if (e?.code === 'ABORT') setError('Proceso cancelado.')
      else setError(e?.message || String(e))
    } finally {
      setCorriendo(false)
      abortRef.current = null
    }
  }

  const cancelar = () => {
    abortRef.current?.abort()
  }

  const r = progreso.resumen || resumenDibujoVacio()

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 12000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={() => { if (!corriendo) onClose?.() }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.bgCard, color: t.text, borderRadius: 14,
          border: `1px solid ${t.border}`, width: '100%', maxWidth: 480,
          boxShadow: '0 12px 40px rgba(0,0,0,0.35)', padding: 20,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)' }}>Dibujar huellas</div>
            <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginTop: 4, lineHeight: 1.45 }}>
              Solo Desarrollador. Dibuja franjas, nodos y polígonos de registros con ítem
              que aún no tienen huella. Idempotente: no duplica.
            </div>
          </div>
          <button
            type="button"
            onClick={() => { if (!corriendo) onClose?.() }}
            disabled={corriendo}
            style={{
              background: 'transparent', border: 'none', color: t.textMuted,
              fontSize: 20, cursor: corriendo ? 'not-allowed' : 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{
            height: 10, borderRadius: 6, background: t.bg || '#e2e8f0',
            overflow: 'hidden', border: `1px solid ${t.border}`,
          }}>
            <div style={{
              height: '100%', width: `${progreso.pct || 0}%`,
              background: t.primary, transition: 'width 0.25s ease',
            }} />
          </div>
          <div style={{ marginTop: 6, fontSize: 'var(--cc-caption)', color: t.textMuted }}>
            {corriendo
              ? `Procesando ${progreso.procesados} / ${progreso.total || '…'}…`
              : finalizado
                ? `Listo · ${progreso.procesados} procesado(s)`
                : 'Listo para iniciar'}
          </div>
        </div>

        <div style={{
          marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
          fontSize: 'var(--cc-sm)',
        }}>
          {[
            ['Precisos', r.precisos],
            ['Aproximados', r.aproximados],
            ['No dibujados', r.no_dibujados],
            ['Con inconsistencia', r.con_inconsistencia],
          ].map(([label, val]) => (
            <div
              key={label}
              style={{
                padding: '8px 10px', borderRadius: 8,
                border: `1px solid ${t.border}`, background: t.bg,
              }}
            >
              <div style={{ color: t.textMuted, fontSize: 'var(--cc-caption)', fontWeight: 700 }}>{label}</div>
              <div style={{ fontWeight: 800, marginTop: 2 }}>{val}</div>
            </div>
          ))}
        </div>

        {error && (
          <div style={{
            marginTop: 12, padding: '8px 10px', borderRadius: 8,
            background: '#EF444415', color: '#EF4444', fontSize: 'var(--cc-sm)',
          }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {corriendo ? (
            <button
              type="button"
              onClick={cancelar}
              style={{
                background: 'transparent', border: `1px solid ${t.border}`,
                color: t.textMuted, borderRadius: 8, padding: '8px 14px',
                cursor: 'pointer', fontWeight: 700, fontSize: 'var(--cc-sm)',
              }}
            >
              Cancelar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onClose?.()}
              style={{
                background: 'transparent', border: `1px solid ${t.border}`,
                color: t.textMuted, borderRadius: 8, padding: '8px 14px',
                cursor: 'pointer', fontWeight: 700, fontSize: 'var(--cc-sm)',
              }}
            >
              Cerrar
            </button>
          )}
          {!corriendo && !finalizado && (
            <button
              type="button"
              onClick={iniciar}
              style={{
                background: t.primary, color: '#fff', border: 'none',
                borderRadius: 8, padding: '8px 16px', cursor: 'pointer',
                fontWeight: 800, fontSize: 'var(--cc-sm)',
              }}
            >
              Dibujar
            </button>
          )}
          {!corriendo && finalizado && (
            <button
              type="button"
              onClick={iniciar}
              style={{
                background: t.primary, color: '#fff', border: 'none',
                borderRadius: 8, padding: '8px 16px', cursor: 'pointer',
                fontWeight: 800, fontSize: 'var(--cc-sm)',
              }}
            >
              Ejecutar de nuevo
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

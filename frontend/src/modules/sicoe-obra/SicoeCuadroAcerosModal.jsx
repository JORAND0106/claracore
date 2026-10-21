import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import { EsquemaDespiecePanel } from '../../components/esquema/esquemaDespiecePanel.jsx'
import {
  createEmptySchedule,
  despieceSchedulesIncomplete,
  computeScheduleTotalKg,
} from '../../components/esquema/esquemaDespiece.js'
import { buildDespieceAdjuntos } from '../../components/esquema/esquemaDespieceExport.js'
import { resolveEsquemaUi } from '../../components/esquema/esquemaTheme.js'
import { listaFotosRegistro } from './sicoeFotosHelpers.js'
import { sicoeRegistrosDesdeCuadro } from './sicoeCuadroAceros.js'

/**
 * Modal SicoeObra: cuadro de despiece + una foto compartida + Cargar.
 * No abre el editor de esquema completo (celular: no disponible).
 */
export default function SicoeCuadroAcerosModal({
  open,
  onClose,
  onCargar,
  t,
  contratoId,
  scheduleInicial = null,
  modo = 'crear', // 'crear' | 'editar'
  fotoInicial = null,
  soloConsulta = false,
}) {
  const theme = t || {
    bgCard: '#0F1923',
    bg: '#15202B',
    border: '#334155',
    text: '#E2E8F0',
    textMuted: '#94A3B8',
    primary: '#0EA5A8',
  }
  const ui = useMemo(() => resolveEsquemaUi({ mode: 'dark' }), [])
  const [schedules, setSchedules] = useState(() => {
    if (scheduleInicial) return [scheduleInicial]
    const s = createEmptySchedule('')
    return [s]
  })
  const [activeId, setActiveId] = useState(() => schedules[0]?.id || null)
  const [fotosLocal, setFotosLocal] = useState(() => listaFotosRegistro(fotoInicial || {}))
  const [fotoFiles, setFotoFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    if (scheduleInicial) {
      setSchedules([scheduleInicial])
      setActiveId(scheduleInicial.id)
    } else {
      const s = createEmptySchedule('')
      setSchedules([s])
      setActiveId(s.id)
    }
    setFotosLocal(listaFotosRegistro(fotoInicial || {}))
    setFotoFiles([])
    setError(null)
  }, [open, scheduleInicial, fotoInicial])

  if (!open || typeof document === 'undefined') return null

  const active = schedules.find((s) => s.id === activeId) || schedules[0]
  const totalKg = active ? computeScheduleTotalKg(active.positions || []) : 0
  const incompleto = despieceSchedulesIncomplete(schedules)
  const tieneFoto = fotosLocal.length > 0 || fotoFiles.length > 0

  const onFiles = (e) => {
    const list = Array.from(e.target.files || [])
    e.target.value = ''
    if (!list.length) return
    setFotoFiles((prev) => [...prev, ...list])
    const previews = list.map((f) => ({
      url: URL.createObjectURL(f),
      numero: null,
      origen: 'preview',
    }))
    setFotosLocal((prev) => [...prev, ...previews])
  }

  const handleCargar = async () => {
    if (soloConsulta) return
    setError(null)
    if (incompleto || !String(active?.nombre || '').trim()) {
      setError('Complete el nombre y las posiciones del cuadro.')
      return
    }
    if (!tieneFoto) {
      setError('Agregue una foto para el cuadro.')
      return
    }
    const check = sicoeRegistrosDesdeCuadro(active)
    if (!check.ok) {
      setError(check.error)
      return
    }
    setBusy(true)
    try {
      const adjuntos = await buildDespieceAdjuntos([active], { contratoId })
      const png = adjuntos[0] || null
      await onCargar?.({
        schedule: active,
        registrosDraft: check.registros,
        cuadroId: check.cuadroId,
        fotoFiles,
        fotosExistentes: fotosLocal.filter((f) => f?.url && !String(f.url).startsWith('blob:')),
        pngAdjunto: png,
        totalKg,
      })
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      data-testid="sicoe-cuadro-aceros-modal"
      style={{
        position: 'fixed', inset: 0, zIndex: 12100,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 12,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose?.() }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.bgCard,
          border: `1px solid ${theme.border}`,
          borderRadius: 16,
          width: 'min(960px, 100%)',
          maxHeight: 'calc(100vh - 24px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: theme.text,
        }}
      >
        <CcModalBrandHeader theme={theme} />
        <div style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
        >
          <strong style={{ flex: 1, color: theme.primary }}>
            {soloConsulta ? 'Consultar cuadro de aceros' : (modo === 'editar' ? 'Editar cuadro de aceros' : 'Cuadro de aceros')}
          </strong>
          <span style={{ fontSize: 'var(--cc-sm)', color: theme.textMuted }} title="Peso total del cuadro">
            Total {totalKg.toFixed(2)} kg
          </span>
          <button type="button" onClick={onClose} disabled={busy} style={{
            background: 'transparent', border: 'none', color: theme.textMuted,
            fontSize: '1.2rem', cursor: 'pointer',
          }}
          >
            ✕
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          <EsquemaDespiecePanel
            t={theme}
            ui={ui}
            contratoId={contratoId}
            schedules={schedules}
            activeId={activeId}
            onChangeSchedules={soloConsulta ? (() => {}) : setSchedules}
            onActiveId={setActiveId}
            allowDibujarParrilla={false}
          />

          {!soloConsulta && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${theme.border}` }}>
              <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color: theme.textMuted, marginBottom: 6 }}>
                Foto compartida *
              </div>
              {fotosLocal.length > 0 && (
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 8 }}>
                  {fotosLocal.map((f, i) => (
                    <img
                      key={`${f.url}-${i}`}
                      src={f.url}
                      alt=""
                      style={{ width: 88, height: 66, objectFit: 'cover', borderRadius: 6 }}
                    />
                  ))}
                </div>
              )}
              <label style={{
                display: 'inline-block',
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                padding: '6px 12px',
                cursor: 'pointer',
                color: theme.primary,
                fontWeight: 700,
                fontSize: 'var(--cc-sm)',
              }}
              >
                + Foto(s)
                <input type="file" accept="image/*" multiple capture="environment" style={{ display: 'none' }} onChange={onFiles} />
              </label>
            </div>
          )}

          {error && (
            <div style={{ marginTop: 10, color: '#F87171', fontSize: 'var(--cc-sm)' }} title={error}>
              {error}
            </div>
          )}
        </div>

        {!soloConsulta && (
          <div style={{
            padding: '12px 16px',
            borderTop: `1px solid ${theme.border}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
          >
            <button type="button" onClick={onClose} disabled={busy} style={{
              background: 'transparent', border: `1px solid ${theme.border}`,
              color: theme.text, borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontWeight: 600,
            }}
            >
              Cancelar
            </button>
            <button
              type="button"
              data-testid="sicoe-cuadro-aceros-cargar"
              onClick={handleCargar}
              disabled={busy}
              title="Crea un registro por posición con la foto y el PNG del cuadro"
              style={{
                background: theme.primary, border: 'none', color: '#fff',
                borderRadius: 8, padding: '8px 18px', cursor: busy ? 'wait' : 'pointer', fontWeight: 800,
              }}
            >
              {busy ? 'Cargando…' : 'Cargar'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/**
 * Ventana institucional: rejilla de tarjetas de registros de un ítem + detalle.
 * Reemplaza el acordeón de ítem → registros en SicoeObra.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import { formatearCantidadTotal } from './sicoeCantidadRedondeo.js'
import { SicoeHojaRegistroErrorBoundary } from './SicoeHojaRegistroErrorBoundary.jsx'
import {
  ESTADOS_CONVENCION_VENTANA,
  colorDeEstadoValidacion,
  etiquetaNivelIniciales,
  fotoMiniaturaRegistro,
  idRegistroAnterior,
  idRegistroSiguiente,
  indiceRegistroEnLista,
  mapaUsuariosPorId,
  ultimaValidacionRegistro,
} from './sicoeItemRegistrosVentanaHelpers.js'

function LeyendaEstados({ t }) {
  return (
    <div
      data-testid="sicoe-item-ventana-leyenda"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px 14px',
        alignItems: 'center',
        fontSize: 'var(--cc-caption)',
        color: t.textMuted,
      }}
    >
      {ESTADOS_CONVENCION_VENTANA.map((e) => (
        <span key={e.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: e.color,
              border: `1px solid ${e.color}`,
              flexShrink: 0,
            }}
          />
          {e.label}
        </span>
      ))}
    </div>
  )
}

function BotonInfoObservacion({
  t,
  observacion,
  cargando,
  onNeedLoad,
}) {
  const [open, setOpen] = useState(false)
  const tipRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    onNeedLoad?.()
    const close = (ev) => {
      if (tipRef.current && !tipRef.current.contains(ev.target)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open, onNeedLoad])

  const texto = cargando
    ? 'Cargando…'
    : (observacion && String(observacion).trim()) || 'Sin observación de validación'

  return (
    <span ref={tipRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        title="Observación de la validación"
        aria-label="Observación de la validación"
        data-testid="sicoe-item-tarjeta-info"
        onMouseEnter={() => { setOpen(true); onNeedLoad?.() }}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
          onNeedLoad?.()
        }}
        style={{
          background: 'transparent',
          border: `1px solid ${t.border}`,
          borderRadius: 6,
          width: 28,
          height: 28,
          cursor: 'pointer',
          color: t.primary,
          fontWeight: 800,
          fontSize: 'var(--cc-sm)',
          padding: 0,
          lineHeight: 1,
        }}
      >
        ⓘ
      </button>
      {open && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            zIndex: 5,
            left: 0,
            top: '110%',
            minWidth: 160,
            maxWidth: 240,
            padding: '8px 10px',
            background: t.bgCard,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            color: t.text,
            fontSize: 'var(--cc-caption)',
            lineHeight: 1.35,
            whiteSpace: 'pre-wrap',
          }}
        >
          {texto}
        </div>
      )}
    </span>
  )
}

function TarjetaRegistro({
  t,
  reg,
  nivelesActivos,
  usuariosById,
  observacion,
  obsCargando,
  onNeedObs,
  onSelect,
  selected,
  checked = false,
  onToggleSeleccion,
}) {
  const uv = useMemo(() => ultimaValidacionRegistro(reg, nivelesActivos), [reg, nivelesActivos])
  const color = colorDeEstadoValidacion(uv.estado)
  const etiqueta = etiquetaNivelIniciales(uv, usuariosById)
  const thumb = fotoMiniaturaRegistro(reg)
  const cant = formatearCantidadTotal(reg?.cantidad_total)

  return (
    <div
      data-testid={`sicoe-item-tarjeta-${reg.id}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(reg.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect?.(reg.id)
        }
      }}
      title={`Registro #${reg.numero_registro}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        textAlign: 'left',
        background: t.bgCard,
        border: `3px solid ${color}`,
        borderRadius: 12,
        padding: 10,
        cursor: 'pointer',
        color: t.text,
        outline: selected ? `2px solid ${t.primary}` : 'none',
        outlineOffset: 2,
        minWidth: 0,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', minWidth: 0 }}>
          {typeof onToggleSeleccion === 'function' && (
            <input
              type="checkbox"
              checked={!!checked}
              onClick={(e) => e.stopPropagation()}
              onChange={() => onToggleSeleccion(reg.id)}
              aria-label={`Seleccionar registro ${reg.numero_registro}`}
              style={{ width: 16, height: 16, accentColor: t.primary, marginTop: 2, flexShrink: 0 }}
            />
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, color: t.primary, fontSize: 'var(--cc-sm)' }}>
              #{reg.numero_registro}
            </div>
            <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, fontVariantNumeric: 'tabular-nums' }}>
              Cant. Total {cant}
            </div>
          </div>
        </div>
        <BotonInfoObservacion
          t={t}
          observacion={observacion}
          cargando={obsCargando}
          onNeedLoad={() => onNeedObs?.(reg.id)}
        />
      </div>
      <div
        style={{
          width: '100%',
          aspectRatio: '4 / 3',
          borderRadius: 8,
          overflow: 'hidden',
          background: t.bg,
          border: `1px solid ${t.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {thumb ? (
          <img
            src={thumb}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <span style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>Sin foto</span>
        )}
      </div>
      <div
        style={{
          display: 'inline-flex',
          alignSelf: 'flex-start',
          background: `${color}22`,
          color,
          border: `1px solid ${color}66`,
          borderRadius: 999,
          padding: '2px 8px',
          fontSize: 'var(--cc-caption)',
          fontWeight: 800,
        }}
        title={uv.estado}
      >
        {etiqueta}
      </div>
    </div>
  )
}

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   t: object,
 *   itemNum: string,
 *   itemDescripcion?: string,
 *   registros: object[],
 *   registroIdActivo?: string|number|null,
 *   onRegistroIdActivo?: (id: string|number|null) => void,
 *   nivelesActivos?: number[],
 *   renderHojaRegistro: (reg: object, ctx: { onTrasValidacionExitosa: () => void, evidenciaMosaico: boolean }) => React.ReactNode,
 *   renderMenuAcciones?: (reg: object) => React.ReactNode,
 *   API_URL?: string,
 *   contratoId?: number|string,
 *   hdrs?: object,
 *   fetchObservacionValidacion?: (regId: string|number) => Promise<string|null>,
 * }} props
 */
export default function SicoeItemRegistrosVentana({
  open,
  onClose,
  t,
  itemNum,
  itemDescripcion = '',
  registros = [],
  registroIdActivo = null,
  onRegistroIdActivo,
  nivelesActivos = [1, 2, 3],
  renderHojaRegistro,
  renderMenuAcciones,
  API_URL,
  contratoId,
  hdrs = {},
  fetchObservacionValidacion,
  seleccionados = [],
  onToggleSeleccion,
}) {
  const theme = t || {
    bgCard: '#0F1923',
    bg: '#15202B',
    border: '#334155',
    text: '#E2E8F0',
    textMuted: '#94A3B8',
    primary: '#0EA5A8',
  }

  const regs = useMemo(
    () => [...(registros || [])].sort(
      (a, b) => (Number(a.numero_registro) || 0) - (Number(b.numero_registro) || 0),
    ),
    [registros],
  )

  const [vista, setVista] = useState('rejilla') // 'rejilla' | 'detalle'
  const [usuariosById, setUsuariosById] = useState({})
  const [obsMap, setObsMap] = useState({})
  const [obsLoading, setObsLoading] = useState({})
  const touchRef = useRef({ x: 0, y: 0 })

  // Apertura: 1 registro → detalle; 2+ → rejilla (salvo deep-link con registroId)
  useEffect(() => {
    if (!open) return
    if (regs.length <= 1) {
      setVista('detalle')
      if (regs[0]?.id != null) onRegistroIdActivo?.(regs[0].id)
      return
    }
    if (registroIdActivo != null && indiceRegistroEnLista(regs, registroIdActivo) >= 0) {
      setVista('detalle')
    } else {
      setVista('rejilla')
    }
  }, [open, itemNum]) // eslint-disable-line react-hooks/exhaustive-deps -- solo al abrir / cambiar ítem

  useEffect(() => {
    if (!open || !API_URL || contratoId == null) return undefined
    let cancelled = false
    fetch(`${API_URL}/actas/${contratoId}/usuarios-contrato`, { headers: hdrs })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setUsuariosById(mapaUsuariosPorId(Array.isArray(d) ? d : []))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [open, API_URL, contratoId]) // eslint-disable-line react-hooks/exhaustive-deps

  const regActivo = useMemo(() => {
    const i = indiceRegistroEnLista(regs, registroIdActivo)
    if (i >= 0) return regs[i]
    return regs.length === 1 ? regs[0] : null
  }, [regs, registroIdActivo])

  const uvActivo = useMemo(
    () => (regActivo ? ultimaValidacionRegistro(regActivo, nivelesActivos) : null),
    [regActivo, nivelesActivos],
  )
  const colorActivo = uvActivo ? colorDeEstadoValidacion(uvActivo.estado) : theme.border

  const loadObs = useCallback(async (regId) => {
    if (regId == null) return
    if (obsMap[regId] != null || obsLoading[regId]) return
    if (typeof fetchObservacionValidacion !== 'function') {
      setObsMap((m) => ({ ...m, [regId]: '' }))
      return
    }
    setObsLoading((m) => ({ ...m, [regId]: true }))
    try {
      const txt = await fetchObservacionValidacion(regId)
      setObsMap((m) => ({ ...m, [regId]: txt || '' }))
    } catch {
      setObsMap((m) => ({ ...m, [regId]: '' }))
    } finally {
      setObsLoading((m) => ({ ...m, [regId]: false }))
    }
  }, [fetchObservacionValidacion, obsMap, obsLoading])

  const irDetalle = (id) => {
    onRegistroIdActivo?.(id)
    setVista('detalle')
  }

  const irRejilla = () => {
    setVista('rejilla')
  }

  const irAnterior = () => {
    const prev = idRegistroAnterior(regs, registroIdActivo ?? regActivo?.id)
    if (prev != null) onRegistroIdActivo?.(prev)
  }

  const irSiguiente = () => {
    const next = idRegistroSiguiente(regs, registroIdActivo ?? regActivo?.id)
    if (next != null) onRegistroIdActivo?.(next)
  }

  const trasValidar = useCallback(() => {
    const cur = registroIdActivo ?? regActivo?.id
    const next = idRegistroSiguiente(regs, cur)
    if (next != null) {
      onRegistroIdActivo?.(next)
      setVista('detalle')
    } else {
      setVista('rejilla')
    }
  }, [registroIdActivo, regActivo, regs, onRegistroIdActivo])

  const onTouchStart = (e) => {
    const touch = e.changedTouches?.[0]
    if (!touch) return
    touchRef.current = { x: touch.clientX, y: touch.clientY }
  }
  const onTouchEnd = (e) => {
    const touch = e.changedTouches?.[0]
    if (!touch) return
    const dx = touch.clientX - touchRef.current.x
    const dy = touch.clientY - touchRef.current.y
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy)) return
    if (dx < 0) irSiguiente()
    else irAnterior()
  }

  if (!open || typeof document === 'undefined') return null

  const title = `Ítem ${itemNum}${itemDescripcion ? ` · ${itemDescripcion}` : ''}`

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="sicoe-item-registros-ventana"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 16000,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '12px',
        overflowY: 'auto',
      }}
    >
      <div
        className="cc-sicoe-item-ventana"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 'min(1100px, 98vw)',
          maxHeight: 'min(92vh, 960px)',
          background: theme.bgCard,
          border: `1px solid ${theme.border}`,
          borderRadius: 16,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
          color: theme.text,
        }}
      >
        <CcModalBrandHeader theme={theme} />

        <div
          style={{
            padding: '10px 14px',
            borderBottom: `1px solid ${theme.border}`,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)', color: theme.primary }}>
              {title}
            </div>
            <div style={{ marginTop: 6 }}>
              <LeyendaEstados t={theme} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            {vista === 'detalle' && regs.length > 1 && (
              <>
                <button
                  type="button"
                  title="Anterior"
                  aria-label="Anterior"
                  data-testid="sicoe-item-ventana-prev"
                  onClick={irAnterior}
                  disabled={indiceRegistroEnLista(regs, regActivo?.id) <= 0}
                  style={iconBtn(theme)}
                >
                  ←
                </button>
                <button
                  type="button"
                  title="Siguiente"
                  aria-label="Siguiente"
                  data-testid="sicoe-item-ventana-next"
                  onClick={irSiguiente}
                  disabled={indiceRegistroEnLista(regs, regActivo?.id) >= regs.length - 1}
                  style={iconBtn(theme)}
                >
                  →
                </button>
                <button
                  type="button"
                  title="Volver a la rejilla"
                  aria-label="Volver a la rejilla"
                  data-testid="sicoe-item-ventana-volver-rejilla"
                  onClick={irRejilla}
                  style={iconBtn(theme)}
                >
                  ⊞
                </button>
              </>
            )}
            <button
              type="button"
              title="Cerrar"
              aria-label="Cerrar"
              onClick={onClose}
              style={iconBtn(theme)}
            >
              ✕
            </button>
          </div>
        </div>

        <div
          style={{ flex: 1, overflowY: 'auto', padding: 14, WebkitOverflowScrolling: 'touch' }}
          onTouchStart={vista === 'detalle' ? onTouchStart : undefined}
          onTouchEnd={vista === 'detalle' ? onTouchEnd : undefined}
        >
          {vista === 'rejilla' && (
            <div
              data-testid="sicoe-item-ventana-rejilla"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                gap: 12,
              }}
            >
              {regs.map((reg) => (
                <TarjetaRegistro
                  key={reg.id}
                  t={theme}
                  reg={reg}
                  nivelesActivos={nivelesActivos}
                  usuariosById={usuariosById}
                  observacion={obsMap[reg.id]}
                  obsCargando={!!obsLoading[reg.id]}
                  onNeedObs={loadObs}
                  onSelect={irDetalle}
                  selected={String(registroIdActivo) === String(reg.id)}
                  checked={seleccionados.includes(reg.id)}
                  onToggleSeleccion={onToggleSeleccion}
                />
              ))}
            </div>
          )}

          {vista === 'detalle' && regActivo && (
            <div
              data-testid="sicoe-item-ventana-detalle"
              style={{
                border: `3px solid ${colorActivo}`,
                borderRadius: 12,
                overflow: 'hidden',
                background: theme.bg,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderBottom: `1px solid ${theme.border}`,
                  background: theme.bgCard,
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, color: theme.primary }}>
                    Registro #{regActivo.numero_registro}
                  </span>
                  <span
                    style={{
                      background: `${colorActivo}22`,
                      color: colorActivo,
                      border: `1px solid ${colorActivo}66`,
                      borderRadius: 999,
                      padding: '2px 8px',
                      fontSize: 'var(--cc-caption)',
                      fontWeight: 800,
                    }}
                  >
                    {etiquetaNivelIniciales(uvActivo, usuariosById)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {typeof renderMenuAcciones === 'function' ? renderMenuAcciones(regActivo) : null}
                </div>
              </div>
              <SicoeHojaRegistroErrorBoundary resetKey={regActivo.id} t={theme}>
                {typeof renderHojaRegistro === 'function'
                  ? renderHojaRegistro(regActivo, {
                    onTrasValidacionExitosa: trasValidar,
                    evidenciaMosaico: true,
                  })
                  : null}
              </SicoeHojaRegistroErrorBoundary>
            </div>
          )}

          {vista === 'detalle' && !regActivo && (
            <div style={{ color: theme.textMuted, textAlign: 'center', padding: 24 }}>
              Seleccione un registro.
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function iconBtn(theme) {
  return {
    background: 'transparent',
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    width: 36,
    height: 36,
    cursor: 'pointer',
    color: theme.text,
    fontWeight: 700,
    fontSize: 'var(--cc-md)',
    lineHeight: 1,
    padding: 0,
  }
}

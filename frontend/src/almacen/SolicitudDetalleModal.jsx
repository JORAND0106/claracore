import { useCallback, useEffect, useMemo, useState } from 'react'
import { btnSuccessStyle } from '../theme/adminPanelTheme'
import CcConfirmModal from '../components/CcConfirmModal'
import ExpedienteCompraModal from './ExpedienteCompraModal'
import OrdenCompraPdfClip from './OrdenCompraPdfClip'
import SolicitudItemDetalleCard from './SolicitudItemDetalleCard'
import SolicitudTrazabilidadPanel from './SolicitudTrazabilidadPanel'
import { solicitudAlmacenEditable, solicitudTituloEditable } from './almacenPermisos'
import {
  estadoValidacionItem,
  itemPuedeValidar,
  labelPestañaInsumo,
  solicitudPuedeValidar,
  solicitudTieneOrdenCompra,
} from './solicitudDetalleHelpers'
import {
  ESTADO_SOLICITUD_LABEL,
  almacenFormModalDialogStyle,
  fmtCant,
  useAlmacenApi,
  useAlmacenCompact,
  useAlmacenTheme,
} from './almacenShared'

const ITEM_VALIDACION_LABEL = {
  pendiente: 'Pendiente',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
}

const ITEM_VALIDACION_COLOR = {
  pendiente: '#d97706',
  aprobado: '#059669',
  rechazado: '#dc2626',
}

/**
 * Popup de detalle de solicitud — portada + pestaña por insumo (estilo SICOE Carpeta).
 */
export default function SolicitudDetalleModal({
  solicitudId,
  initialTab = 'portada',
  permisos,
  token,
  t,
  contratoId,
  onClose,
  onUpdated,
  onEdit,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const compact = useAlmacenCompact()
  const [sol, setSol] = useState(null)
  const [tab, setTab] = useState(initialTab)
  const [motivo, setMotivo] = useState('')
  const [motivoItem, setMotivoItem] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmAprobar, setConfirmAprobar] = useState(false)
  const [expedienteOcId, setExpedienteOcId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tituloDraft, setTituloDraft] = useState('')
  const [guardandoTitulo, setGuardandoTitulo] = useState(false)

  const theme = t || {
    primary: ui.accent,
    border: '#e2e8f0',
    text: ui.text,
    textMuted: ui.textMuted,
    bgCard: ui.card?.background || '#fff',
  }

  const modalTheme = useMemo(() => ({
    primary: ui.accent,
    bgCard: ui.card?.background || '#fff',
    border: '#e2e8f0',
    text: ui.text,
    textMuted: ui.textMuted,
  }), [ui])

  const reload = useCallback(() => {
    if (!solicitudId) return Promise.resolve()
    setLoading(true)
    return api.getSolicitud(solicitudId)
      .then(setSol)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [api, solicitudId])

  useEffect(() => { void reload() }, [reload])

  useEffect(() => {
    setTituloDraft(sol?.titulo || '')
  }, [sol?.titulo, sol?.id])

  const items = sol?.items || []
  const editable = Boolean(permisos?.editar && solicitudAlmacenEditable(sol))
  const puedeEditarTitulo = solicitudTituloEditable(permisos)
  const puedeValidar = solicitudPuedeValidar(sol, permisos)
  const tieneOc = solicitudTieneOrdenCompra(sol)
  const verEconomicos = permisos?.verEconomicos !== false

  const tabs = useMemo(() => [
    { key: 'portada', label: '📋 Portada' },
    ...items.map((it, idx) => ({
      key: `item-${it.id ?? idx}`,
      itemId: it.id,
      label: labelPestañaInsumo(it, idx),
      estado: estadoValidacionItem(it, sol),
    })),
  ], [items, sol])

  const resumenValidacion = useMemo(() => {
    const counts = { pendiente: 0, aprobado: 0, rechazado: 0 }
    items.forEach((it) => {
      const e = estadoValidacionItem(it, sol) || 'pendiente'
      if (counts[e] != null) counts[e] += 1
    })
    return counts
  }, [items, sol])

  const ejecutarAprobar = async (aprobarTodosPendientes = true) => {
    if (!sol) return
    setBusy(true)
    setError('')
    try {
      const r = await api.aprobarSolicitud(sol.id, { aprobar_todos_pendientes: aprobarTodosPendientes })
      setConfirmAprobar(false)
      onUpdated?.(r)
      const oc = r.orden_compra_generada || r.orden_compra
      if (oc?.id) {
        setExpedienteOcId(oc.id)
        setSol(r)
      } else {
        onClose?.()
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const aprobarTodosItems = async () => {
    if (!sol) return
    setBusy(true)
    setError('')
    try {
      const r = await api.aprobarTodosItemsSolicitud(sol.id)
      setSol(r)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const validarItem = async (itemId, accion) => {
    if (!sol || !itemId) return
    if (accion === 'rechazar' && !motivoItem.trim()) {
      setError('Indique el motivo del rechazo del ítem.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const r = await api.validarItemSolicitud(sol.id, itemId, {
        accion,
        motivo: accion === 'rechazar' ? motivoItem : undefined,
      })
      setSol(r)
      setMotivoItem('')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const rechazar = async () => {
    if (!sol) return
    if (!motivo.trim()) {
      setError('Indique el motivo del rechazo.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const r = await api.rechazarSolicitud(sol.id, motivo)
      onUpdated?.(r)
      onClose?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const tituloDisplay = sol?.titulo?.trim() || `Solicitud #${sol?.consecutivo || '…'}`

  const guardarTitulo = async () => {
    if (!sol?.id || !puedeEditarTitulo) return
    const next = tituloDraft.trim()
    const prev = (sol.titulo || '').trim()
    if (next === prev) return
    setGuardandoTitulo(true)
    setError('')
    try {
      const r = await api.updateSolicitud(sol.id, { titulo: next })
      setSol(r)
    } catch (e) {
      setError(e.message)
      setTituloDraft(sol.titulo || '')
    } finally {
      setGuardandoTitulo(false)
    }
  }

  const renderPortada = () => (
    <div>
      {puedeValidar && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, fontSize: 'var(--cc-xs)' }}>
          <span style={{ padding: '3px 8px', borderRadius: 6, background: '#fef3c7', color: '#92400e' }}>
            Pendientes: {resumenValidacion.pendiente}
          </span>
          <span style={{ padding: '3px 8px', borderRadius: 6, background: '#ecfdf5', color: '#065f46' }}>
            Aprobados: {resumenValidacion.aprobado}
          </span>
          <span style={{ padding: '3px 8px', borderRadius: 6, background: '#fef2f2', color: '#991b1b' }}>
            Rechazados: {resumenValidacion.rechazado}
          </span>
        </div>
      )}

      {sol?.motivo_rechazo && (
        <div style={{
          fontSize: 'var(--cc-xs)',
          color: '#991b1b',
          marginBottom: 10,
          padding: '6px 10px',
          borderRadius: 6,
          background: 'color-mix(in srgb, #dc2626 8%, var(--cc-almacen-bg-card, #fff))',
          border: '1px solid color-mix(in srgb, #dc2626 20%, transparent)',
        }}
        >
          Motivo de rechazo: {sol.motivo_rechazo}
          {editable && (
            <div style={{ marginTop: 6, color: ui.textMuted }}>
              Puede editar la solicitud y reenviarla a aprobación.
            </div>
          )}
        </div>
      )}

      {(tieneOc || (sol?.estado === 'aprobada' && sol?.orden_compra?.id && permisos?.exportar)) && (
        <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {sol?.estado === 'aprobada' && sol?.orden_compra?.id && permisos?.exportar && (
            <OrdenCompraPdfClip ordenCompra={sol.orden_compra} puedeExportar />
          )}
          {tieneOc && (
            <span style={{
              padding: '4px 10px',
              borderRadius: 6,
              background: '#ecfdf5',
              color: '#065f46',
              fontSize: 'var(--cc-xs)',
              fontWeight: 600,
            }}
            >
              ✓ OC #{sol?.orden_compra?.numero_oc} generada
            </span>
          )}
        </div>
      )}

      <div style={{ fontWeight: 700, fontSize: 'var(--cc-sm)', marginBottom: 6 }}>
        Insumos solicitados ({items.length})
      </div>
      <div style={{ overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)' }}>
          <thead>
            <tr>
              <th style={{ ...ui.th, textAlign: 'left' }}>#</th>
              <th style={{ ...ui.th, textAlign: 'left' }}>Insumo</th>
              <th style={{ ...ui.th, textAlign: 'right' }}>Cantidad</th>
              {puedeValidar && <th style={{ ...ui.th, textAlign: 'left' }}>Validación</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const ev = estadoValidacionItem(it, sol) || 'pendiente'
              return (
                <tr
                  key={it.id ?? idx}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setTab(`item-${it.id ?? idx}`)}
                >
                  <td style={ui.td}>{it.numero_linea ?? idx + 1}</td>
                  <td style={ui.td}>{it.material_descripcion}</td>
                  <td style={{ ...ui.td, textAlign: 'right' }}>
                    {fmtCant(it.cantidad)} {it.unidad || ''}
                  </td>
                  {puedeValidar && (
                    <td style={{ ...ui.td, color: ITEM_VALIDACION_COLOR[ev], fontWeight: 600 }}>
                      {ITEM_VALIDACION_LABEL[ev] || ev}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        {editable && (
          <button type="button" style={ui.btnPrimary} disabled={busy} onClick={() => onEdit?.(sol)}>
            ✏️ Editar / agregar insumos
          </button>
        )}
        {puedeValidar && (
          <>
            <button type="button" style={ui.btnSecondary} disabled={busy} onClick={aprobarTodosItems}>
              ✓ Aprobar todos los ítems
            </button>
            <button
              type="button"
              style={btnSuccessStyle(ui.btnPrimary)}
              disabled={busy}
              onClick={() => setConfirmAprobar(true)}
            >
              ✓ Aprobar y generar OC
            </button>
          </>
        )}
      </div>

      {puedeValidar && (
        <>
          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>Motivo rechazo de la solicitud (si aplica)</label>
            <input
              style={{ ...ui.input, marginTop: 4 }}
              value={motivo}
              disabled={busy}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              style={{ ...ui.btnPrimary, background: '#dc2626' }}
              disabled={busy}
              onClick={rechazar}
            >
              ✕ Rechazar solicitud completa
            </button>
          </div>
        </>
      )}
    </div>
  )

  const activeItem = useMemo(() => {
    if (tab === 'portada') return null
    const tabIdx = tabs.findIndex((tb) => tb.key === tab)
    if (tabIdx <= 0) return null
    return items[tabIdx - 1] || null
  }, [tab, tabs, items])

  return (
    <div
      className={compact ? 'cc-almacen-modal-overlay cc-almacen-modal-overlay--compact' : 'cc-almacen-modal-overlay'}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100010,
        display: 'flex',
        alignItems: compact ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: compact ? 0 : 16,
      }}
      onClick={() => !busy && onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={compact ? 'cc-almacen-modal-sheet' : ''}
        onClick={(e) => e.stopPropagation()}
        style={{
          ...almacenFormModalDialogStyle({ width: 'min(1248px, 100%)', compact }),
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{
          padding: compact ? '16px 16px 0' : '20px 20px 0',
          flexShrink: 0,
        }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginBottom: 2 }}>
                {sol?.consecutivo ? `#${sol.consecutivo}` : ''}
                {sol?.estado ? ` · ${ESTADO_SOLICITUD_LABEL[sol.estado]}` : ''}
              </div>
              {puedeEditarTitulo ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    style={{ ...ui.input, flex: 1, minWidth: 200, fontWeight: 700, fontSize: 'var(--cc-title)' }}
                    value={tituloDraft}
                    disabled={busy || guardandoTitulo}
                    placeholder={tituloDisplay}
                    onChange={(e) => setTituloDraft(e.target.value)}
                    onBlur={() => { void guardarTitulo() }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void guardarTitulo()
                      }
                    }}
                  />
                  {guardandoTitulo && (
                    <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>Guardando…</span>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 'var(--cc-title)', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {tituloDisplay}
                </div>
              )}
            </div>
            <button type="button" style={ui.btnSecondary} disabled={busy} onClick={onClose}>✕</button>
          </div>

          <SolicitudTrazabilidadPanel sol={sol} />

          <div
            className="cc-almacen-tab-bar cc-almacen-tab-bar--detalle"
            style={{
              ...ui.tabBar,
              overflowX: 'auto',
              flexWrap: 'nowrap',
              marginBottom: 0,
              marginTop: 10,
            }}
          >
            {tabs.map((tb) => (
              <button
                key={tb.key}
                type="button"
                className={`cc-almacen-tab-btn${tab === tb.key ? ' cc-almacen-tab-btn--active' : ''}`}
                style={{
                  ...ui.tabBtn(tab === tb.key),
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
                onClick={() => setTab(tb.key)}
              >
                {tb.estado === 'aprobado' && '✅ '}
                {tb.estado === 'rechazado' && '❌ '}
                {tb.estado === 'pendiente' && puedeValidar && '⏳ '}
                {tb.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: compact ? '12px 16px calc(16px + env(safe-area-inset-bottom, 0px))' : '16px 20px 20px',
        }}
        >
          {loading && <div style={{ color: ui.textMuted, marginBottom: 12 }}>Cargando…</div>}
          {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}

          {tab === 'portada' && !loading && renderPortada()}

          {activeItem && (
            <div>
              <SolicitudItemDetalleCard
                item={{
                  ...activeItem,
                  presupuesto_capitulo: activeItem.capitulo,
                  presupuesto_item: activeItem.item,
                  insumo: { label: activeItem.material_descripcion },
                  numero_oc: sol?.orden_compra?.numero_oc,
                  orden_compra: sol?.orden_compra,
                  preview: {
                    contexto_presupuesto: activeItem.contexto_presupuesto,
                    analisis_valor: activeItem.analisis_valor,
                    analisis_rentabilidad: activeItem.analisis_rentabilidad,
                    supera_presupuesto: activeItem.supera_presupuesto,
                    contexto_negociado: activeItem.contexto_negociado,
                    supera_negociado: activeItem.supera_negociado,
                  },
                }}
                consecutivo={sol?.consecutivo}
                lineIndex={activeItem.numero_linea}
                contratoId={contratoId}
                token={token}
                theme={theme}
                accordion={false}
                verEconomicos={verEconomicos}
              />

              {itemPuedeValidar(activeItem, sol, permisos) && (
                <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${ui.textMuted}33` }}>
                  <div style={{ fontWeight: 700, fontSize: 'var(--cc-sm)', marginBottom: 8 }}>
                    Validación de este ítem
                  </div>
                  <div style={{
                    fontSize: 'var(--cc-sm)',
                    marginBottom: 8,
                    color: ITEM_VALIDACION_COLOR[estadoValidacionItem(activeItem, sol) || 'pendiente'],
                    fontWeight: 600,
                  }}
                  >
                    Estado: {ITEM_VALIDACION_LABEL[estadoValidacionItem(activeItem, sol) || 'pendiente']}
                  </div>
                  <input
                    style={{ ...ui.input, marginBottom: 8 }}
                    placeholder="Motivo si rechaza este ítem…"
                    value={motivoItem}
                    disabled={busy}
                    onChange={(e) => setMotivoItem(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      style={btnSuccessStyle(ui.btnSecondary)}
                      disabled={busy}
                      onClick={() => validarItem(activeItem.id, 'aprobar')}
                    >
                      ✓ Aprobar ítem
                    </button>
                    <button
                      type="button"
                      style={{ ...ui.btnSecondary, color: '#dc2626', borderColor: '#dc262666' }}
                      disabled={busy}
                      onClick={() => validarItem(activeItem.id, 'rechazar')}
                    >
                      ✕ Rechazar ítem
                    </button>
                  </div>
                </div>
              )}

              {activeItem?.en_orden_compra && (
                <div style={{
                  marginTop: 16,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: '#ecfdf5',
                  color: '#065f46',
                  fontSize: 'var(--cc-sm)',
                }}
                >
                  Este ítem ya está incluido en la Orden de Compra generada.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {confirmAprobar && (
        <CcConfirmModal
          theme={modalTheme}
          titulo="Aprobar solicitud"
          tipo="info"
          confirmar="Aprobar y generar OC"
          cancelar="Cancelar"
          procesando={busy}
          onCancel={() => !busy && setConfirmAprobar(false)}
          onConfirm={() => ejecutarAprobar(true)}
        >
          ¿Generar la Orden de Compra con los ítems aprobados?
          Los ítems pendientes se marcarán como aprobados; los rechazados no entrarán en la OC.
        </CcConfirmModal>
      )}

      {expedienteOcId && (
        <ExpedienteCompraModal
          ocId={expedienteOcId}
          token={token}
          onClose={() => {
            setExpedienteOcId(null)
            onClose?.()
          }}
        />
      )}
    </div>
  )
}

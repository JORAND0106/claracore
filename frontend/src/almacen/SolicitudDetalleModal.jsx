import { useCallback, useEffect, useMemo, useState } from 'react'
import CcModalBrandHeader from '../components/CcModalBrandHeader'
import { btnSuccessStyle } from '../theme/adminPanelTheme'
import CcConfirmModal from '../components/CcConfirmModal'
import ExpedienteCompraModal from './ExpedienteCompraModal'
import OrdenCompraPdfClip from './OrdenCompraPdfClip'
import SolicitudLineaMapaModal from './SolicitudLineaMapaModal'
import SolicitudLineaRevisionModal from './SolicitudLineaRevisionModal'
import SolicitudMaterialesExcelTable from './SolicitudMaterialesExcelTable'
import SolicitudTrazabilidadPanel from './SolicitudTrazabilidadPanel'
import AlmacenTrazabilidadButton from './AlmacenTrazabilidadButton'
import { solicitudAlmacenEditable, solicitudTituloEditable } from './almacenPermisos'
import {
  estadoValidacionItem,
  puedeAbrirRevisionLinea,
  solicitudPuedeValidar,
  solicitudTieneOrdenCompra,
} from './solicitudDetalleHelpers'
import {
  ESTADO_SOLICITUD_LABEL,
  almacenFormModalDialogStyle,
  useAlmacenApi,
  useAlmacenCompact,
  useAlmacenTheme,
} from './almacenShared'

/**
 * Detalle de solicitud — encabezado + grilla Excel + modales de mapa/revisión.
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
  const [motivo, setMotivo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmAprobar, setConfirmAprobar] = useState(false)
  const [expedienteOcId, setExpedienteOcId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tituloDraft, setTituloDraft] = useState('')
  const [guardandoTitulo, setGuardandoTitulo] = useState(false)
  const [materialesOpen, setMaterialesOpen] = useState(true)
  const [mapaItem, setMapaItem] = useState(null)
  const [revisionItemId, setRevisionItemId] = useState(null)
  const [ocProgreso, setOcProgreso] = useState('')

  // initialTab legado (pestaña por ítem) → abrir modal de revisión de esa línea
  useEffect(() => {
    if (!puedeAbrirRevisionLinea(permisos)) return
    if (!initialTab || initialTab === 'portada') return
    const m = String(initialTab).match(/^item-(.+)$/)
    if (m?.[1]) setRevisionItemId(Number(m[1]) || m[1])
  }, [initialTab, permisos])

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
  const esRolRevision = puedeAbrirRevisionLinea(permisos)

  const revisionItem = useMemo(() => {
    if (!esRolRevision || revisionItemId == null) return null
    return items.find((it) => String(it.id) === String(revisionItemId)) || null
  }, [items, revisionItemId, esRolRevision])

  const resumenValidacion = useMemo(() => {
    const counts = { pendiente: 0, aprobado: 0, rechazado: 0 }
    items.forEach((it) => {
      const e = estadoValidacionItem(it, sol) || 'pendiente'
      if (counts[e] != null) counts[e] += 1
    })
    return counts
  }, [items, sol])

  const itemsSinInsumo = useMemo(
    () => (items || []).filter((it) => !it.es_recurrente && !String(it.insumo_id || '').trim()),
    [items],
  )

  const mensajeFaltaInsumoOc = useMemo(() => {
    if (!itemsSinInsumo.length) return ''
    const detalle = itemsSinInsumo
      .slice(0, 12)
      .map((it) => {
        const n = it.numero_linea != null ? `#${it.numero_linea}` : (it.id != null ? `id ${it.id}` : '—')
        const mat = String(it.descripcion_solicitada || it.material_descripcion || it.descripcion || '').trim()
          || 'Sin descripción'
        return `• Línea ${n}: ${mat}`
      })
      .join('\n')
    const extra = itemsSinInsumo.length > 12
      ? `\n• (+${itemsSinInsumo.length - 12} más)`
      : ''
    return (
      `No se puede generar la Orden de Compra: faltan insumos del catálogo en ${itemsSinInsumo.length} material(es).\n\n` +
      `${detalle}${extra}\n\nAsigne el insumo en la revisión de cada línea antes de aprobar.`
    )
  }, [itemsSinInsumo])

  const intentarAprobarOc = () => {
    if (mensajeFaltaInsumoOc) {
      setConfirmAprobar(false)
      setError(mensajeFaltaInsumoOc)
      return
    }
    setError('')
    setConfirmAprobar(true)
  }

  const ejecutarAprobar = async (aprobarTodosPendientes = true) => {
    if (!sol) return
    if (mensajeFaltaInsumoOc) {
      setConfirmAprobar(false)
      setError(mensajeFaltaInsumoOc)
      return
    }
    setBusy(true)
    setOcProgreso('Generando orden de compra…')
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
      setOcProgreso('')
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
      onClick={() => !busy && !revisionItem && !mapaItem && onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={compact ? 'cc-almacen-modal-sheet' : ''}
        onClick={(e) => e.stopPropagation()}
        style={{
          ...almacenFormModalDialogStyle({ width: 'min(1622px, 100%)', compact }),
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <CcModalBrandHeader theme={t} />
        <div style={{
          padding: compact ? '16px 16px 0' : '20px 20px 0',
          flexShrink: 0,
        }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginBottom: 2 }}>
                {sol?.consecutivo ? `#${sol.consecutivo}` : ''}
                {sol?.estado ? ` · ${ESTADO_SOLICITUD_LABEL[sol.estado]}` : ''}
                {tieneOc && sol?.orden_compra?.numero_oc ? ` · OC #${sol.orden_compra.numero_oc}` : ''}
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
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
              {sol?.id != null && (
                <AlmacenTrazabilidadButton
                  token={token}
                  theme={t || modalTheme}
                  ui={ui}
                  entidadTipo="solicitud"
                  entidadId={sol.id}
                  titulo={`Almacén · Solicitud #${sol.consecutivo}${tituloDisplay ? ` · ${tituloDisplay}` : ''}`}
                />
              )}
              <button type="button" style={ui.btnSecondary} disabled={busy} onClick={onClose}>✕</button>
            </div>
          </div>

          <SolicitudTrazabilidadPanel sol={sol} />
        </div>

        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: compact ? '12px 16px calc(16px + env(safe-area-inset-bottom, 0px))' : '12px 20px 20px',
        }}
        >
          {loading && <div style={{ color: ui.textMuted, marginBottom: 12 }}>Cargando…</div>}
          {error && (
            <div style={{
              color: '#991b1b',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 8,
              padding: '10px 12px',
              marginBottom: 12,
              fontSize: 'var(--cc-sm)',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.45,
            }}
            >
              {error}
            </div>
          )}

          {!loading && sol && (
            <>
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

              {sol.motivo_rechazo && (
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
                </div>
              )}

              {(tieneOc || (sol.estado === 'aprobada' && sol.orden_compra?.id && permisos?.exportar)) && (
                <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  {sol.estado === 'aprobada' && sol.orden_compra?.id && permisos?.exportar && (
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
                      ✓ OC #{sol.orden_compra?.numero_oc} generada
                    </span>
                  )}
                </div>
              )}

              {/* Nivel 1: encabezado expandible → Nivel 2: tabla Excel */}
              <button
                type="button"
                onClick={() => setMaterialesOpen((v) => !v)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '10px 12px',
                  marginBottom: materialesOpen ? 8 : 0,
                  border: `1px solid ${ui.textMuted}33`,
                  borderRadius: 8,
                  background: `${ui.accentSoft}`,
                  cursor: 'pointer',
                  color: ui.text,
                  textAlign: 'left',
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 'var(--cc-sm)' }}>
                  📦 Materiales solicitados ({items.length})
                  {puedeValidar && (
                    <span style={{ fontWeight: 500, color: ui.textMuted, marginLeft: 8 }}>
                      — clic en una fila para revisar
                    </span>
                  )}
                </span>
                <span style={{ color: ui.textMuted, flexShrink: 0 }} aria-hidden>
                  {materialesOpen ? '▾' : '▸'}
                </span>
              </button>

              {materialesOpen && (
                <SolicitudMaterialesExcelTable
                  items={items}
                  sol={sol}
                  puedeValidar={puedeValidar}
                  onRowClick={(it) => {
                    if (it?.id != null) setRevisionItemId(it.id)
                  }}
                  onMapClick={(it) => setMapaItem(it)}
                />
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                {editable && (
                  <button type="button" style={ui.btnPrimary} disabled={busy} onClick={() => onEdit?.(sol)}>
                    ✏️ Editar / agregar materiales
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
                      onClick={intentarAprobarOc}
                    >
                      ✓ Aprobar y generar OC
                    </button>
                  </>
                )}
              </div>

              {puedeValidar && (
                <>
                  <div style={{ marginTop: 16 }}>
                    <label style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
                      Motivo rechazo de la solicitud (si aplica)
                    </label>
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
            </>
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

      {mapaItem && (
        <SolicitudLineaMapaModal
          item={mapaItem}
          token={token}
          contratoId={contratoId}
          t={t}
          onClose={() => setMapaItem(null)}
        />
      )}

      {revisionItem && esRolRevision && (
        <SolicitudLineaRevisionModal
          sol={sol}
          item={revisionItem}
          permisos={permisos}
          token={token}
          contratoId={contratoId}
          t={t}
          onClose={() => setRevisionItemId(null)}
          onUpdated={(r) => {
            setSol(r)
          }}
        />
      )}

      {ocProgreso && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100055,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.5)',
            padding: 24,
          }}
        >
          <div
            style={{
              background: ui.card?.background || '#fff',
              color: ui.text,
              borderRadius: 12,
              padding: '28px 32px',
              maxWidth: 380,
              textAlign: 'center',
              boxShadow: '0 20px 48px rgba(15, 23, 42, 0.35)',
              border: `1px solid ${ui.textMuted}33`,
            }}
          >
            <div
              aria-hidden
              style={{
                width: 36,
                height: 36,
                margin: '0 auto 14px',
                border: `3px solid ${ui.textMuted}33`,
                borderTopColor: ui.accent || '#2563eb',
                borderRadius: '50%',
                animation: 'cc-almacen-spin 0.8s linear infinite',
              }}
            />
            <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)', marginBottom: 6 }}>
              {ocProgreso}
            </div>
            <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, lineHeight: 1.45 }}>
              Se está creando la Orden de Compra. Espere un momento; no cierre esta ventana.
            </div>
          </div>
          <style>{`@keyframes cc-almacen-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </div>
  )
}

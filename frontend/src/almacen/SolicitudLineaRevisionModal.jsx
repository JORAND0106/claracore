import { useEffect, useMemo, useState } from 'react'
import { btnSuccessStyle } from '../theme/adminPanelTheme'
import InsumoSearchTable from './InsumoSearchTable'
import SolicitudLineaMapaModal from './SolicitudLineaMapaModal'
import TablaRentabilidadAcumulada from './TablaRentabilidadAcumulada'
import {
  descripcionItemPresupuesto,
  itemPuedeValidar,
  puedeAbrirRevisionLinea,
  rentabilidadDesdeAnalisis,
  textoLibreSolicitudItem,
} from './solicitudDetalleHelpers'
import {
  AlmacenFieldLabel,
  almacenFormModalDialogStyle,
  fmtCant,
  useAlmacenApi,
  useAlmacenCompact,
  useAlmacenTheme,
} from './almacenShared'

function Section({ ui, title, children, style }) {
  return (
    <section
      style={{
        border: `1px solid ${ui.textMuted}33`,
        borderRadius: 10,
        padding: '14px 16px',
        background: 'var(--cc-almacen-bg-card, #fff)',
        ...style,
      }}
    >
      {title && (
        <div style={{
          fontSize: 'var(--cc-xs)',
          fontWeight: 800,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: ui.textMuted,
          marginBottom: 10,
          paddingBottom: 8,
          borderBottom: `1px solid ${ui.textMuted}22`,
        }}
        >
          {title}
        </div>
      )}
      {children}
    </section>
  )
}

/**
 * Modal enfocado en la revisión Gerencial de una línea.
 * Ancho amplio y bloques separados por bordes definidos.
 */
export default function SolicitudLineaRevisionModal({
  sol,
  item,
  permisos,
  token,
  contratoId,
  t,
  onClose,
  onUpdated,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const compact = useAlmacenCompact()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [motivo, setMotivo] = useState('')
  const [mapaOpen, setMapaOpen] = useState(false)
  const [draft, setDraft] = useState({
    insumo: null,
    cantidad: '',
    valor_compra_unitario: '',
    vlr_unitario_cobro: '',
  })

  const puedeEditar = itemPuedeValidar(item, sol, permisos)
  const verEconomicos = permisos?.verEconomicos !== false
  const puedeAbrir = puedeAbrirRevisionLinea(permisos)

  useEffect(() => {
    if (!item) return
    setMotivo('')
    setError('')
    setMapaOpen(false)
    setDraft({
      insumo: item.insumo_id
        ? {
          insumo_id: item.insumo_id,
          listado_precio_id: item.listado_precio_id,
          label: item.material_descripcion,
          unidad: item.unidad,
          valor_compra_referencia: item.valor_compra_unitario,
          tiene_precio_compra: Number(item.valor_compra_unitario) > 0,
        }
        : null,
      cantidad: item.cantidad != null ? String(item.cantidad) : '',
      valor_compra_unitario: item.valor_compra_unitario != null && item.valor_compra_unitario !== ''
        ? String(item.valor_compra_unitario)
        : '',
      vlr_unitario_cobro: item.vlr_unitario_cobro != null && item.vlr_unitario_cobro !== ''
        ? String(item.vlr_unitario_cobro)
        : '',
    })
  }, [item?.id, item?.insumo_id, item?.cantidad, item?.valor_compra_unitario, item?.vlr_unitario_cobro, item?.material_descripcion])

  const descItem = useMemo(() => descripcionItemPresupuesto(item), [item])

  const metaLinea = useMemo(() => {
    if (!item) return ''
    const parts = [
      item.capitulo && item.item ? `${item.capitulo} · ${item.item}` : null,
      item.unidad ? `Und: ${item.unidad}` : null,
      item.pk_id ? `PK ${item.pk_id}` : null,
    ].filter(Boolean)
    return parts.join(' · ')
  }, [item])

  const tablaRentabilidad = useMemo(() => {
    if (!item) return null
    const raw = item.analisis_rentabilidad || item.preview?.analisis_rentabilidad
    if (raw) return raw
    const analisis = item.analisis_valor || item.preview?.analisis_valor
    if (analisis) {
      return rentabilidadDesdeAnalisis(analisis, {
        numeroOc: sol?.orden_compra?.numero_oc ?? item.numero_oc ?? null,
        consecutivo: sol?.consecutivo,
      })
    }
    // Provisional mientras el Gerencial ajusta cantidad/costos (antes de guardar).
    const cant = Number(draft.cantidad)
    const vuCobro = Number(draft.vlr_unitario_cobro)
    const vuCosto = Number(draft.valor_compra_unitario)
    if (!(cant > 0)) return null
    if (!(vuCobro > 0) && !(vuCosto > 0)) return null
    const cobroLinea = cant * (vuCobro > 0 ? vuCobro : 0)
    const costoLinea = cant * (vuCosto > 0 ? vuCosto : 0)
    return rentabilidadDesdeAnalisis({
      cantidad: cant,
      valor_cobro_unitario: vuCobro > 0 ? vuCobro : 0,
      valor_cobro_linea: cobroLinea,
      costo_insumo_unitario: vuCosto > 0 ? vuCosto : 0,
      costo_insumo_linea: costoLinea,
      utilidad_estimada_linea: cobroLinea - costoLinea,
      rentabilidad_pct: cobroLinea > 0 ? ((cobroLinea - costoLinea) / cobroLinea) * 100 : null,
      tiene_precio_compra: vuCosto > 0,
    }, {
      numeroOc: sol?.orden_compra?.numero_oc ?? null,
      consecutivo: sol?.consecutivo,
    })
  }, [item, draft.cantidad, draft.vlr_unitario_cobro, draft.valor_compra_unitario, sol?.consecutivo, sol?.orden_compra?.numero_oc])

  // Exclusivo Contratista Gerencial (o Desarrollador): sin acceso ni en lectura.
  if (!puedeAbrir || !item || !sol) return null

  const theme = t || {
    primary: ui.accent,
    border: '#e2e8f0',
    text: ui.text,
    textMuted: ui.textMuted,
    bgCard: ui.card?.background || '#fff',
  }

  const guardarMapeo = async () => {
    if (!draft.insumo?.insumo_id) {
      setError('Seleccione el insumo del catálogo.')
      return null
    }
    const cant = Number(draft.cantidad)
    if (!(cant > 0)) {
      setError('La cantidad debe ser mayor a cero.')
      return null
    }
    const costo = Number(draft.valor_compra_unitario)
    if (!(costo > 0)) {
      setError('Defina el costo de compra unitario.')
      return null
    }
    const body = {
      insumo_id: Number(draft.insumo.insumo_id),
      cantidad: cant,
      valor_compra_unitario: costo,
    }
    if (draft.vlr_unitario_cobro !== '') {
      body.vlr_unitario_cobro = Number(draft.vlr_unitario_cobro)
    }
    return api.mapearItemSolicitud(sol.id, item.id, body)
  }

  const validar = async (accion) => {
    if (!puedeEditar) return
    if (accion === 'rechazar' && !motivo.trim()) {
      setError('Indique el motivo del rechazo del ítem.')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (accion === 'aprobar') {
        const mapped = await guardarMapeo()
        if (!mapped) return
      }
      const r = await api.validarItemSolicitud(sol.id, item.id, {
        accion,
        motivo: accion === 'rechazar' ? motivo : undefined,
      })
      onUpdated?.(r)
      onClose?.()
    } catch (e) {
      setError(e.message || 'No se pudo validar el ítem.')
    } finally {
      setBusy(false)
    }
  }

  const soloGuardar = async () => {
    if (!puedeEditar) return
    setBusy(true)
    setError('')
    try {
      const r = await guardarMapeo()
      if (r) onUpdated?.(r)
    } catch (e) {
      setError(e.message || 'No se pudo guardar el mapeo.')
    } finally {
      setBusy(false)
    }
  }

  const dialogBorder = `1px solid ${ui.textMuted}40`

  return (
    <div
      className={compact ? 'cc-almacen-modal-overlay cc-almacen-modal-overlay--compact' : 'cc-almacen-modal-overlay'}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100035,
        display: 'flex',
        alignItems: compact ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: compact ? 0 : 20,
      }}
      onClick={() => !busy && !mapaOpen && onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="solicitud-linea-revision-title"
        className={compact ? 'cc-almacen-modal-sheet' : ''}
        onClick={(e) => e.stopPropagation()}
        style={{
          ...almacenFormModalDialogStyle({ width: 'min(960px, 100%)', compact }),
          maxHeight: compact ? '94vh' : '92vh',
          overflow: 'auto',
          border: dialogBorder,
          boxShadow: '0 24px 64px rgba(15, 23, 42, 0.28)',
          padding: compact ? '16px 16px calc(16px + env(safe-area-inset-bottom, 0px))' : '22px 24px 24px',
        }}
      >
        <header style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 16,
          paddingBottom: 14,
          borderBottom: `1px solid ${ui.textMuted}33`,
        }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div id="solicitud-linea-revision-title" style={{ fontSize: 'var(--cc-title)', fontWeight: 800 }}>
              Revisión de línea {item.numero_linea != null ? `#${item.numero_linea}` : ''}
            </div>
            {metaLinea && (
              <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginTop: 4 }}>
                {metaLinea}
              </div>
            )}
            {descItem && (
              <div style={{
                fontSize: 'var(--cc-sm)',
                fontWeight: 600,
                color: ui.text,
                marginTop: 6,
                lineHeight: 1.4,
              }}
              >
                {descItem}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'flex-start' }}>
            <button
              type="button"
              style={{ ...ui.btnSecondary, padding: '8px 14px' }}
              disabled={busy || !item.pk_id}
              title={item.pk_id ? 'Ver ubicación en mapa' : 'Sin PK-ID'}
              onClick={() => setMapaOpen(true)}
            >
              🗺️ Mapa
            </button>
            <button
              type="button"
              style={{ ...ui.btnSecondary, padding: '8px 14px' }}
              disabled={busy}
              onClick={onClose}
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
        </header>

        {error && (
          <div style={{
            color: '#991b1b',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            padding: '10px 12px',
            marginBottom: 14,
            fontSize: 'var(--cc-sm)',
          }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Section ui={ui} title="Descripción del Contratista">
            <div style={{
              fontSize: 'var(--cc-sm)',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.45,
              minHeight: 48,
              padding: '10px 12px',
              borderRadius: 8,
              background: `${ui.accentSoft}`,
              border: `1px solid ${ui.textMuted}22`,
            }}
            >
              {textoLibreSolicitudItem(item) || '—'}
            </div>
          </Section>

          {puedeEditar ? (
            <>
              <Section ui={ui} title="Insumo del catálogo">
                <InsumoSearchTable
                  value={draft.insumo}
                  disabled={busy}
                  onChange={(ins) => setDraft((d) => ({
                    ...d,
                    insumo: ins,
                    valor_compra_unitario: ins?.tiene_precio_compra
                      ? String(ins.valor_compra_referencia ?? '')
                      : d.valor_compra_unitario,
                  }))}
                />
              </Section>

              <Section ui={ui} title="Cantidad y costos">
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: compact ? '1fr' : (verEconomicos ? 'repeat(3, minmax(0, 1fr))' : '1fr'),
                  gap: 14,
                }}
                >
                  <div>
                    <AlmacenFieldLabel icon="🔢" label="Cantidad" compact />
                    <input
                      style={{ ...ui.input, padding: '10px 12px', fontSize: 'var(--cc-sm)' }}
                      type="number"
                      min="0"
                      step="any"
                      value={draft.cantidad}
                      disabled={busy}
                      onChange={(e) => setDraft((d) => ({ ...d, cantidad: e.target.value }))}
                    />
                  </div>
                  {verEconomicos && (
                    <>
                      <div>
                        <AlmacenFieldLabel icon="💵" label="Costo de compra" compact ayuda="Valor unitario de adquisición." />
                        <input
                          style={{ ...ui.input, padding: '10px 12px', fontSize: 'var(--cc-sm)' }}
                          type="number"
                          min="0"
                          step="any"
                          value={draft.valor_compra_unitario}
                          disabled={busy}
                          onChange={(e) => setDraft((d) => ({ ...d, valor_compra_unitario: e.target.value }))}
                        />
                      </div>
                      <div>
                        <AlmacenFieldLabel icon="💰" label="Valor de cobro" compact ayuda="Valor unitario a cobrar." />
                        <input
                          style={{ ...ui.input, padding: '10px 12px', fontSize: 'var(--cc-sm)' }}
                          type="number"
                          min="0"
                          step="any"
                          value={draft.vlr_unitario_cobro}
                          disabled={busy}
                          onChange={(e) => setDraft((d) => ({ ...d, vlr_unitario_cobro: e.target.value }))}
                        />
                      </div>
                    </>
                  )}
                </div>
                {verEconomicos && tablaRentabilidad && (
                  <div style={{ marginTop: 12 }}>
                    <TablaRentabilidadAcumulada
                      analisisRentabilidad={tablaRentabilidad}
                      proveedorCatalogo={item.proveedor_catalogo}
                      verEconomicos={verEconomicos}
                      defaultExpanded={false}
                    />
                  </div>
                )}
              </Section>

              <Section ui={ui} title="Comentarios">
                <textarea
                  style={{
                    ...ui.input,
                    minHeight: 110,
                    resize: 'vertical',
                    width: '100%',
                    boxSizing: 'border-box',
                    fontSize: 'var(--cc-sm)',
                    padding: '12px 14px',
                    lineHeight: 1.45,
                  }}
                  placeholder="Motivo si rechaza este ítem…"
                  value={motivo}
                  disabled={busy}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </Section>

              <section style={{
                border: `1px solid ${ui.textMuted}33`,
                borderRadius: 10,
                padding: '14px 16px',
                background: `${ui.accentSoft}55`,
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
              >
                <button
                  type="button"
                  style={{ ...ui.btnSecondary, padding: '10px 16px' }}
                  disabled={busy}
                  onClick={() => { void soloGuardar() }}
                >
                  {busy ? 'Guardando…' : 'Guardar mapeo'}
                </button>
                <button
                  type="button"
                  style={{ ...btnSuccessStyle(ui.btnPrimary), padding: '10px 18px' }}
                  disabled={busy}
                  onClick={() => { void validar('aprobar') }}
                >
                  ✓ Aprobar ítem
                </button>
                <button
                  type="button"
                  style={{ ...ui.btnSecondary, color: '#dc2626', borderColor: '#dc262666', padding: '10px 16px' }}
                  disabled={busy}
                  onClick={() => { void validar('rechazar') }}
                >
                  ✕ Rechazar ítem
                </button>
              </section>
            </>
          ) : (
            <Section ui={ui} title="Resumen">
              <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, lineHeight: 1.5 }}>
                <div style={{ marginBottom: 10 }}>
                  Insumo: <strong style={{ color: ui.text }}>{item.material_descripcion || '—'}</strong>
                </div>
                <div style={{ marginBottom: 10 }}>
                  Cantidad: <strong style={{ color: ui.text }}>{fmtCant(item.cantidad)} {item.unidad || ''}</strong>
                </div>
                {verEconomicos && (
                  <div style={{ marginBottom: 10 }}>
                    Costo: {fmtCant(item.valor_compra_unitario)} · Cobro: {fmtCant(item.vlr_unitario_cobro)}
                  </div>
                )}
                <div style={{ marginBottom: 10 }}>Esta línea ya no admite revisión (aprobada, rechazada o con OC).</div>
                {verEconomicos && tablaRentabilidad && (
                  <TablaRentabilidadAcumulada
                    analisisRentabilidad={tablaRentabilidad}
                    proveedorCatalogo={item.proveedor_catalogo}
                    verEconomicos={verEconomicos}
                    defaultExpanded={false}
                  />
                )}
              </div>
            </Section>
          )}
        </div>
      </div>

      {mapaOpen && (
        <SolicitudLineaMapaModal
          item={item}
          token={token}
          contratoId={contratoId}
          t={theme}
          onClose={() => setMapaOpen(false)}
        />
      )}
    </div>
  )
}

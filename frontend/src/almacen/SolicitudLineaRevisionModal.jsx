import { useEffect, useMemo, useState } from 'react'
import { btnSuccessStyle } from '../theme/adminPanelTheme'
import InsumoSearchTable from './InsumoSearchTable'
import {
  itemPuedeValidar,
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
  onClose,
  onUpdated,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const compact = useAlmacenCompact()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [motivo, setMotivo] = useState('')
  const [draft, setDraft] = useState({
    insumo: null,
    cantidad: '',
    valor_compra_unitario: '',
    vlr_unitario_cobro: '',
  })

  const puedeEditar = itemPuedeValidar(item, sol, permisos)
  const verEconomicos = permisos?.verEconomicos !== false

  useEffect(() => {
    if (!item) return
    setMotivo('')
    setError('')
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

  const metaLinea = useMemo(() => {
    if (!item) return ''
    const parts = [
      item.capitulo && item.item ? `${item.capitulo} · ${item.item}` : null,
      item.unidad ? `Und: ${item.unidad}` : null,
      item.pk_id ? `PK ${item.pk_id}` : null,
    ].filter(Boolean)
    return parts.join(' · ')
  }, [item])

  if (!item || !sol) return null

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
      onClick={() => !busy && onClose?.()}
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
          <div style={{ minWidth: 0 }}>
            <div id="solicitud-linea-revision-title" style={{ fontSize: 'var(--cc-title)', fontWeight: 800 }}>
              Revisión de línea {item.numero_linea != null ? `#${item.numero_linea}` : ''}
            </div>
            {metaLinea && (
              <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginTop: 4 }}>
                {metaLinea}
              </div>
            )}
          </div>
          <button
            type="button"
            style={{ ...ui.btnSecondary, padding: '8px 14px', flexShrink: 0 }}
            disabled={busy}
            onClick={onClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
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
                <div>Esta línea ya no admite revisión (aprobada, rechazada o con OC).</div>
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import CcModalBrandHeader from '../components/CcModalBrandHeader'
import AlmacenItemMapaPreview from './AlmacenItemMapaPreview'
import { puedeVerAlertasEntrada } from './almacenPermisos'
import AlmacenTrazabilidadButton from './AlmacenTrazabilidadButton'
import {
  AlmacenFieldLabel,
  fmtCant,
  formatEntradaNumero,
  fmtFechaAlmacenSolo,
  useAlmacenApi,
  useAlmacenCompact,
  useAlmacenTheme,
} from './almacenShared'

const TIPO_LABEL = {
  disposicion: 'Disposición',
  recibo: 'Recibo de materiales',
}

const ALERTA_SALDO_BG = {
  rojo: '#fecaca',
  naranja: '#fed7aa',
  normal: 'transparent',
}

function cellStyle(border) {
  return {
    border: `1px solid ${border}`,
    padding: '6px 8px',
    fontSize: 'var(--cc-sm)',
    verticalAlign: 'middle',
  }
}

export default function EntradaDetalleModal({
  entradaId,
  onClose,
  token,
  contratoId,
  theme,
  permisos,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const compact = useAlmacenCompact()
  const [ent, setEnt] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    if (!entradaId) return
    setBusy(true)
    api.getEntrada(entradaId)
      .then(setEnt)
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false))
  }, [api, entradaId])

  const overlay = {
    position: 'fixed',
    inset: 0,
    zIndex: 9000,
    display: 'flex',
    alignItems: compact ? 'flex-end' : 'center',
    justifyContent: 'center',
    padding: compact ? 0 : 16,
  }

  const modal = {
    ...ui.card,
    width: '100%',
    maxWidth: compact ? '100%' : 960,
    maxHeight: compact ? '96dvh' : '92vh',
    overflow: 'auto',
    boxShadow: compact ? 'var(--cc-almacen-shadow-sheet)' : 'var(--cc-almacen-shadow-modal)',
    borderRadius: compact ? '16px 16px 0 0' : ui.card.borderRadius,
    paddingBottom: compact ? 'calc(16px + env(safe-area-inset-bottom, 0px))' : ui.card.padding,
  }

  const border = ui.sheetWrap?.border?.split(' ').slice(1).join(' ') || 'var(--cc-border, #d1d5db)'
  const th = {
    ...cellStyle(border),
    background: 'var(--cc-almacen-sheet-head, #f3f4f6)',
    fontWeight: 700,
    color: ui.textMuted,
    whiteSpace: 'nowrap',
  }
  const td = {
    ...cellStyle(border),
    fontWeight: 500,
  }

  const oc = ent?.almacen_orden_compra || {}
  const item0 = ent?.items?.[0]?.almacen_orden_compra_item || {}
  const verAlertas = puedeVerAlertasEntrada(permisos)
  const items = Array.isArray(ent?.items) ? ent.items : []

  const cabeceraCols = ent ? [
    { key: 'tipo', label: 'Tipo', value: TIPO_LABEL[ent.tipo] || ent.tipo },
    { key: 'doc', label: 'Documento', value: ent.numero_documento || '—' },
    { key: 'fecha', label: 'Fecha', value: fmtFechaAlmacenSolo(ent.fecha_entrada) },
    { key: 'oc', label: 'OC', value: oc.numero_oc ? `#${oc.numero_oc}` : '—' },
    { key: 'prov', label: 'Proveedor', value: ent.proveedor_nombre || '—' },
    { key: 'insumo', label: 'Insumo', value: ent.insumo_label || item0.material_descripcion || '—' },
    { key: 'pk', label: 'PK / sector', value: ent.pk_id || '—' },
    { key: 'tramo', label: 'Tramo', value: ent.tramo || '—' },
    { key: 'costado', label: 'Costado', value: ent.costado || '—' },
    {
      key: 'abs',
      label: 'Abscisas',
      value: [ent.abscisa_inicial, ent.abscisa_final].filter(Boolean).join(' → ') || '—',
    },
    { key: 'placa', label: 'Placa', value: ent.placa || '—' },
    { key: 'trans', label: 'Transportador', value: ent.transportador || '—' },
    { key: 'user', label: 'Registrado por', value: ent.usuario_nombre || '—' },
  ] : []

  return (
    <div
      style={overlay}
      className={compact ? 'cc-almacen-modal-overlay cc-almacen-modal-overlay--compact' : 'cc-almacen-modal-overlay'}
      role="dialog"
      aria-modal="true"
    >
      <div style={modal} className={compact ? 'cc-almacen-modal-sheet' : ''} onClick={(e) => e.stopPropagation()}>
        <CcModalBrandHeader theme={theme} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700 }}>
              Entrada {formatEntradaNumero(ent)}
            </div>
            <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginTop: 4 }}>
              Resumen del registro de material
            </div>
          </div>
          <button type="button" style={{ ...ui.btnSecondary, padding: '4px 10px' }} onClick={onClose}>✕</button>
        </div>

        {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}
        {busy && !ent && <div style={{ color: ui.textMuted }}>Cargando…</div>}

        {ent && (
          <>
            <div style={{ ...ui.sheetWrap, marginBottom: 14 }} className="cc-almacen-table-scroll">
              <table style={{ ...ui.sheetTable, tableLayout: 'auto', minWidth: 720 }}>
                <thead>
                  <tr>
                    {cabeceraCols.map((c) => (
                      <th key={c.key} style={th}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {cabeceraCols.map((c) => (
                      <td key={c.key} style={td}>{c.value}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            <AlmacenFieldLabel
              icon="📦"
              label="Saldo disponible (por línea de entrada)"
              ayuda="Cantidad entregada menos despacho neto (salidas − devoluciones) de esa remisión/insumo."
            />
            <div style={{ ...ui.sheetWrap, marginBottom: 14 }} className="cc-almacen-table-scroll">
              <table style={{ ...ui.sheetTable, tableLayout: 'auto', minWidth: 560 }}>
                <thead>
                  <tr>
                    <th style={th}>Insumo / línea</th>
                    <th style={{ ...th, textAlign: 'right' }}>Cantidad entregada</th>
                    <th style={{ ...th, textAlign: 'right' }}>Cantidad despachada</th>
                    <th style={{ ...th, textAlign: 'right' }}>Saldo disponible</th>
                    <th style={{ ...th, textAlign: 'right' }}>% saldo</th>
                    <th style={{ ...th, textAlign: 'center', width: 44 }} title="Trazabilidad">📜</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ ...td, color: ui.textMuted }}>Sin líneas de entrada</td>
                    </tr>
                  )}
                  {items.map((it) => {
                    const oci = it.almacen_orden_compra_item || {}
                    const und = oci.unidad || ent.insumo_unidad || ''
                    const alerta = it.alerta_saldo || 'normal'
                    const bg = ALERTA_SALDO_BG[alerta] || ALERTA_SALDO_BG.normal
                    const label = oci.material_descripcion
                      || ent.insumo_label
                      || `Línea #${it.id}`
                    const pct = Number(it.porcentaje_saldo_disponible)
                    const pctLabel = Number.isFinite(pct)
                      ? `${pct.toLocaleString('es-CO', { maximumFractionDigits: 2 })}%`
                      : '—'
                    const rowTd = { ...td, background: bg }
                    return (
                      <tr key={it.id}>
                        <td style={rowTd}>{label}</td>
                        <td style={{ ...rowTd, textAlign: 'right' }}>
                          {`${fmtCant(it.cantidad_recibida)} ${und}`.trim()}
                        </td>
                        <td style={{ ...rowTd, textAlign: 'right' }}>
                          {`${fmtCant(it.cantidad_despachada)} ${und}`.trim()}
                        </td>
                        <td style={{ ...rowTd, textAlign: 'right' }}>
                          {`${fmtCant(it.saldo_disponible)} ${und}`.trim()}
                        </td>
                        <td style={{ ...rowTd, textAlign: 'right', fontWeight: 700 }}>{pctLabel}</td>
                        <td style={{ ...rowTd, textAlign: 'center' }}>
                          <AlmacenTrazabilidadButton
                            token={token}
                            theme={theme}
                            ui={ui}
                            compact
                            entidadTipo="entrada_item"
                            entidadId={it.id}
                            titulo={`Almacén · Entrada ${formatEntradaNumero(ent)} · ${label}`}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {verAlertas && ent.alerta_silenciosa_detalle && (
              <div style={{
                marginTop: 4,
                marginBottom: 8,
                padding: '10px 12px',
                borderRadius: 8,
                background: '#fffbeb',
                border: '1px solid #fcd34d',
                color: '#92400e',
                fontSize: 'var(--cc-sm)',
              }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠ Alerta de control</div>
                {ent.alerta_silenciosa_detalle}
              </div>
            )}

            {ent.pk_id && (
              <div style={{ marginTop: 14 }}>
                <AlmacenFieldLabel icon="🗺️" label="Ubicación en mapa" />
                <AlmacenItemMapaPreview
                  t={theme}
                  token={token}
                  contratoId={contratoId}
                  pkLabel={ent.pk_id}
                  height={240}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              {ent.tiene_pdf_disposicion && (
                <>
                  <button
                    type="button"
                    style={ui.btnSecondary}
                    title="Ver PDF POS"
                    onClick={() => api.openDisposicionPdf(ent.id).catch((e) => setError(e.message))}
                  >
                    📄 Ver PDF
                  </button>
                  <button
                    type="button"
                    style={ui.btnSecondary}
                    title="Imprimir PDF POS"
                    onClick={() => api.printDisposicionPdf(ent.id).catch((e) => setError(e.message))}
                  >
                    🖨️ Imprimir
                  </button>
                </>
              )}
              <button type="button" style={ui.btnPrimary} onClick={onClose}>Cerrar</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

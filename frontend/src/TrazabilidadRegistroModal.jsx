import { useEffect, useState } from 'react'

const CAMPO_ETIQUETAS = {
  id: 'ID',
  contrato_id: 'Contrato',
  id_pol: 'ID-POL',
  pk_id: 'PK',
  capitulo: 'Capítulo',
  competencia: 'Competencia',
  item: 'Ítem',
  descripcion: 'Descripción',
  und: 'Unidad',
  calzada: 'Calzada',
  tramo: 'Tramo',
  no_inicio: 'Nodo inicio',
  no_final: 'Nodo fin',
  abs_inicio: 'Abscisa inicio',
  abs_final: 'Abscisa fin',
  area_long_nod: 'Área / longitud',
  ancho: 'Ancho',
  espesor: 'Espesor',
  cant_total: 'Cant. total',
  vlr_unitario: 'Vlr. unitario',
  costo_directo: 'Costo directo',
  revisado: 'Estado interventoría',
  pre_interv_estado: 'Estado depuración',
  sellado: 'Sellado',
  tipo_ejecucion: 'Tipo ejecución',
  tipo_entidad: 'Tipo entidad',
  dado_de_baja: 'Dado de baja',
  observacion_externa: 'Observación externa',
  calculo_por: 'Calculado por',
  calculo_en: 'Calculado en',
  // Almacén
  consecutivo: 'Consecutivo',
  titulo: 'Título',
  estado: 'Estado',
  observaciones: 'Observaciones',
  enviada_at: 'Enviada',
  validada_at: 'Validada',
  validada_by: 'Validada por',
  motivo_rechazo: 'Motivo de rechazo',
  created_by: 'Creado por',
  items_count: 'Ítems',
  numero_entrada: 'N.º entrada',
  codigo: 'Código',
  tipo: 'Tipo',
  numero_documento: 'Remisión / documento',
  fecha_entrada: 'Fecha de entrada',
  costado: 'Costado',
  abscisa_inicial: 'Abscisa inicial',
  abscisa_final: 'Abscisa final',
  proveedor_id: 'Proveedor',
  orden_compra_id: 'Orden de compra',
  placa: 'Placa',
  transportador: 'Transportador',
  entrada_id: 'Entrada',
  entrada_item_id: 'Línea de entrada',
  orden_compra_item_id: 'Línea OC',
  presupuesto_id: 'Presupuesto',
  cantidad_recibida: 'Cantidad recibida',
  valor_recibido: 'Valor recibido',
  lote: 'Lote',
  fecha_vencimiento: 'Vencimiento',
  material_descripcion: 'Insumo / material',
  unidad: 'Unidad',
  numero_salida: 'N.º salida',
  fecha_hora_salida: 'Fecha y hora salida',
  cantidad_salida: 'Cantidad salida',
  cantidad_devuelta: 'Cantidad devuelta',
  cantidad_neta: 'Cantidad neta',
  receptor_usuario_id: 'Receptor',
  numero_oc: 'N.º OC',
  numero_devolucion: 'N.º devolución',
  salida_id: 'Salida',
  cantidad: 'Cantidad',
  fecha_hora_devolucion: 'Fecha y hora devolución',
  deleted: 'Eliminado',
  estado_validacion: 'Estado validación',
  item_id: 'Ítem',
  insumo_id: 'Insumo',
  motivo: 'Motivo',
}

function parseJsonVal(v) {
  if (v == null) return null
  if (typeof v === 'object') return v
  if (typeof v === 'string') {
    try {
      return JSON.parse(v)
    } catch {
      return v
    }
  }
  return v
}

function fmtAuditVal(v) {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v)
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function valoresIguales(a, b) {
  if (a === b) return true
  if (a == null && b == null) return true
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return String(a) === String(b)
  }
}

function camposModificados(valorAnterior, valorNuevo) {
  const va = parseJsonVal(valorAnterior)
  const vn = parseJsonVal(valorNuevo)
  if (va == null && vn == null) return []
  if (typeof va !== 'object' || va === null || typeof vn !== 'object' || vn === null) {
    if (valoresIguales(va, vn)) return []
    return [{ key: '_valor', label: 'Valor', before: va, after: vn }]
  }
  const keys = new Set([...Object.keys(va), ...Object.keys(vn)])
  const out = []
  for (const key of keys) {
    if (!valoresIguales(va[key], vn[key])) {
      out.push({
        key,
        label: CAMPO_ETIQUETAS[key] || key,
        before: va[key],
        after: vn[key],
      })
    }
  }
  return out
}

/**
 * Muestra el historial de auditoría de una entidad (GET /logs/entidad/...).
 * Tipografía y densidad alineadas con la escala global (--cc-*, --cc-space-*).
 */
export default function TrazabilidadRegistroModal({
  apiBase,
  token,
  entidadTipo,
  entidadId,
  titulo,
  theme,
  onClose,
}) {
  const t = theme
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!entidadTipo || entidadId == null || entidadId === '') {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    fetch(
      `${apiBase}/logs/entidad/${encodeURIComponent(entidadTipo)}/${encodeURIComponent(String(entidadId))}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [apiBase, token, entidadTipo, entidadId])

  const fmtFecha = (iso) => {
    if (!iso) return '—'
    try {
      const utc = iso.endsWith('Z') ? iso : iso + 'Z'
      return new Date(utc).toLocaleString('es-CO', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Bogota',
      })
    } catch {
      return iso
    }
  }

  const parseDet = (d) => {
    if (d == null) return {}
    if (typeof d === 'string') {
      try {
        return JSON.parse(d)
      } catch {
        return {}
      }
    }
    return typeof d === 'object' ? d : {}
  }

  const sx = {
    shell: {
      background: t.bgCard,
      border: `1px solid ${t.border}`,
      borderRadius: 12,
      padding: 'var(--cc-space-4) var(--cc-space-5)',
      width: 720,
      maxWidth: '96vw',
      maxHeight: '85vh',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: t.shadow || '0 20px 60px rgba(0,0,0,0.35)',
    },
    title: {
      fontSize: 'var(--cc-title)',
      fontWeight: 800,
      color: t.text,
      lineHeight: 1.25,
    },
    subtitle: {
      fontSize: 'var(--cc-sm)',
      color: t.textMuted,
      marginTop: 'var(--cc-space-1)',
      lineHeight: 1.35,
    },
    closeBtn: {
      background: 'transparent',
      border: 'none',
      fontSize: 'var(--cc-lg)',
      cursor: 'pointer',
      color: t.textMuted,
      lineHeight: 1,
      padding: 'var(--cc-space-1)',
    },
    card: {
      background: t.bg || t.inputBg,
      border: `1px solid ${t.border}`,
      borderRadius: 8,
      padding: 'var(--cc-space-2) var(--cc-space-3)',
      fontSize: 'var(--cc-sm)',
      lineHeight: 1.35,
    },
    accion: { fontWeight: 800, color: t.primary, letterSpacing: '0.02em' },
    fecha: { color: t.textMuted, fontSize: 'var(--cc-caption)' },
    meta: { color: t.textMuted, fontSize: 'var(--cc-caption)', marginTop: 2 },
    detRow: { display: 'flex', gap: 'var(--cc-space-2)', marginBottom: 1, alignItems: 'baseline' },
    detKey: { color: t.textMuted, minWidth: '7.5rem', flexShrink: 0, fontSize: 'var(--cc-caption)' },
    detVal: { color: t.text, fontSize: 'var(--cc-caption)', wordBreak: 'break-word' },
    diffLabel: {
      fontSize: 'var(--cc-caption)',
      fontWeight: 700,
      color: t.textMuted,
      marginBottom: 'var(--cc-space-1)',
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    },
    cambiosBox: {
      marginTop: 'var(--cc-space-2)',
      padding: 'var(--cc-space-2) var(--cc-space-3)',
      background: `${t.primary || '#0077B6'}10`,
      border: `1px solid ${t.primary || '#0077B6'}33`,
      borderRadius: 8,
    },
    cambioRow: {
      display: 'grid',
      gridTemplateColumns: 'minmax(7rem, 34%) 1fr 1fr',
      gap: 'var(--cc-space-2)',
      alignItems: 'baseline',
      padding: '4px 0',
      borderBottom: `1px solid ${t.border}`,
      fontSize: 'var(--cc-caption)',
    },
    cambioAntes: { color: '#B45309', wordBreak: 'break-word' },
    cambioNuevo: { color: 'var(--cc-color-success)', fontWeight: 600, wordBreak: 'break-word' },
    pre: {
      margin: 0,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      fontSize: 'var(--cc-caption)',
      fontFamily: 'ui-monospace, Consolas, "Cascadia Code", monospace',
      lineHeight: 1.32,
      color: t.text,
      maxHeight: 'min(26vh, 11em)',
      overflow: 'auto',
      background: t.inputBg,
      padding: 'var(--cc-space-2)',
      borderRadius: 6,
    },
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 100002,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div style={sx.shell} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 'var(--cc-space-3)',
            gap: 'var(--cc-space-3)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={sx.title}>📜 Trazabilidad</div>
            <div style={sx.subtitle}>{titulo}</div>
          </div>
          <button type="button" onClick={onClose} style={sx.closeBtn} aria-label="Cerrar">
            ✕
          </button>
        </div>

        {loading ? (
          <div
            style={{
              textAlign: 'center',
              padding: 'var(--cc-space-5)',
              color: t.textMuted,
              fontSize: 'var(--cc-sm)',
            }}
          >
            Cargando historial…
          </div>
        ) : rows.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: 'var(--cc-space-5)',
              color: t.textMuted,
              fontSize: 'var(--cc-sm)',
            }}
          >
            Aún no hay eventos de auditoría para este registro.
          </div>
        ) : (
          <div
            style={{
              overflowY: 'auto',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--cc-space-2)',
            }}
          >
            {rows.map((h) => {
              const det = parseDet(h.detalle)
              const va = h.valor_anterior
              const vn = h.valor_nuevo
              const cambios = camposModificados(va, vn)
              const mostrarJson =
                cambios.length === 0 &&
                ((va != null && (typeof va === 'object' ? Object.keys(va).length : true)) ||
                  (vn != null && (typeof vn === 'object' ? Object.keys(vn).length : true)))
              return (
                <div key={h.id} style={sx.card}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 'var(--cc-space-2)',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    <span style={sx.accion}>{h.accion}</span>
                    <span style={sx.fecha}>{fmtFecha(h.created_at)}</span>
                  </div>
                  <div style={sx.meta}>
                    {h.usuario_nombre || '—'} · {h.modulo}
                    {h.severidad ? ` · ${h.severidad}` : ''}
                  </div>
                  {Object.keys(det).length > 0 && (
                    <div style={{ marginTop: 'var(--cc-space-2)', color: t.text }}>
                      {Object.entries(det).map(([k, v]) => (
                        <div key={k} style={sx.detRow}>
                          <span style={sx.detKey}>{k}:</span>
                          <span style={sx.detVal}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {cambios.length > 0 && (
                    <div style={sx.cambiosBox}>
                      <div style={{ ...sx.diffLabel, color: t.primary, marginBottom: 'var(--cc-space-2)' }}>
                        Campos modificados ({cambios.length})
                      </div>
                      <div style={{ ...sx.cambioRow, fontWeight: 700, color: t.textMuted, borderBottom: `2px solid ${t.border}` }}>
                        <span>Campo</span>
                        <span>Anterior</span>
                        <span>Nuevo</span>
                      </div>
                      {cambios.map((c) => (
                        <div key={c.key} style={sx.cambioRow}>
                          <span style={{ fontWeight: 700, color: t.text }}>{c.label}</span>
                          <span style={sx.cambioAntes}>{fmtAuditVal(c.before)}</span>
                          <span style={sx.cambioNuevo}>{fmtAuditVal(c.after)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {mostrarJson ? (
                    <div
                      style={{
                        marginTop: 'var(--cc-space-3)',
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 'var(--cc-space-2)',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={sx.diffLabel}>Valor anterior</div>
                        <pre style={sx.pre}>{typeof va === 'string' ? va : JSON.stringify(va, null, 2)}</pre>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={sx.diffLabel}>Valor nuevo</div>
                        <pre style={sx.pre}>{typeof vn === 'string' ? vn : JSON.stringify(vn, null, 2)}</pre>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

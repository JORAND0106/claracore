import { useCallback, useEffect, useState } from 'react'
import SicoeFiltroPkMapa from '../modules/sicoe-obra/SicoeFiltroPkMapa'
import { fetchSicoePkIdsCached } from '../modules/sicoe-obra/sicoeCatalogoCache'
import { API_BASE } from '../apiBase'
import InsumoSearchTable from './InsumoSearchTable'
import ProveedorSelector from './ProveedorSelector'
import PresupuestoItemSelector, { findPresupuestoId } from './PresupuestoItemSelector'
import UbicacionSolicitudFields from './UbicacionSolicitudFields'
import {
  AlmacenFieldLabel,
  ESTADO_SOLICITUD_COLOR,
  ESTADO_SOLICITUD_LABEL,
  fmtCant,
  fmtMoney,
  useAlmacenApi,
  useAlmacenTheme,
} from './almacenShared'

const emptyItem = () => ({
  insumo: null,
  presupuesto_capitulo: '',
  presupuesto_item: '',
  pk_id: '',
  pk_label: '',
  pk_id_id: null,
  tramo: '',
  costado: '',
  abscisa_inicial: '',
  abscisa_final: '',
  observacion_residente: '',
  cantidad: '',
  valor_compra_unitario: '',
  es_recurrente: false,
  preview: null,
})

function ubicacionPayload(it) {
  return {
    pk_id_id: it.pk_id_id || undefined,
    tramo: it.tramo || undefined,
    costado: it.costado || undefined,
    abscisa_inicial: it.abscisa_inicial !== '' && it.abscisa_inicial != null ? Number(it.abscisa_inicial) : undefined,
    abscisa_final: it.abscisa_final !== '' && it.abscisa_final != null ? Number(it.abscisa_final) : undefined,
    observacion_residente: it.observacion_residente || undefined,
  }
}

function PresupuestoContextBox({ ctx, analisis, supera, ui, sinPrecio }) {
  if (!ctx) return null
  const alertStyle = supera
    ? { background: '#fef2f2', border: '1px solid #dc2626', color: '#991b1b' }
    : { background: `${ui.accentSoft}`, border: `1px solid ${ui.textMuted}22` }

  const mostrarAnalisis = analisis && !sinPrecio && analisis.tiene_precio_compra !== false

  return (
    <div style={{ ...alertStyle, borderRadius: 6, padding: '6px 8px', marginTop: 6, fontSize: 'var(--cc-xs)' }}>
      {supera && (
        <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>
          ⚠ Supera presupuesto en este PK-ID
        </div>
      )}
      <div style={{ fontWeight: 600, marginBottom: 2 }}>
        {ctx.capitulo} · {ctx.item} — {ctx.descripcion}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
        <span>Ppto: <strong>{fmtCant(ctx.cant_presupuestada)}</strong> {ctx.unidad}</span>
        <span>Acum.: <strong>{fmtCant(ctx.cant_solicitada_acumulada)}</strong></span>
        <span>Esta línea: <strong>{fmtCant(ctx.cantidad_solicitada)}</strong></span>
        <span>Saldo: <strong style={{ color: supera ? '#dc2626' : '#047857' }}>{fmtCant(ctx.saldo_disponible_despues)}</strong></span>
      </div>
      {sinPrecio && (
        <div style={{ marginTop: 4, fontStyle: 'italic', opacity: 0.85 }}>
          Sin precio de compra registrado en el catálogo.
        </div>
      )}
      {mostrarAnalisis && (
        <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <span>Cobro: {fmtMoney(analisis.valor_cobro_linea)}</span>
          <span style={{ color: (analisis.utilidad_estimada_linea ?? 0) >= 0 ? '#047857' : '#dc2626' }}>
            Utilidad est.: {fmtMoney(analisis.utilidad_estimada_linea)}
          </span>
        </div>
      )}
    </div>
  )
}

export default function SolicitudForm({
  solicitudId,
  onSaved,
  onCancel,
  permisos,
  t,
  token,
  contratoId,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [pptoItems, setPptoItems] = useState([])
  const [pkList, setPkList] = useState([])
  const [items, setItems] = useState([emptyItem()])
  const [cotizaciones, setCotizaciones] = useState({})
  const [cotForm, setCotForm] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sol, setSol] = useState(null)
  const [config, setConfig] = useState({ cotizaciones_minimas: 3 })

  const editable = !solicitudId || sol?.estado === 'borrador'

  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => {})
    api.getPresupuestoItems().then(setPptoItems).catch(() => setPptoItems([]))
  }, [api])

  useEffect(() => {
    if (!contratoId || !token) return
    fetchSicoePkIdsCached(API_BASE, contratoId, token).then(setPkList).catch(() => setPkList([]))
  }, [contratoId, token])

  useEffect(() => {
    if (!solicitudId) return
    api.getSolicitud(solicitudId).then((s) => {
      setSol(s)
      const mapped = (s.items || []).map((it, idx) => ({
        id: it.id,
        insumo: {
          insumo_id: it.insumo_id,
          listado_precio_id: it.listado_precio_id,
          label: it.material_descripcion,
          valor_compra_referencia: it.valor_compra_unitario,
          tiene_precio_compra: it.valor_compra_unitario != null && Number(it.valor_compra_unitario) > 0,
        },
        presupuesto_capitulo: it.capitulo || '',
        presupuesto_item: it.item || '',
        pk_id: it.pk_id || '',
        pk_label: it.pk_id || '',
        pk_id_id: it.pk_id_id || null,
        tramo: it.tramo || '',
        costado: it.costado || '',
        abscisa_inicial: it.abscisa_inicial ?? '',
        abscisa_final: it.abscisa_final ?? '',
        observacion_residente: it.observacion_residente
          || (idx === 0 && s.observaciones ? s.observaciones : ''),
        presupuesto_id: it.presupuesto_id,
        cantidad: it.cantidad,
        valor_compra_unitario: it.valor_compra_unitario ?? '',
        es_recurrente: it.es_recurrente,
        preview: {
          contexto_presupuesto: it.contexto_presupuesto,
          analisis_valor: it.analisis_valor,
          supera_presupuesto: it.supera_presupuesto,
          presupuesto_id: it.presupuesto_id,
        },
      }))
      setItems(mapped.length ? mapped : [emptyItem()])
      const cMap = {}
      for (const it of s.items || []) {
        cMap[it.id] = it.cotizaciones || []
      }
      setCotizaciones(cMap)
    }).catch((e) => setError(e.message))
  }, [api, solicitudId])

  const updateItem = (idx, patch) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  const refreshPreview = useCallback(async (idx, draftItems) => {
    const it = draftItems[idx]
    const ins = it.insumo
    if (!ins || !it.presupuesto_capitulo || !it.presupuesto_item || !it.pk_id || !it.cantidad || Number(it.cantidad) <= 0) {
      updateItem(idx, { preview: null })
      return
    }
    try {
      const presupuestoId = findPresupuestoId(pptoItems, it.presupuesto_capitulo, it.presupuesto_item, it.pk_id)
      const body = {
        insumo_id: ins.insumo_id || undefined,
        listado_precio_id: ins.listado_precio_id || undefined,
        presupuesto_id: presupuestoId || undefined,
        presupuesto_capitulo: it.presupuesto_capitulo,
        presupuesto_item: it.presupuesto_item,
        pk_id: it.pk_id,
        cantidad: Number(it.cantidad),
        valor_compra_unitario: it.valor_compra_unitario !== '' ? Number(it.valor_compra_unitario) : (
          ins.valor_compra_referencia != null && ins.tiene_precio_compra !== false
            ? ins.valor_compra_referencia
            : undefined
        ),
        exclude_solicitud_id: solicitudId || undefined,
        ...ubicacionPayload(it),
      }
      const preview = await api.previewInsumoLine(body)
      updateItem(idx, {
        preview,
        presupuesto_id: preview.presupuesto_id,
        valor_compra_unitario: preview.tiene_precio_compra ? (preview.valor_compra_unitario ?? '') : '',
      })
    } catch (e) {
      updateItem(idx, { preview: { error: e.message } })
    }
  }, [api, pptoItems, solicitudId])

  const triggerPreview = (idx, next) => {
    setTimeout(() => refreshPreview(idx, next), 0)
  }

  const onPptoChange = (idx, { capitulo, item }) => {
    setItems((prev) => {
      const next = prev.map((it, i) => (i === idx ? {
        ...it,
        presupuesto_capitulo: capitulo ?? it.presupuesto_capitulo,
        presupuesto_item: item ?? it.presupuesto_item,
        preview: null,
      } : it))
      triggerPreview(idx, next)
      return next
    })
  }

  const onInsumoChange = (idx, insumo) => {
    setItems((prev) => {
      const next = prev.map((it, i) => (i === idx ? {
        ...it,
        insumo,
        valor_compra_unitario: insumo?.tiene_precio_compra ? (insumo?.valor_compra_referencia ?? '') : '',
        preview: null,
      } : it))
      triggerPreview(idx, next)
      return next
    })
  }

  const onPkSelect = (idx, sel) => {
    const pkVal = sel.pk_label || ''
    const pkRow = pkList.find((p) => String(p.id) === String(sel.pk_id_id))
    setItems((prev) => {
      const next = prev.map((it, i) => (i === idx ? {
        ...it,
        pk_id: pkVal,
        pk_label: pkVal,
        pk_id_id: sel.pk_id_id ? Number(sel.pk_id_id) : null,
        tramo: pkRow?.tramo || '',
      } : it))
      triggerPreview(idx, next)
      return next
    })
  }

  const onUbicacionChange = (idx, patch) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  const onCantidadChange = (idx, val) => {
    setItems((prev) => {
      const next = prev.map((it, i) => (i === idx ? { ...it, cantidad: val } : it))
      triggerPreview(idx, next)
      return next
    })
  }

  const removeItem = (idx) => {
    setItems((prev) => {
      if (prev.length <= 1) return [emptyItem()]
      return prev.filter((_, i) => i !== idx)
    })
  }

  const buildPayload = () => ({
    items: items.map((it) => {
      if (!it.insumo?.insumo_id && !it.insumo?.listado_precio_id) {
        throw new Error('Seleccione un insumo en cada línea.')
      }
      if (!it.presupuesto_capitulo || !it.presupuesto_item) {
        throw new Error('Seleccione capítulo e ítem de cobro en cada línea.')
      }
      if (!it.pk_id) {
        throw new Error('Seleccione ubicación PK-ID en cada línea.')
      }
      const presupuestoId = findPresupuestoId(pptoItems, it.presupuesto_capitulo, it.presupuesto_item, it.pk_id)
        || it.preview?.presupuesto_id
        || it.presupuesto_id
      const base = {
        cantidad: Number(it.cantidad),
        es_recurrente: !!it.es_recurrente,
        pk_id: it.pk_id,
        presupuesto_capitulo: it.presupuesto_capitulo,
        presupuesto_item: it.presupuesto_item,
        presupuesto_id: presupuestoId || undefined,
        valor_compra_unitario: it.valor_compra_unitario !== '' ? Number(it.valor_compra_unitario) : undefined,
        ...ubicacionPayload(it),
      }
      if (it.insumo?.insumo_id) {
        return { ...base, insumo_id: it.insumo.insumo_id }
      }
      return { ...base, listado_precio_id: it.insumo.listado_precio_id }
    }),
  })

  const guardar = async () => {
    setError('')
    setBusy(true)
    try {
      const payload = buildPayload()
      const result = solicitudId
        ? await api.updateSolicitud(solicitudId, payload)
        : await api.createSolicitud(payload)
      onSaved?.(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const enviar = async () => {
    if (!window.confirm('¿Enviar solicitud a validación?')) return
    setBusy(true)
    setError('')
    try {
      const payload = buildPayload()
      let id = solicitudId
      if (!id) {
        const created = await api.createSolicitud(payload)
        id = created.id
      } else {
        await api.updateSolicitud(id, payload)
      }
      const r = await api.enviarSolicitud(id)
      onSaved?.(r)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const addCot = async (itemId) => {
    const f = cotForm[itemId] || {}
    const prov = f.proveedor || {}
    if (!prov.razon_social && !prov.proveedor_id) return
    if (f.valor_unitario === '' || f.valor_unitario == null) return
    try {
      const body = {
        valor_unitario: Number(f.valor_unitario),
        observaciones: f.observaciones || null,
      }
      if (prov.proveedor_id) body.proveedor_id = prov.proveedor_id
      else if (prov.nit) {
        body.razon_social = prov.razon_social
        body.nit = prov.nit
      } else body.proveedor_nombre = prov.razon_social
      await api.addCotizacion(itemId, body)
      const s = await api.getSolicitud(solicitudId)
      const cMap = {}
      for (const it of s.items || []) cMap[it.id] = it.cotizaciones || []
      setCotizaciones(cMap)
      setCotForm((p) => ({ ...p, [itemId]: {} }))
    } catch (e) {
      setError(e.message)
    }
  }

  const delCot = async (cotId) => {
    try {
      await api.deleteCotizacion(cotId)
      const s = await api.getSolicitud(solicitudId)
      const cMap = {}
      for (const it of s.items || []) cMap[it.id] = it.cotizaciones || []
      setCotizaciones(cMap)
    } catch (e) {
      setError(e.message)
    }
  }

  const theme = t || { primary: ui.accent, border: '#e2e8f0', text: ui.text, textMuted: ui.textMuted, bgCard: '#fff' }

  return (
    <div style={ui.card}>
      <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700, marginBottom: 12 }}>
        {solicitudId ? `Solicitud #${sol?.consecutivo || '…'}` : 'Nueva solicitud de insumos'}
        {sol?.estado && (
          <span style={{
            marginLeft: 10,
            fontSize: 'var(--cc-sm)',
            color: ESTADO_SOLICITUD_COLOR[sol.estado],
            fontWeight: 600,
          }}
          >
            {ESTADO_SOLICITUD_LABEL[sol.estado]}
          </span>
        )}
      </div>

      {error && (
        <div style={{ color: '#dc2626', marginBottom: 10, fontSize: 'var(--cc-sm)' }}>{error}</div>
      )}

      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 'var(--cc-sm)' }}>
        📦 Insumos solicitados
      </div>

      {items.map((it, idx) => (
        <div
          key={it.id ?? idx}
          style={{
            border: `1px solid ${ui.textMuted}28`,
            borderRadius: 6,
            padding: 8,
            marginBottom: 8,
            background: `${ui.accentSoft}55`,
            position: 'relative',
          }}
        >
          {editable && (
            <button
              type="button"
              title="Eliminar insumo"
              onClick={() => removeItem(idx)}
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                ...ui.btnSecondary,
                padding: '2px 8px',
                color: '#dc2626',
                borderColor: '#dc262666',
                fontSize: 10,
                lineHeight: 1.2,
              }}
            >
              ✕
            </button>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingRight: editable ? 28 : 0 }}>
            <PresupuestoItemSelector
              capitulo={it.presupuesto_capitulo}
              item={it.presupuesto_item}
              disabled={!editable}
              onChange={(sel) => onPptoChange(idx, sel)}
            />

            <InsumoSearchTable
              value={it.insumo}
              onChange={(ins) => onInsumoChange(idx, ins)}
              disabled={!editable}
            />

            <div>
              <AlmacenFieldLabel icon="🗺️" label="Ubicación PK-ID" compact ayuda="Seleccione en el mapa el sector." />
              <SicoeFiltroPkMapa
                t={theme}
                token={token}
                contratoId={contratoId}
                pkList={pkList}
                pkIdSeleccionado={it.pk_id}
                pkLabel={it.pk_label}
                onSeleccionar={(sel) => onPkSelect(idx, sel)}
                onLimpiar={() => updateItem(idx, {
                  pk_id: '', pk_label: '', pk_id_id: null, tramo: '', preview: null,
                })}
                compact
              />
              <UbicacionSolicitudFields
                pkId={it.pk_label || it.pk_id}
                tramo={it.tramo}
                costado={it.costado}
                abscisaInicial={it.abscisa_inicial}
                abscisaFinal={it.abscisa_final}
                disabled={!editable}
                onChange={(patch) => onUbicacionChange(idx, {
                  costado: patch.costado ?? it.costado,
                  abscisa_inicial: patch.abscisaInicial ?? it.abscisa_inicial,
                  abscisa_final: patch.abscisaFinal ?? it.abscisa_final,
                })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(80px, 120px) auto 1fr', gap: 8, alignItems: 'end' }}>
              <div>
                <AlmacenFieldLabel icon="🔢" label="Cantidad" compact />
                <input
                  style={{ ...ui.input, padding: '6px 8px', fontSize: 'var(--cc-sm)' }}
                  type="number"
                  min="0"
                  step="any"
                  value={it.cantidad}
                  onChange={(e) => onCantidadChange(idx, e.target.value)}
                  disabled={!editable}
                />
              </div>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 'var(--cc-xs)',
                cursor: editable ? 'pointer' : 'default',
                paddingBottom: 6,
                whiteSpace: 'nowrap',
              }}
              >
                <input
                  type="checkbox"
                  checked={!!it.es_recurrente}
                  onChange={(e) => updateItem(idx, { es_recurrente: e.target.checked })}
                  disabled={!editable}
                />
                Recurrente
              </label>
              <div>
                <AlmacenFieldLabel icon="💬" label="Observaciones" compact ayuda="Notas de esta línea de insumo." />
                <input
                  style={{ ...ui.input, padding: '6px 8px', fontSize: 'var(--cc-sm)' }}
                  value={it.observacion_residente || ''}
                  disabled={!editable}
                  placeholder="Opcional…"
                  onChange={(e) => updateItem(idx, { observacion_residente: e.target.value })}
                />
              </div>
            </div>
          </div>

          {it.preview?.error && (
            <div style={{ color: '#dc2626', fontSize: 'var(--cc-sm)', marginTop: 8 }}>{it.preview.error}</div>
          )}
          <PresupuestoContextBox
            ctx={it.preview?.contexto_presupuesto}
            analisis={it.preview?.analisis_valor}
            supera={it.preview?.supera_presupuesto}
            sinPrecio={it.insumo && it.insumo.tiene_precio_compra === false}
            ui={ui}
          />

          {it.id && solicitudId && (
            <div style={{ marginTop: 8, borderTop: '1px solid #ccc3', paddingTop: 6 }}>
              <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 600, marginBottom: 8 }}>
                💰 Cotizaciones
                {!it.es_recurrente && (
                  <span style={{ fontWeight: 400, color: ui.textMuted, marginLeft: 8 }}>
                    (mín. {config.cotizaciones_minimas})
                  </span>
                )}
              </div>
              {(cotizaciones[it.id] || []).map((c) => (
                <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, fontSize: 'var(--cc-sm)' }}>
                  <span>{c.proveedor_nombre}</span>
                  <span>{fmtMoney(c.valor_unitario)}</span>
                  <span style={{ color: ui.textMuted }}>Total: {fmtMoney(c.valor_total)}</span>
                  {editable && (
                    <button type="button" style={{ ...ui.btnSecondary, padding: '2px 8px' }} onClick={() => delCot(c.id)}>✕</button>
                  )}
                </div>
              ))}
              {editable && permisos?.editar && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                  <ProveedorSelector
                    value={cotForm[it.id]?.proveedor}
                    onChange={(prov) => setCotForm((p) => ({ ...p, [it.id]: { ...p[it.id], proveedor: prov } }))}
                    insumoId={it.insumo?.insumo_id}
                    valorUnitario={cotForm[it.id]?.valor_unitario}
                    onValorUnitarioChange={(v) => setCotForm((p) => ({ ...p, [it.id]: { ...p[it.id], valor_unitario: v } }))}
                  />
                  <div>
                    <AlmacenFieldLabel icon="💰" label="Precio venta (cotización)" />
                    <input
                      style={ui.input}
                      type="number"
                      placeholder="V. unitario"
                      value={cotForm[it.id]?.valor_unitario ?? ''}
                      onChange={(e) => setCotForm((p) => ({ ...p, [it.id]: { ...p[it.id], valor_unitario: e.target.value } }))}
                    />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <button type="button" style={ui.btnSecondary} onClick={() => addCot(it.id)}>+ Agregar cotización</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {editable && (
        <button
          type="button"
          style={{ ...ui.btnSecondary, marginBottom: 12, padding: '6px 12px', fontSize: 'var(--cc-sm)' }}
          onClick={() => setItems((p) => [...p, emptyItem()])}
        >
          + Agregar insumo
        </button>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {editable && permisos?.editar && (
          <>
            <button type="button" style={ui.btnPrimary} disabled={busy} onClick={guardar}>
              {busy ? 'Guardando…' : 'Guardar borrador'}
            </button>
            {solicitudId && (
              <button type="button" style={ui.btnPrimary} disabled={busy} onClick={enviar}>
                Enviar a validación
              </button>
            )}
          </>
        )}
        <button type="button" style={ui.btnSecondary} onClick={onCancel}>Volver</button>
      </div>
    </div>
  )
}

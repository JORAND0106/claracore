import { useCallback, useEffect, useState } from 'react'

import SicoeFiltroPkMapa from '../modules/sicoe-obra/SicoeFiltroPkMapa'

import { fetchSicoePkIdsCached } from '../modules/sicoe-obra/sicoeCatalogoCache'

import { API_BASE } from '../apiBase'

import InsumoAutocomplete from './InsumoAutocomplete'

import ProveedorSelector from './ProveedorSelector'

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

  pk_id: '',

  pk_label: '',

  cantidad: '',

  valor_compra_unitario: '',

  es_recurrente: false,

  preview: null,

})



function PresupuestoContextBox({ ctx, analisis, supera, ui }) {

  if (!ctx) return null

  const alertStyle = supera

    ? { background: '#fef2f2', border: '2px solid #dc2626', color: '#991b1b' }

    : { background: `${ui.accentSoft}`, border: `1px solid ${ui.textMuted}33` }



  return (

    <div style={{ ...alertStyle, borderRadius: 8, padding: 10, marginTop: 10, fontSize: 'var(--cc-sm)' }}>

      {supera && (

        <div style={{ fontWeight: 800, color: '#dc2626', marginBottom: 6 }}>

          ⚠ Supera presupuesto disponible en este PK-ID

        </div>

      )}

      <div style={{ fontWeight: 600, marginBottom: 4 }}>

        Ítem presupuesto: {ctx.capitulo} · {ctx.item} — {ctx.descripcion}

      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>

        <span>Presupuestado: <strong>{fmtCant(ctx.cant_presupuestada)}</strong> {ctx.unidad}</span>

        <span>Solicitado acum.: <strong>{fmtCant(ctx.cant_solicitada_acumulada)}</strong></span>

        <span>Esta línea: <strong>{fmtCant(ctx.cantidad_solicitada)}</strong></span>

        <span>Saldo después: <strong style={{ color: supera ? '#dc2626' : '#047857' }}>{fmtCant(ctx.saldo_disponible_despues)}</strong></span>

      </div>

      {analisis && (

        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #0001' }}>

          <div style={{ fontWeight: 600, marginBottom: 4 }}>Análisis de valor (simple)</div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>

            <span>Costo insumo: {fmtMoney(analisis.costo_insumo_linea)}</span>

            <span>Valor cobro: {fmtMoney(analisis.valor_cobro_linea)}</span>

            <span style={{ color: (analisis.utilidad_estimada_linea ?? 0) >= 0 ? '#047857' : '#dc2626' }}>

              Utilidad est.: {fmtMoney(analisis.utilidad_estimada_linea)}

            </span>

          </div>

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

  const [pkList, setPkList] = useState([])

  const [observaciones, setObservaciones] = useState('')

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

  }, [api])



  useEffect(() => {

    if (!contratoId || !token) return

    fetchSicoePkIdsCached(API_BASE, contratoId, token).then(setPkList).catch(() => setPkList([]))

  }, [contratoId, token])



  useEffect(() => {

    if (!solicitudId) return

    api.getSolicitud(solicitudId).then((s) => {

      setSol(s)

      setObservaciones(s.observaciones || '')

      setItems(

        (s.items || []).map((it) => ({

          id: it.id,

          insumo: {

            insumo_id: it.insumo_id,

            listado_precio_id: it.listado_precio_id,

            label: it.material_descripcion,

            valor_compra_referencia: it.valor_compra_unitario,

          },

          pk_id: it.pk_id || '',

          pk_label: it.pk_id || '',

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

        })),

      )

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

    if (!ins || !it.pk_id || !it.cantidad || Number(it.cantidad) <= 0) {

      updateItem(idx, { preview: null })

      return

    }

    try {

      const body = {

        insumo_id: ins.insumo_id || undefined,

        listado_precio_id: ins.listado_precio_id || undefined,

        pk_id: it.pk_id,

        cantidad: Number(it.cantidad),

        valor_compra_unitario: it.valor_compra_unitario !== '' ? Number(it.valor_compra_unitario) : ins.valor_compra_referencia,

        exclude_solicitud_id: solicitudId || undefined,

      }

      const preview = await api.previewInsumoLine(body)

      updateItem(idx, { preview, presupuesto_id: preview.presupuesto_id, valor_compra_unitario: preview.valor_compra_unitario ?? it.valor_compra_unitario })

    } catch (e) {

      updateItem(idx, { preview: { error: e.message } })

    }

  }, [api, solicitudId])



  const onInsumoChange = (idx, insumo) => {

    setItems((prev) => {

      const next = prev.map((it, i) => (i === idx ? {

        ...it,

        insumo,

        valor_compra_unitario: insumo?.valor_compra_referencia ?? '',

        preview: null,

      } : it))

      setTimeout(() => refreshPreview(idx, next), 0)

      return next

    })

  }



  const onPkSelect = (idx, sel) => {

    const pkVal = sel.pk_label || ''

    setItems((prev) => {

      const next = prev.map((it, i) => (i === idx ? { ...it, pk_id: pkVal, pk_label: pkVal } : it))

      setTimeout(() => refreshPreview(idx, next), 0)

      return next

    })

  }



  const onCantidadChange = (idx, val) => {

    setItems((prev) => {

      const next = prev.map((it, i) => (i === idx ? { ...it, cantidad: val } : it))

      setTimeout(() => refreshPreview(idx, next), 0)

      return next

    })

  }



  const buildPayload = () => ({

    observaciones,

    items: items.map((it) => {

      const base = {

        cantidad: Number(it.cantidad),

        es_recurrente: !!it.es_recurrente,

        pk_id: it.pk_id,

        valor_compra_unitario: it.valor_compra_unitario !== '' ? Number(it.valor_compra_unitario) : undefined,

      }

      if (it.insumo?.insumo_id) {

        return { ...base, insumo_id: it.insumo.insumo_id }

      }

      if (it.insumo?.listado_precio_id) {

        return { ...base, listado_precio_id: it.insumo.listado_precio_id }

      }

      if (it.preview?.presupuesto_id || it.presupuesto_id) {

        return {

          ...base,

          presupuesto_id: it.preview?.presupuesto_id || it.presupuesto_id,

          material_descripcion: it.insumo?.label,

        }

      }

      throw new Error('Complete insumo, PK-ID y cantidad en cada línea.')

    }),

  })



  const guardar = async () => {

    setError('')

    setBusy(true)

    try {

      const payload = buildPayload()

      let result

      if (solicitudId) {

        result = await api.updateSolicitud(solicitudId, payload)

      } else {

        result = await api.createSolicitud(payload)

      }

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

      if (prov.proveedor_id) {

        body.proveedor_id = prov.proveedor_id

      } else if (prov.nit) {

        body.razon_social = prov.razon_social

        body.nit = prov.nit

      } else {

        body.proveedor_nombre = prov.razon_social

      }

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

        <div style={{ color: '#dc2626', marginBottom: 12, fontSize: 'var(--cc-sm)' }}>{error}</div>

      )}



      <AlmacenFieldLabel

        icon="📝"

        label="Observaciones"

        ayuda="Notas generales sobre esta solicitud (opcional)."

      />

      <textarea

        style={{ ...ui.input, minHeight: 60, marginBottom: 16, resize: 'vertical' }}

        value={observaciones}

        onChange={(e) => setObservaciones(e.target.value)}

        disabled={!editable}

      />



      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 'var(--cc-sm)' }}>

        📦 Insumos solicitados

      </div>



      {items.map((it, idx) => (

        <div

          key={idx}

          style={{

            border: `1px solid ${ui.textMuted}33`,

            borderRadius: 8,

            padding: 12,

            marginBottom: 12,

            background: `${ui.accentSoft}`,

          }}

        >

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

            <div style={{ gridColumn: '1 / -1' }}>

              <InsumoAutocomplete

                value={it.insumo}

                onChange={(ins) => onInsumoChange(idx, ins)}

                disabled={!editable}

              />

            </div>



            <div style={{ gridColumn: '1 / -1' }}>

              <AlmacenFieldLabel

                icon="🗺️"

                label="Ubicación PK-ID"

                ayuda="Seleccione en el mapa el sector de la obra donde se usará el insumo."

              />

              <SicoeFiltroPkMapa

                t={theme}

                token={token}

                contratoId={contratoId}

                pkList={pkList}

                pkIdSeleccionado={it.pk_id}

                pkLabel={it.pk_label}

                onSeleccionar={(sel) => onPkSelect(idx, sel)}

                onLimpiar={() => updateItem(idx, { pk_id: '', pk_label: '', preview: null })}

                compact

              />

            </div>



            <div>

              <AlmacenFieldLabel icon="💵" label="Valor compra unitario" ayuda="Referencia del listado; puede ajustarse." />

              <input

                style={ui.input}

                type="number"

                min="0"

                value={it.valor_compra_unitario}

                onChange={(e) => {

                  const val = e.target.value

                  setItems((prev) => {

                    const next = prev.map((x, i) => (i === idx ? { ...x, valor_compra_unitario: val } : x))

                    setTimeout(() => refreshPreview(idx, next), 0)

                    return next

                  })

                }}

                disabled={!editable}

              />

            </div>



            <div>

              <AlmacenFieldLabel icon="🔢" label="Cantidad" />

              <input

                style={ui.input}

                type="number"

                min="0"

                step="any"

                value={it.cantidad}

                onChange={(e) => onCantidadChange(idx, e.target.value)}

                disabled={!editable}

              />

            </div>



            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, paddingBottom: 4 }}>

              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--cc-sm)', cursor: editable ? 'pointer' : 'default' }}>

                <input

                  type="checkbox"

                  checked={!!it.es_recurrente}

                  onChange={(e) => updateItem(idx, 'es_recurrente', e.target.checked)}

                  disabled={!editable}

                />

                Compra recurrente

                <span title="Exime del mínimo de cotizaciones comparativas." style={{ cursor: 'help' }}>ⓘ</span>

              </label>

            </div>

          </div>



          {it.preview?.error && (

            <div style={{ color: '#dc2626', fontSize: 'var(--cc-sm)', marginTop: 8 }}>{it.preview.error}</div>

          )}

          <PresupuestoContextBox

            ctx={it.preview?.contexto_presupuesto}

            analisis={it.preview?.analisis_valor}

            supera={it.preview?.supera_presupuesto}

            ui={ui}

          />



          {it.id && solicitudId && (

            <div style={{ marginTop: 12, borderTop: '1px solid #ccc3', paddingTop: 10 }}>

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

          style={{ ...ui.btnSecondary, marginBottom: 16 }}

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



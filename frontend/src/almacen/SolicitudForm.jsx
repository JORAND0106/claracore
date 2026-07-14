import { useCallback, useEffect, useState } from 'react'
import CcConfirmModal from '../components/CcConfirmModal'
import InsumoSearchTable from './InsumoSearchTable'
import PresupuestoItemSelector from './PresupuestoItemSelector'
import PresupuestoRegistroGrid from './PresupuestoRegistroGrid'
import UbicacionSolicitudFields from './UbicacionSolicitudFields'
import AlmacenPkMapaSelector from './AlmacenPkMapaSelector'
import SolicitudItemDetalleCard from './SolicitudItemDetalleCard'
import SolicitudTrazabilidadPanel from './SolicitudTrazabilidadPanel'
import LineaResumenEconomico from './LineaResumenEconomico'
import OrdenCompraPdfClip from './OrdenCompraPdfClip'
import {
  lineasSuperanPresupuesto,
  lineasSuperanNegociado,
  mapSolicitudItemsFromServer,
  parseSolicitudApiError,
  validateSolicitudItems,
} from './solicitudFormHelpers'
import {
  AlmacenFieldLabel,
  buildAlmacenConfirmTheme,
  ESTADO_SOLICITUD_COLOR,
  ESTADO_SOLICITUD_LABEL,
  fmtCant,
  fmtMoney,
  formatSolicitudLinea,
  puedeAnularSolicitud,
  useAlmacenApi,
  useAlmacenTheme,
} from './almacenShared'
import { solicitudAlmacenEditable } from './almacenPermisos'
import { parseAbscisaMetros } from './almacenAbscisa'

const emptyItem = () => ({
  insumo: null,
  presupuesto_capitulo: '',
  presupuesto_item: '',
  presupuesto_id: null,
  pk_id: '',
  pk_label: '',
  pk_id_id: null,
  tramo: '',
  costado: '',
  abscisa_inicial: '',
  abscisa_final: '',
  abs_inicio_display: '',
  abs_final_display: '',
  nodo_inicio: '',
  nodo_final: '',
  observacion_residente: '',
  cantidad: '',
  valor_compra_unitario: '',
  es_recurrente: false,
  preview: null,
})

function abscisaPayload(val) {
  if (val === '' || val == null) return undefined
  const m = parseAbscisaMetros(val)
  return m != null ? m : undefined
}

function ubicacionPayload(it) {
  return {
    pk_id_id: it.pk_id_id || undefined,
    tramo: it.tramo || undefined,
    costado: it.costado || undefined,
    abscisa_inicial: abscisaPayload(it.abscisa_inicial),
    abscisa_final: abscisaPayload(it.abscisa_final),
    observacion_residente: it.observacion_residente || undefined,
  }
}

function PresupuestoContextBox({ ctx, analisis, supera, superaNegociado, ctxNeg, ui, sinPrecio, verEconomicos = true }) {
  if (!ctx && !ctxNeg?.tiene_negociado) return null
  const alertStyle = supera || superaNegociado
    ? { background: '#fef2f2', border: '1px solid #dc2626', color: '#991b1b' }
    : { background: `${ui.accentSoft}`, border: `1px solid ${ui.textMuted}22` }

  const posColor = 'var(--cc-color-positive)'

  return (
    <div style={{ ...alertStyle, borderRadius: 6, padding: '6px 8px', marginTop: 6, fontSize: 'var(--cc-xs)' }}>
      {supera && (
        <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>
          ⚠ Supera presupuesto en este PK-ID
        </div>
      )}
      {superaNegociado && ctxNeg?.tiene_negociado && (
        <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>
          ⚠ Supera cantidad negociada con el proveedor ({fmtCant(ctxNeg.consumo_total_despues)} / {fmtCant(ctxNeg.cantidad_negociada)} {ctxNeg.unidad})
        </div>
      )}
      {ctx && (
        <>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>
            {ctx.capitulo} · {ctx.item} — {ctx.descripcion}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
            <span>Ppto registro: <strong>{fmtCant(ctx.cant_presupuestada)}</strong> {ctx.unidad}</span>
            {ctx.registros_combo_count > 1 && (
              <span>
                Total PK ({ctx.registros_combo_count} reg.):{' '}
                <strong>{fmtCant(ctx.cant_presupuestada_combo)}</strong> {ctx.unidad}
              </span>
            )}
            <span>Acum.: <strong>{fmtCant(ctx.cant_solicitada_acumulada)}</strong></span>
            <span>Esta línea: <strong>{fmtCant(ctx.cantidad_solicitada)}</strong></span>
            <span>Saldo después: <strong style={{ color: supera ? 'var(--cc-color-danger)' : posColor }}>{fmtCant(ctx.saldo_disponible_despues)}</strong></span>
          </div>
        </>
      )}
      {ctxNeg?.tiene_negociado && (
        <div style={{ marginTop: ctx ? 6 : 0, display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
          <span>Negociado: <strong>{fmtCant(ctxNeg.cantidad_negociada)}</strong> {ctxNeg.unidad}</span>
          <span>Consumido (incl. esta línea): <strong style={{ color: superaNegociado ? 'var(--cc-color-danger)' : posColor }}>{fmtCant(ctxNeg.consumo_total_despues)}</strong></span>
          <span>Saldo negociado: <strong style={{ color: superaNegociado ? 'var(--cc-color-danger)' : posColor }}>{fmtCant(ctxNeg.saldo_negociado_despues)}</strong></span>
        </div>
      )}
      {sinPrecio && !analisis && (
        <div style={{ marginTop: 4, fontStyle: 'italic', opacity: 0.85 }}>
          Sin precio de compra registrado en el catálogo.
        </div>
      )}
      {analisis && (
        <LineaResumenEconomico analisis={analisis} color={alertStyle.color || ui.textMuted} verEconomicos={verEconomicos} />
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
  embedded = false,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [items, setItems] = useState([emptyItem()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [modalExitoEnvio, setModalExitoEnvio] = useState(null)
  const [sol, setSol] = useState(null)
  const [titulo, setTitulo] = useState('')
  const [confirmAnular, setConfirmAnular] = useState(false)

  const editable = solicitudAlmacenEditable(sol) && (
    solicitudId ? Boolean(permisos?.editar) : Boolean(permisos?.crear)
  )
  const verEconomicos = permisos?.verEconomicos !== false

  const aplicarSolicitudServidor = (s) => {
    setSol(s)
    setTitulo(s?.titulo || '')
    const mapped = mapSolicitudItemsFromServer(s)
    setItems(mapped.length ? mapped : [emptyItem()])
  }

  useEffect(() => {
    if (!solicitudId) return
    api.getSolicitud(solicitudId).then((s) => {
      aplicarSolicitudServidor(s)
    }).catch((e) => setError(parseSolicitudApiError(e)))
  }, [api, solicitudId])

  const updateItem = (idx, patch) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  const refreshPreview = useCallback(async (idx, draftItems) => {
    const it = draftItems[idx]
    const ins = it.insumo
    if (!ins || !it.presupuesto_capitulo || !it.presupuesto_item || !it.pk_id || !it.presupuesto_id || !it.cantidad || Number(it.cantidad) <= 0) {
      updateItem(idx, { preview: null })
      return
    }
    try {
      const cantBorradorAdicional = draftItems.reduce((acc, row, i) => {
        if (i === idx) return acc
        if (!row.cantidad || Number(row.cantidad) <= 0) return acc
        if (Number(row.presupuesto_id) !== Number(it.presupuesto_id)) return acc
        return acc + Number(row.cantidad)
      }, 0)
      const cantBorradorInsumo = draftItems.reduce((acc, row, i) => {
        if (i === idx) return acc
        if (!row.cantidad || Number(row.cantidad) <= 0) return acc
        const iid = row.insumo?.insumo_id
        const cur = ins.insumo_id
        if (!iid || !cur || Number(iid) !== Number(cur)) return acc
        return acc + Number(row.cantidad)
      }, 0)
      const body = {
        insumo_id: ins.insumo_id || undefined,
        listado_precio_id: ins.listado_precio_id || undefined,
        presupuesto_id: it.presupuesto_id,
        presupuesto_capitulo: it.presupuesto_capitulo,
        presupuesto_item: it.presupuesto_item,
        pk_id: it.pk_id,
        cantidad: Number(it.cantidad),
        cantidad_borrador_adicional: cantBorradorAdicional,
        cantidad_borrador_adicional_insumo: cantBorradorInsumo,
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
  }, [api, solicitudId])

  const clearUbicacionPresupuesto = () => ({
    presupuesto_id: null,
    tramo: '',
    abscisa_inicial: '',
    abscisa_final: '',
    abs_inicio_display: '',
    abs_final_display: '',
    nodo_inicio: '',
    nodo_final: '',
    preview: null,
  })

  const triggerPreview = (idx, next) => {
    setTimeout(() => refreshPreview(idx, next), 0)
  }

  const onPptoChange = (idx, { capitulo, item }) => {
    setItems((prev) => {
      const next = prev.map((it, i) => (i === idx ? {
        ...it,
        presupuesto_capitulo: capitulo ?? it.presupuesto_capitulo,
        presupuesto_item: item ?? it.presupuesto_item,
        ...clearUbicacionPresupuesto(),
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
    const pkVal = sel.pk_id || sel.pk_label || ''
    setItems((prev) => {
      const next = prev.map((it, i) => (i === idx ? {
        ...it,
        pk_id: pkVal,
        pk_label: sel.pk_label || pkVal,
        pk_id_id: sel.pk_id_id ? Number(sel.pk_id_id) : null,
        ...clearUbicacionPresupuesto(),
      } : it))
      triggerPreview(idx, next)
      return next
    })
  }

  const onRegistroSelect = (idx, reg) => {
    setItems((prev) => {
      const next = prev.map((it, i) => (i === idx ? {
        ...it,
        presupuesto_id: reg.presupuesto_id,
        tramo: reg.tramo || '',
        abscisa_inicial: reg.abscisa_inicial ?? '',
        abscisa_final: reg.abscisa_final ?? '',
        abs_inicio_display: reg.abs_inicio || '',
        abs_final_display: reg.abs_final || '',
        nodo_inicio: reg.nodo_inicio || '',
        nodo_final: reg.nodo_final || '',
        preview: null,
      } : it))
      triggerPreview(idx, next)
      return next
    })
  }

  const onUbicacionChange = (idx, patch) => {
    setItems((prev) => {
      const next = prev.map((it, i) => (i === idx ? { ...it, ...patch } : it))
      triggerPreview(idx, next)
      return next
    })
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

  const buildPayload = () => {
    const validation = validateSolicitudItems(items)
    if (!validation.ok) {
      throw new Error(validation.message)
    }
    return {
      titulo: titulo.trim() || undefined,
      items: items.map((it) => {
        const base = {
          cantidad: Number(it.cantidad),
          es_recurrente: !!it.es_recurrente,
          pk_id: String(it.pk_id || '').trim(),
          presupuesto_capitulo: it.presupuesto_capitulo,
          presupuesto_item: it.presupuesto_item,
          presupuesto_id: it.presupuesto_id,
          valor_compra_unitario: it.valor_compra_unitario !== '' ? Number(it.valor_compra_unitario) : undefined,
          ...ubicacionPayload(it),
        }
        if (it.insumo?.insumo_id) {
          return { ...base, insumo_id: it.insumo.insumo_id }
        }
        if (it.insumo?.listado_precio_id) {
          return { ...base, listado_precio_id: it.insumo.listado_precio_id }
        }
        throw new Error('Cada línea debe tener un insumo seleccionado.')
      }),
    }
  }

  const confirmarSiSuperaPresupuesto = () => {
    const lineas = lineasSuperanPresupuesto(items)
    if (!lineas.length) return true
    const detalle = lineas.slice(0, 3).map((it) => {
      const ctx = it.preview?.contexto_presupuesto
      return `• ${it.presupuesto_capitulo} · ${it.presupuesto_item} (PK ${it.pk_id}) — saldo ${fmtCant(ctx?.saldo_disponible_despues)} ${ctx?.unidad || ''}`
    }).join('\n')
    const extra = lineas.length > 3 ? `\n… y ${lineas.length - 3} línea(s) más.` : ''
    return window.confirm(
      `⚠ ADVERTENCIA — Supera presupuesto\n\n`
      + `Una o más líneas dejan saldo negativo en su ítem/PK-ID:\n\n${detalle}${extra}\n\n`
      + '¿Desea guardar la solicitud de todos modos?',
    )
  }

  const confirmarSiSuperaNegociado = () => {
    const lineas = lineasSuperanNegociado(items)
    if (!lineas.length) return true
    const detalle = lineas.slice(0, 3).map((it) => {
      const ctx = it.preview?.contexto_negociado
      return `• ${it.insumo?.label || 'Insumo'} — consumo ${fmtCant(ctx?.consumo_total_despues)} / ${fmtCant(ctx?.cantidad_negociada)} ${ctx?.unidad || ''}`
    }).join('\n')
    const extra = lineas.length > 3 ? `\n… y ${lineas.length - 3} línea(s) más.` : ''
    return window.confirm(
      `⚠ ADVERTENCIA — Supera cantidad negociada\n\n`
      + `Una o más líneas superan el volumen pactado con el proveedor:\n\n${detalle}${extra}\n\n`
      + '¿Desea continuar de todos modos?',
    )
  }

  const confirmarAlertasLinea = () => {
    if (!confirmarSiSuperaPresupuesto()) return false
    if (!confirmarSiSuperaNegociado()) return false
    return true
  }

  const guardar = async () => {
    setError('')
    setOkMsg('')
    setBusy(true)
    try {
      const payload = buildPayload()
      if (!confirmarAlertasLinea()) {
        setBusy(false)
        return
      }
      const result = solicitudId
        ? await api.updateSolicitud(solicitudId, payload)
        : await api.createSolicitud(payload)
      aplicarSolicitudServidor(result)
      setOkMsg('Borrador guardado correctamente.')
      onSaved?.(result)
    } catch (e) {
      setError(parseSolicitudApiError(e))
    } finally {
      setBusy(false)
    }
  }

  const solicitarAprobacion = async () => {
    setBusy(true)
    setError('')
    try {
      const payload = buildPayload()
      if (!confirmarAlertasLinea()) {
        setBusy(false)
        return
      }
      let id = solicitudId
      if (!id) {
        const created = await api.createSolicitud(payload)
        id = created.id
      } else {
        await api.updateSolicitud(id, payload)
      }
      const r = await api.enviarSolicitud(id)
      setModalExitoEnvio({
        consecutivo: r.consecutivo,
        solicitud: r,
      })
    } catch (e) {
      setError(parseSolicitudApiError(e))
    } finally {
      setBusy(false)
    }
  }

  const cerrarExitoEnvio = () => {
    const r = modalExitoEnvio?.solicitud
    setModalExitoEnvio(null)
    if (r) onSaved?.(r)
  }

  const anularSolicitud = async () => {
    if (!solicitudId) return
    setBusy(true)
    setError('')
    try {
      const r = await api.anularSolicitud(solicitudId)
      setConfirmAnular(false)
      if (r?.deleted) {
        onCancel?.()
        return
      }
      onSaved?.(r)
    } catch (e) {
      setError(parseSolicitudApiError(e))
    } finally {
      setBusy(false)
    }
  }

  const theme = buildAlmacenConfirmTheme(t, ui)
  const puedeReenviar = solicitudId && ['borrador', 'rechazada'].includes(sol?.estado) && permisos?.editar

  const rootStyle = embedded
    ? { padding: 0, border: 'none', boxShadow: 'none', background: 'transparent' }
    : ui.card

  return (
    <div style={rootStyle} className={`cc-almacen-form-root${embedded ? ' cc-almacen-form-root--embedded' : ''}`}>
      {!embedded && (
      <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span>
          {solicitudId
            ? (titulo.trim() || sol?.titulo?.trim() || `Solicitud #${sol?.consecutivo || '…'}`)
            : 'Nueva solicitud de insumos'}
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
        </span>
        {sol?.estado === 'aprobada' && sol?.orden_compra?.id && permisos?.exportar && (
          <OrdenCompraPdfClip ordenCompra={sol.orden_compra} puedeExportar />
        )}
      </div>
      )}

      {editable && (
        <div className="cc-almacen-form-section" style={{ marginBottom: embedded ? 8 : 14 }}>
          <AlmacenFieldLabel icon="📝" label="Título de la solicitud" ayuda="Nombre descriptivo para identificarla en el listado." />
          <input
            style={ui.input}
            value={titulo}
            disabled={busy}
            placeholder="Ej.: Materiales muro PK-12 tramo norte"
            onChange={(e) => setTitulo(e.target.value)}
          />
        </div>
      )}

      {!editable && sol?.titulo?.trim() && (
        <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginBottom: 14 }}>
          Título: <strong style={{ color: ui.text }}>{sol.titulo}</strong>
        </div>
      )}

      {sol && !editable && !embedded && (
        <SolicitudTrazabilidadPanel sol={sol} />
      )}

      {sol?.estado === 'rechazada' && editable && sol.motivo_rechazo && (
        <div style={{
          fontSize: 'var(--cc-sm)',
          color: '#991b1b',
          background: 'color-mix(in srgb, #dc2626 8%, var(--cc-almacen-bg-card, #fff))',
          border: '1px solid color-mix(in srgb, #dc2626 25%, transparent)',
          borderRadius: 8,
          padding: '10px 12px',
          marginBottom: 14,
        }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Solicitud rechazada</div>
          <div>{sol.motivo_rechazo}</div>
          <div style={{ marginTop: 6, color: ui.textMuted, fontSize: 'var(--cc-xs)' }}>
            Corrija los insumos y use «Reenviar a aprobación» cuando esté listo.
          </div>
        </div>
      )}

      {sol && !editable && !embedded && sol.motivo_rechazo && (
        <div style={{ fontSize: 'var(--cc-sm)', color: '#991b1b', marginBottom: 14 }}>
          Motivo rechazo: {sol.motivo_rechazo}
        </div>
      )}

      {error && (
        <div style={{
          color: '#991b1b',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 8,
          padding: '10px 12px',
          marginBottom: 10,
          fontSize: 'var(--cc-sm)',
          whiteSpace: 'pre-wrap',
        }}
        >
          {error}
        </div>
      )}

      {okMsg && (
        <div style={{
          color: 'var(--cc-color-success)',
          background: '#ecfdf5',
          border: '1px solid #a7f3d0',
          borderRadius: 8,
          padding: '10px 12px',
          marginBottom: 10,
          fontSize: 'var(--cc-sm)',
        }}
        >
          {okMsg}
        </div>
      )}

      <div style={{ fontWeight: 600, marginBottom: embedded ? 4 : 6, fontSize: 'var(--cc-sm)' }}>
        📦 Insumos solicitados
        {sol?.consecutivo && !editable && (
          <span style={{ fontWeight: 400, color: ui.textMuted, marginLeft: 8 }}>
            ({items.length} línea{items.length !== 1 ? 's' : ''})
          </span>
        )}
      </div>

      {!editable && items.map((it, idx) => (
        <SolicitudItemDetalleCard
          key={it.id ?? idx}
          item={it}
          consecutivo={sol?.consecutivo}
          lineIndex={it.numero_linea ?? idx + 1}
          contratoId={contratoId}
          token={token}
          theme={theme}
          accordion
          defaultExpanded={false}
          verEconomicos={verEconomicos}
        />
      ))}

      {editable && items.map((it, idx) => (
        <div
          key={it.id ?? idx}
          className="cc-almacen-form-section cc-almacen-form-linea"
          style={{
            border: `1px solid ${ui.textMuted}28`,
            borderRadius: embedded ? 8 : 6,
            padding: embedded ? 10 : 8,
            marginBottom: embedded ? 8 : 8,
            background: embedded ? `${ui.accentSoft}66` : `${ui.accentSoft}55`,
            position: 'relative',
          }}
        >
          {(sol?.consecutivo || solicitudId) && (
            <div style={{
              fontSize: 'var(--cc-xs)',
              fontWeight: 700,
              color: ui.accent,
              marginBottom: 6,
              letterSpacing: '0.03em',
            }}
            >
              {formatSolicitudLinea(sol?.consecutivo, it.numero_linea ?? idx + 1)}
            </div>
          )}
          {editable && (
            <button
              type="button"
              title="Eliminar insumo de la solicitud"
              onClick={() => removeItem(idx)}
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                ...ui.btnSecondary,
                padding: '3px 8px',
                color: '#dc2626',
                borderColor: '#dc262666',
                fontSize: 'var(--cc-xs)',
                lineHeight: 1.2,
                fontWeight: 600,
              }}
            >
              Eliminar insumo
            </button>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: embedded ? 4 : 6, paddingRight: editable ? 118 : 0 }}>
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
              <AlmacenPkMapaSelector
                t={theme}
                token={token}
                contratoId={contratoId}
                pkIdSeleccionado={it.pk_id_id ? String(it.pk_id_id) : ''}
                pkLabel={it.pk_label || it.pk_id}
                onSeleccionar={(sel) => onPkSelect(idx, sel)}
                onLimpiar={() => updateItem(idx, {
                  pk_id: '', pk_label: '', pk_id_id: null, ...clearUbicacionPresupuesto(),
                })}
                compact
              />
              <PresupuestoRegistroGrid
                capitulo={it.presupuesto_capitulo}
                item={it.presupuesto_item}
                pkId={it.pk_id}
                presupuestoId={it.presupuesto_id}
                excludeSolicitudId={solicitudId || undefined}
                disabled={!editable}
                onSelect={(reg) => onRegistroSelect(idx, reg)}
              />
              <UbicacionSolicitudFields
                pkId={it.pk_label || it.pk_id}
                tramo={it.tramo}
                costado={it.costado}
                abscisaInicial={it.abscisa_inicial}
                abscisaFinal={it.abscisa_final}
                absInicioDisplay={it.abs_inicio_display}
                absFinalDisplay={it.abs_final_display}
                nodoInicio={it.nodo_inicio}
                nodoFinal={it.nodo_final}
                abscisasEditable={editable}
                disabled={!editable}
                onChange={(patch) => onUbicacionChange(idx, patch)}
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
            superaNegociado={it.preview?.supera_negociado}
            ctxNeg={it.preview?.contexto_negociado}
            sinPrecio={it.insumo && it.insumo.tiene_precio_compra === false}
            verEconomicos={verEconomicos}
            ui={ui}
          />

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

      <div className={`cc-almacen-form-actions${embedded ? ' cc-almacen-form-actions--embedded' : ''}`} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {editable && (solicitudId ? permisos?.editar : permisos?.crear) && (
          <>
            <button type="button" style={ui.btnPrimary} disabled={busy} onClick={guardar}>
              {busy ? 'Guardando…' : solicitudId && sol?.estado !== 'borrador' ? 'Guardar cambios' : 'Guardar borrador'}
            </button>
            {puedeReenviar && (
              <button type="button" style={ui.btnPrimary} disabled={busy} onClick={solicitarAprobacion}>
                {busy ? 'Enviando…' : (sol?.estado === 'rechazada' ? 'Reenviar a aprobación' : 'Solicitar aprobación')}
              </button>
            )}
          </>
        )}
        {solicitudId && sol && puedeAnularSolicitud(sol, permisos) && (
          <button
            type="button"
            style={{ ...ui.btnSecondary, color: '#dc2626', borderColor: '#dc262666' }}
            disabled={busy}
            onClick={() => setConfirmAnular(true)}
          >
            Anular solicitud
          </button>
        )}
        {!embedded && (
          <button type="button" style={ui.btnSecondary} onClick={onCancel}>Volver</button>
        )}
        {embedded && (
          <button type="button" style={ui.btnSecondary} onClick={onCancel}>Cancelar</button>
        )}
      </div>

      {confirmAnular && sol && (
        <CcConfirmModal
          theme={theme}
          tipo="danger"
          titulo="Anular solicitud"
          confirmar="Anular"
          cancelar="Cancelar"
          procesando={busy}
          onCancel={() => !busy && setConfirmAnular(false)}
          onConfirm={anularSolicitud}
        >
          {sol.estado === 'borrador'
            ? `¿Eliminar la solicitud #${sol.consecutivo} en borrador? Esta acción no se puede deshacer.`
            : `¿Anular la solicitud #${sol.consecutivo} enviada? Quedará marcada como rechazada.`}
        </CcConfirmModal>
      )}

      {modalExitoEnvio && (
        <CcConfirmModal
          theme={theme}
          tipo="success"
          titulo="Solicitud enviada"
          confirmar="Entendido"
          soloConfirmar
          onCancel={cerrarExitoEnvio}
        >
          La solicitud #{modalExitoEnvio.consecutivo} fue generada con éxito y pasa al siguiente nivel de aprobación.
          Los validadores recibirán una notificación para revisarla.
        </CcConfirmModal>
      )}
    </div>
  )
}

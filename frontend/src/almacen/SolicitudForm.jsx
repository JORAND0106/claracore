import { useCallback, useEffect, useState } from 'react'
import CcConfirmModal from '../components/CcConfirmModal'
import SolicitudFormExcelTable from './SolicitudFormExcelTable'
import SolicitudItemDetalleCard from './SolicitudItemDetalleCard'
import SolicitudTrazabilidadPanel from './SolicitudTrazabilidadPanel'
import LineaResumenEconomico from './LineaResumenEconomico'
import OrdenCompraPdfClip from './OrdenCompraPdfClip'
import {
  formatSolicitudTituloAuto,
  lineasSuperanPresupuesto,
  lineasSuperanNegociado,
  mapSolicitudItemsFromServer,
  parseSolicitudApiError,
  validateSolicitudItems,
} from './solicitudFormHelpers'
import {
  buildAlmacenConfirmTheme,
  ESTADO_SOLICITUD_COLOR,
  ESTADO_SOLICITUD_LABEL,
  fmtCant,
  formatSolicitudLinea,
  puedeAnularSolicitud,
  useAlmacenApi,
  useAlmacenTheme,
} from './almacenShared'
import { solicitudAlmacenEditable } from './almacenPermisos'
import { parseAbscisaMetros } from './almacenAbscisa'

const emptyItem = () => ({
  descripcion_solicitada: '',
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
  es_principal: true,
  preview: null,
})

function itemEsPrincipal(it) {
  return it?.es_principal !== false
}

/** Otras líneas principales del mismo presupuesto_id (para preview de saldo). */
function cantBorradorPrincipales(draftItems, idx, presupuestoId) {
  return draftItems.reduce((acc, row, i) => {
    if (i === idx) return acc
    if (!itemEsPrincipal(row)) return acc
    if (!row.cantidad || Number(row.cantidad) <= 0) return acc
    if (Number(row.presupuesto_id) !== Number(presupuestoId)) return acc
    return acc + Number(row.cantidad)
  }, 0)
}

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

function PresupuestoContextBox({ ctx, analisis, supera, superaNegociado, ctxNeg, ui, sinPrecio, verEconomicos = true, esPrincipal = true }) {
  if (!ctx && !ctxNeg?.tiene_negociado) return null
  const alertStyle = supera || superaNegociado
    ? { background: '#fef2f2', border: '1px solid #dc2626', color: '#991b1b' }
    : { background: `${ui.accentSoft}`, border: `1px solid ${ui.textMuted}22` }

  const posColor = 'var(--cc-color-positive)'

  return (
    <div style={{ ...alertStyle, borderRadius: 6, padding: '6px 8px', marginTop: 6, fontSize: 'var(--cc-xs)' }}>
      {!esPrincipal && (
        <div style={{ fontWeight: 600, color: ui.textMuted, marginBottom: 4 }}>
          Insumo asociado — no descuenta presupuesto del ítem
        </div>
      )}
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
  onDirtyChange,
  onApprovalSent,
  onEstadoChange,
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
  const [confirmAnular, setConfirmAnular] = useState(false)
  const [proximoConsecutivo, setProximoConsecutivo] = useState(null)

  const editable = solicitudAlmacenEditable(sol) && (
    solicitudId ? Boolean(permisos?.editar) : Boolean(permisos?.crear)
  )
  const verEconomicos = permisos?.verEconomicos !== false
  const tituloAuto = formatSolicitudTituloAuto(
    sol?.consecutivo ?? proximoConsecutivo,
    sol?.created_at,
  )

  const aplicarSolicitudServidor = (s) => {
    setSol(s)
    if (s?.consecutivo != null) setProximoConsecutivo(s.consecutivo)
    const mapped = mapSolicitudItemsFromServer(s)
    setItems(mapped.length ? mapped : [emptyItem()])
    onEstadoChange?.(s?.estado || null)
  }

  useEffect(() => {
    if (!solicitudId) return
    api.getSolicitud(solicitudId, { ligera: true }).then((s) => {
      aplicarSolicitudServidor(s)
    }).catch((e) => setError(parseSolicitudApiError(e)))
  }, [api, solicitudId])

  useEffect(() => {
    if (solicitudId) return undefined
    let cancelled = false
    api.getProximoConsecutivoSolicitud()
      .then((n) => {
        if (!cancelled && n != null) setProximoConsecutivo(n)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [api, solicitudId])

  const updateItem = (idx, patch) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  const markDirty = () => onDirtyChange?.(true)

  const refreshPreview = useCallback(async (idx, draftItems) => {
    const it = draftItems[idx]
    if (!it.presupuesto_capitulo || !it.presupuesto_item || !it.pk_id || !it.presupuesto_id || !it.cantidad || Number(it.cantidad) <= 0) {
      setItems((prev) => prev.map((row, i) => (i === idx ? { ...row, preview: null } : row)))
      return
    }
    const ins = it.insumo
    const esPrincipal = itemEsPrincipal(it)
    const cantBorradorAdicional = cantBorradorPrincipales(draftItems, idx, it.presupuesto_id)
    // Asociado: no descuenta su cantidad. Principal: descuenta la propia + otras principales del borrador.
    const cantidadParaSaldo = esPrincipal ? Number(it.cantidad) : 0

    // Sin insumo, o asociado: solo contexto presupuestal (asociado nunca alerta sobrepresupuesto).
    if ((!ins?.insumo_id && !ins?.listado_precio_id) || !esPrincipal) {
      try {
        const ctx = await api.getPresupuestoContext(
          it.presupuesto_id,
          it.pk_id,
          cantidadParaSaldo + cantBorradorAdicional,
          solicitudId || undefined,
        )
        setItems((prev) => prev.map((row, i) => (i === idx ? {
          ...row,
          preview: {
            contexto_presupuesto: {
              ...ctx,
              es_principal: esPrincipal,
              cantidad_solicitada: Number(it.cantidad),
              supera_presupuesto: esPrincipal ? ctx?.supera_presupuesto : false,
            },
            supera_presupuesto: esPrincipal ? Boolean(ctx?.supera_presupuesto) : false,
            presupuesto_id: it.presupuesto_id,
          },
        } : row)))
      } catch (e) {
        setItems((prev) => prev.map((row, i) => (i === idx ? { ...row, preview: { error: e.message } } : row)))
      }
      return
    }
    try {
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
      setItems((prev) => prev.map((row, i) => (i === idx ? {
        ...row,
        preview,
        presupuesto_id: preview.presupuesto_id,
        valor_compra_unitario: preview.tiene_precio_compra ? (preview.valor_compra_unitario ?? '') : '',
      } : row)))
    } catch (e) {
      setItems((prev) => prev.map((row, i) => (i === idx ? { ...row, preview: { error: e.message } } : row)))
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
    markDirty()
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

  const onDescripcionChange = (idx, val) => {
    markDirty()
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, descripcion_solicitada: val } : it)))
  }

  const onPkSelect = (idx, sel) => {
    markDirty()
    const pkVal = sel.pk_id || sel.pk_label || ''
    setItems((prev) => {
      const next = prev.map((it, i) => (i === idx ? {
        ...it,
        pk_id: pkVal,
        pk_label: sel.pk_label || pkVal,
        pk_id_id: sel.pk_id_id ? Number(sel.pk_id_id) : null,
        ...clearUbicacionPresupuesto(),
        // Conservar tramo del maestro/plano (clearUbicacionPresupuesto lo dejaba vacío).
        tramo: String(sel.tramo || '').trim(),
      } : it))
      triggerPreview(idx, next)
      return next
    })
  }

  const onRegistroSelect = (idx, reg) => {
    markDirty()
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
    markDirty()
    setItems((prev) => {
      const next = prev.map((it, i) => (i === idx ? { ...it, ...patch } : it))
      triggerPreview(idx, next)
      return next
    })
  }

  const onCantidadChange = (idx, val) => {
    markDirty()
    setItems((prev) => {
      const next = prev.map((it, i) => (i === idx ? { ...it, cantidad: val } : it))
      triggerPreview(idx, next)
      // Recalcular otras principales del mismo presupuesto (borrador adicional).
      next.forEach((row, i) => {
        if (i === idx) return
        if (!itemEsPrincipal(row)) return
        if (Number(row.presupuesto_id) !== Number(next[idx].presupuesto_id)) return
        triggerPreview(i, next)
      })
      return next
    })
  }

  const onPrincipalChange = (idx, checked) => {
    markDirty()
    setItems((prev) => {
      const next = prev.map((it, i) => (i === idx ? { ...it, es_principal: !!checked } : it))
      // Recalcular esta línea y todas las del mismo presupuesto_id.
      const pid = next[idx]?.presupuesto_id
      next.forEach((row, i) => {
        if (i === idx || (pid && Number(row.presupuesto_id) === Number(pid))) {
          triggerPreview(i, next)
        }
      })
      return next
    })
  }

  const removeItem = (idx) => {
    markDirty()
    setItems((prev) => {
      if (prev.length <= 1) return [emptyItem()]
      return prev.filter((_, i) => i !== idx)
    })
  }

  const addItemAt = (idx) => {
    markDirty()
    setItems((prev) => {
      const next = [...prev]
      next.splice(idx + 1, 0, emptyItem())
      return next
    })
  }

  const buildPayload = () => {
    const validation = validateSolicitudItems(items)
    if (!validation.ok) {
      throw new Error(validation.message)
    }
    return {
      // El backend regenera el título automático; se envía para compatibilidad.
      titulo: formatSolicitudTituloAuto(sol?.consecutivo ?? proximoConsecutivo, sol?.created_at),
      items: items.map((it) => {
        const base = {
          cantidad: Number(it.cantidad),
          es_recurrente: !!it.es_recurrente,
          es_principal: it.es_principal !== false,
          pk_id: String(it.pk_id || '').trim(),
          presupuesto_capitulo: it.presupuesto_capitulo,
          presupuesto_item: it.presupuesto_item,
          presupuesto_id: it.presupuesto_id,
          descripcion_solicitada: String(it.descripcion_solicitada || '').trim(),
          ...ubicacionPayload(it),
        }
        // Conservar mapeo Gerencial/legado si la línea ya tenía insumo (no se muestra al Contratista).
        if (it.insumo?.insumo_id) {
          return {
            ...base,
            insumo_id: it.insumo.insumo_id,
            valor_compra_unitario: it.valor_compra_unitario !== ''
              ? Number(it.valor_compra_unitario)
              : undefined,
          }
        }
        return base
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
      onApprovalSent?.(r)
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
            ? (sol?.titulo?.trim() || tituloAuto || `Solicitud #${sol?.consecutivo || '…'}`)
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
          <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginBottom: 4, fontWeight: 600 }}>
            Título de la solicitud (automático)
          </div>
          <div
            style={{
              ...ui.input,
              display: 'flex',
              alignItems: 'center',
              minHeight: 36,
              background: `${ui.accentSoft}`,
              color: ui.text,
              fontWeight: 700,
              cursor: 'default',
            }}
            title="Se genera con el número de solicitud y la fecha de creación (Bogotá)."
          >
            {tituloAuto}
          </div>
        </div>
      )}

      {!editable && (sol?.titulo?.trim() || sol?.consecutivo) && (
        <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginBottom: 14 }}>
          Título: <strong style={{ color: ui.text }}>{sol?.titulo?.trim() || tituloAuto}</strong>
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
            Corrija la solicitud y use «Reenviar a aprobación» cuando esté listo.
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
        📦 Materiales solicitados
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

      {editable && (
        <>
          <SolicitudFormExcelTable
            items={items}
            busy={busy}
            t={theme}
            token={token}
            contratoId={contratoId}
            solicitudId={solicitudId}
            onPptoChange={onPptoChange}
            onDescripcionChange={onDescripcionChange}
            onCantidadChange={onCantidadChange}
            onPrincipalChange={onPrincipalChange}
            onObservacionChange={(idx, val) => { markDirty(); updateItem(idx, { observacion_residente: val }) }}
            onPkSelect={onPkSelect}
            onPkClear={(idx) => {
              markDirty()
              setItems((prev) => {
                const next = prev.map((it, i) => (i === idx ? {
                  ...it,
                  pk_id: '',
                  pk_label: '',
                  pk_id_id: null,
                  ...clearUbicacionPresupuesto(),
                } : it))
                triggerPreview(idx, next)
                return next
              })
            }}
            onRegistroSelect={onRegistroSelect}
            onUbicacionChange={onUbicacionChange}
            onAddRow={addItemAt}
            onRemoveRow={removeItem}
          />
          {items.map((it, idx) => (
            (it.preview?.error || it.preview?.contexto_presupuesto || it.preview?.contexto_negociado?.tiene_negociado) ? (
              <div key={`prev-${it.id ?? idx}`} style={{ marginTop: 6, marginBottom: 4 }}>
                {items.length > 1 && (
                  <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginBottom: 2 }}>
                    {formatSolicitudLinea(sol?.consecutivo, it.numero_linea ?? idx + 1)}
                  </div>
                )}
                {it.preview?.error && (
                  <div style={{ color: '#dc2626', fontSize: 'var(--cc-sm)' }}>{it.preview.error}</div>
                )}
                <PresupuestoContextBox
                  ctx={it.preview?.contexto_presupuesto}
                  analisis={it.preview?.analisis_valor}
                  supera={it.preview?.supera_presupuesto}
                  superaNegociado={it.preview?.supera_negociado}
                  ctxNeg={it.preview?.contexto_negociado}
                  sinPrecio={false}
                  verEconomicos={verEconomicos}
                  esPrincipal={it.es_principal !== false}
                  ui={ui}
                />
              </div>
            ) : null
          ))}
        </>
      )}

      <div className={`cc-almacen-form-actions${embedded ? ' cc-almacen-form-actions--embedded' : ''}`} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: editable ? 12 : 0 }}>
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

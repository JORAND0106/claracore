import { validateAbscisaRango } from './almacenAbscisa'
import { abscisasLineaSolicitud } from './solicitudDetalleHelpers'

/** Orden natural para capítulos e ítems (1, 2, 3 … 10, 11). */
export function naturalSortKey(text) {
  const s = String(text || '').trim()
  const parts = s.split(/(\d+)/).filter(Boolean)
  return parts.map((p) => (/^\d+$/.test(p) ? Number(p) : p.toLowerCase()))
}

export function sortNatural(a, b) {
  const ka = naturalSortKey(a)
  const kb = naturalSortKey(b)
  const len = Math.max(ka.length, kb.length)
  for (let i = 0; i < len; i += 1) {
    const va = ka[i]
    const vb = kb[i]
    if (va === undefined) return -1
    if (vb === undefined) return 1
    if (va === vb) continue
    if (typeof va === 'number' && typeof vb === 'number') return va - vb
    return String(va).localeCompare(String(vb), 'es')
  }
  return 0
}

export function itemLabelFull(p) {
  const desc = (p.descripcion || '').trim()
  return desc ? `${p.item} — ${desc}` : String(p.item || '')
}

export function mapSolicitudItemsFromServer(s) {
  return (s?.items || []).map((it, idx) => ({
    id: it.id,
    numero_linea: it.numero_linea ?? idx + 1,
    descripcion_solicitada: it.descripcion_solicitada || it.material_descripcion || '',
    insumo: it.insumo_id
      ? {
        insumo_id: it.insumo_id,
        listado_precio_id: it.listado_precio_id,
        label: it.material_descripcion,
        unidad: it.unidad,
        valor_compra_referencia: it.valor_compra_unitario,
        tiene_precio_compra: it.valor_compra_unitario != null && Number(it.valor_compra_unitario) > 0,
      }
      : null,
    presupuesto_capitulo: it.capitulo || '',
    presupuesto_item: it.item || '',
    presupuesto_id: it.presupuesto_id,
    pk_id: it.pk_id || '',
    pk_label: it.pk_id || '',
    pk_id_id: it.pk_id_id || null,
    tramo: it.tramo || '',
    costado: it.costado || '',
    abscisa_inicial: it.abscisa_inicial ?? '',
    abscisa_final: it.abscisa_final ?? '',
    ...(() => {
      const abs = abscisasLineaSolicitud(it)
      return { abs_inicio_display: abs.inicial, abs_final_display: abs.final }
    })(),
    nodo_inicio: it.contexto_presupuesto?.nodo_inicio || '',
    nodo_final: it.contexto_presupuesto?.nodo_final || '',
    observacion_residente: it.observacion_residente
      || (idx === 0 && s.observaciones ? s.observaciones : ''),
    cantidad: it.cantidad,
    valor_compra_unitario: it.valor_compra_unitario ?? '',
    vlr_unitario_cobro: it.vlr_unitario_cobro ?? '',
    unidad: it.unidad || '',
    material_descripcion: it.material_descripcion || '',
    es_recurrente: it.es_recurrente,
    preview: {
      contexto_presupuesto: it.contexto_presupuesto,
      analisis_valor: it.analisis_valor,
      supera_presupuesto: it.supera_presupuesto,
      supera_negociado: it.supera_negociado,
      contexto_negociado: it.contexto_negociado,
      presupuesto_id: it.presupuesto_id,
    },
  }))
}

export function validateSolicitudItems(items) {
  const errors = []
  items.forEach((it, idx) => {
    const n = idx + 1
    if (!it.presupuesto_capitulo || !it.presupuesto_item) {
      errors.push(`Línea ${n}: seleccione capítulo e ítem de cobro.`)
    }
    const desc = String(it.descripcion_solicitada || '').trim()
    if (desc.length < 3) {
      errors.push(`Línea ${n}: describa el material que necesita (mínimo 3 caracteres).`)
    }
    if (!it.pk_id) {
      errors.push(`Línea ${n}: seleccione la ubicación PK-ID en el mapa.`)
    }
    if (!it.presupuesto_id) {
      errors.push(`Línea ${n}: seleccione el registro de presupuesto en la grilla.`)
    }
    if (!it.cantidad || Number(it.cantidad) <= 0) {
      errors.push(`Línea ${n}: indique una cantidad mayor a cero.`)
    }
    const absCheck = validateAbscisaRango(
      it.abscisa_inicial ?? it.abs_inicio_display,
      it.abscisa_final ?? it.abs_final_display,
    )
    if (!absCheck.ok) {
      errors.push(`Línea ${n}: ${absCheck.message}`)
    }
  })
  if (errors.length) {
    return {
      ok: false,
      message: `Complete todos los campos obligatorios antes de guardar:\n\n• ${errors.join('\n• ')}`,
    }
  }
  return { ok: true }
}

export function lineasSuperanPresupuesto(items) {
  return items.filter((it) => it.preview?.supera_presupuesto)
}

export function lineasSuperanNegociado(items) {
  return items.filter((it) => it.preview?.supera_negociado)
}

export function parseSolicitudApiError(err) {
  const raw = String(err?.message || err || '')
  if (/APIError|PGRST|schema cache|column.*could not find/i.test(raw)) {
    return 'No se pudo guardar la solicitud por un error interno. Intente de nuevo; si persiste, contacte al administrador.'
  }
  if (/complete todos los campos|seleccione|obligatorio|cantidad debe|grilla|varios registros|catálogo de insumos|describa el material|insumo del catálogo|costo de compra/i.test(raw)) {
    return raw
  }
  if (/Token inválido|401|403|permiso/i.test(raw)) {
    return 'No tiene permiso para realizar esta acción o su sesión expiró. Vuelva a iniciar sesión.'
  }
  if (/no encontrad|404/i.test(raw)) {
    return 'No se encontró el recurso solicitado. Verifique los datos e intente de nuevo.'
  }
  if (raw.length > 180) {
    return 'Ocurrió un error al guardar. Verifique los datos e intente de nuevo.'
  }
  return raw || 'Ocurrió un error al guardar la solicitud.'
}

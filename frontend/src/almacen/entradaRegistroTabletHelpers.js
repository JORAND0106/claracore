/** Helpers del registro tablet de Entradas (sin bloqueos / por revisar). */

export const PASO = {
  INICIO: 'inicio',
  OC: 'oc',
  SIN_OC: 'sin_oc',
  /** Recibo: insumos marcados + cantidades + transportador/domicilio + 2 fotos */
  CAPTURA: 'captura',
  CONFIRMAR: 'confirmar',
  // Disposición («Salió material») — pasos previos sin cambio de alcance
  SECTOR: 'sector',
  ESCOMBRERA: 'escombrera',
  CANTIDAD: 'cantidad',
  PLACA: 'placa',
  FOTO: 'foto',
}

export function foldSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/** Todas las palabras de `query` deben aparecer en el texto (sin tildes ni mayúsculas). */
export function matchesAllTerms(haystack, query) {
  const terms = foldSearchText(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  const h = foldSearchText(haystack)
  return terms.every((t) => h.includes(t))
}

export function ocCardOcProveedorBlob(card) {
  if (!card) return ''
  return [
    card.numero_oc != null ? `OC ${card.numero_oc}` : '',
    card.proveedor_nombre,
    card.solicitud_consecutivo != null ? `Sol ${card.solicitud_consecutivo}` : '',
    card.solicitud_titulo,
  ].filter(Boolean).join(' ')
}

export function ocInsumoSearchBlob(ins) {
  if (!ins) return ''
  return [
    ins.material_descripcion,
    ins.insumo_id,
    ins.unidad,
    ins.pk_id,
  ].filter(Boolean).join(' ')
}

export function ocCardSearchBlob(card) {
  if (!card) return ''
  const insumos = Array.isArray(card.insumos) ? card.insumos : []
  const mats = insumos.map((i) => ocInsumoSearchBlob(i)).join(' ')
  return [ocCardOcProveedorBlob(card), mats, card.material_descripcion, card.pk_id]
    .filter(Boolean)
    .join(' ')
}

/**
 * Filtra OC para el buscador:
 * - Sin query: tarjetas completas.
 * - Si coincide OC/proveedor/solicitud: OC con todos sus insumos.
 * - Si solo coinciden insumos: OC con solo esas líneas.
 */
export function filterOcsForSearch(ocs, query) {
  const list = Array.isArray(ocs) ? ocs : []
  const q = String(query || '').trim()
  if (!q) {
    return list.map((c) => ({
      ...c,
      insumos: Array.isArray(c.insumos) ? c.insumos : [],
      matchMode: 'all',
    }))
  }
  const out = []
  for (const card of list) {
    const insumos = Array.isArray(card.insumos) ? card.insumos : []
    if (matchesAllTerms(ocCardOcProveedorBlob(card), q)) {
      out.push({ ...card, insumos, matchMode: 'oc' })
      continue
    }
    const matching = insumos.filter((ins) => {
      const consumido = Boolean(ins.consumido) || !(Number(ins.saldo_cantidad) > 0.0001)
      if (consumido) return false
      return matchesAllTerms(ocInsumoSearchBlob(ins), q)
    })
    if (matching.length) {
      out.push({ ...card, insumos: matching, matchMode: 'line' })
    }
  }
  return out
}

/** Contador de lo mostrado: líneas si el filtro es por insumo; OC en otro caso. */
export function countSearchDisplay(filtered) {
  const list = Array.isArray(filtered) ? filtered : []
  let n = 0
  for (const c of list) {
    if (c.matchMode === 'line') n += (c.insumos || []).length
    else n += 1
  }
  return n
}

/** Segmentos para resaltar coincidencias (marca el texto entero si todas las palabras aplican). */
export function highlightSegments(text, query) {
  const raw = String(text ?? '')
  if (!String(query || '').trim() || !matchesAllTerms(raw, query)) {
    return [{ text: raw, hit: false }]
  }
  return [{ text: raw, hit: true }]
}

/**
 * Reparte una cantidad recibida entre las líneas de un insumo consolidado (FIFO por id).
 * No supera el saldo de cada línea (el exceso queda sin repartir; la UI/servidor lo bloquean).
 */
export function distributeCantidadOverLineas(lineas, cantidad) {
  const qty = Number(cantidad)
  const rows = (Array.isArray(lineas) ? lineas : [])
    .map((ln) => ({
      orden_compra_item_id: ln.orden_compra_item_id,
      saldo: Number(ln.saldo_cantidad) || 0,
    }))
    .filter((ln) => ln.orden_compra_item_id)
    .sort((a, b) => a.orden_compra_item_id - b.orden_compra_item_id)
  if (!(qty > 0) || !rows.length) return []
  const out = []
  let left = qty
  for (let i = 0; i < rows.length; i += 1) {
    const ln = rows[i]
    if (left <= 0) break
    const take = Math.min(Math.max(0, ln.saldo), left)
    if (take > 0) {
      out.push({
        orden_compra_item_id: ln.orden_compra_item_id,
        cantidad_recibida: Math.round(take * 10000) / 10000,
      })
      left = Math.round((left - take) * 10000) / 10000
    }
  }
  return out
}

export function motivosPorRevisarPreview(draft) {
  const m = []
  if (!draft?.orden_compra_id) m.push('Sin orden de compra')
  // supera_saldo ya no es «por revisar»: la UI/servidor lo bloquean.
  if (draft?.proveedor_manual) m.push('Proveedor a mano')
  if (draft?.sin_insumo) m.push('Sin insumo')
  if (draft?.sin_sector) m.push('Sin sector')
  // Recibo exige 2 fotos (bloquea); disposición puede quedar sin foto → por revisar.
  if (draft?.tipo !== 'recibo' && !draft?.foto) m.push('Sin foto')
  if (draft?.vehiculo_nuevo) m.push('Vehículo nuevo')
  return m
}

export function formatPlacaInput(raw) {
  const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const letters = s.replace(/[^A-Z]/g, '').slice(0, 3)
  const nums = s.slice(letters.length).replace(/[^0-9]/g, '').slice(0, 3)
  if (!letters && !nums) return ''
  if (nums) return `${letters}-${nums}`
  return letters
}

export function placaValida(placa) {
  return /^[A-Z]{3}-\d{3}$/.test(String(placa || ''))
}

/**
 * Inicializa el estado de selección de insumos de una OC.
 * `premarcarKey`: clave del insumo a marcar al entrar por búsqueda de línea.
 */
export function initOcLineasSeleccion(insumos, premarcarKey = null) {
  const list = Array.isArray(insumos) ? insumos : []
  return list.map((ins) => {
    const key = ins.key || `${ins.insumo_id}-${ins.material_descripcion}`
    const consumido = Boolean(ins.consumido) || !(Number(ins.saldo_cantidad) > 0.0001)
    const marked = !consumido && premarcarKey != null && String(key) === String(premarcarKey)
    return {
      key,
      marked,
      cantidad: '',
      consumido,
      insumo: {
        ...ins,
        consumido,
        cantidad_pedida: Number(ins.cantidad_pedida) || Number(ins.cantidad) || 0,
      },
    }
  })
}

/** Ítems API a partir de la selección (solo marcados con cantidad > 0). */
export function buildItemsFromOcSeleccion(seleccion) {
  const out = []
  for (const row of Array.isArray(seleccion) ? seleccion : []) {
    if (!row?.marked) continue
    const cant = Number(String(row.cantidad || '').replace(',', '.'))
    if (!(cant > 0)) continue
    const ins = row.insumo || {}
    if (Array.isArray(ins.lineas) && ins.lineas.length) {
      const parts = distributeCantidadOverLineas(ins.lineas, cant)
      if (parts.length) {
        out.push(...parts)
        continue
      }
      if (ins.lineas[0]?.orden_compra_item_id) {
        out.push({
          orden_compra_item_id: ins.lineas[0].orden_compra_item_id,
          cantidad_recibida: cant,
        })
        continue
      }
    }
    out.push({ cantidad_recibida: cant })
  }
  return out
}

export function resumenLineasSeleccion(seleccion) {
  return (Array.isArray(seleccion) ? seleccion : [])
    .filter((row) => row?.marked && Number(String(row.cantidad || '').replace(',', '.')) > 0)
    .map((row) => {
      const cant = Number(String(row.cantidad || '').replace(',', '.'))
      const ins = row.insumo || {}
      return {
        key: row.key,
        material_descripcion: ins.material_descripcion || 'Material',
        unidad: ins.unidad || '',
        cantidad: cant,
        saldo: Number(ins.saldo_cantidad) || 0,
        supera: cant > (Number(ins.saldo_cantidad) || 0) + 0.0001,
      }
    })
}

/** Presentación: suma cantidades del mismo material+unidad. */
export function consolidarResumenInsumos(lineas) {
  const map = new Map()
  for (const ln of Array.isArray(lineas) ? lineas : []) {
    const mat = String(ln.material_descripcion || 'Material').trim() || 'Material'
    const und = String(ln.unidad || '').trim()
    const key = `${mat.toLowerCase()}|${und.toLowerCase()}`
    const prev = map.get(key)
    const cant = Number(ln.cantidad) || 0
    if (!prev) {
      map.set(key, {
        key,
        material_descripcion: mat,
        unidad: und,
        cantidad: cant,
        saldo: Number(ln.saldo) || 0,
        supera: Boolean(ln.supera),
      })
    } else {
      prev.cantidad += cant
      prev.saldo = Math.max(prev.saldo, Number(ln.saldo) || 0)
      prev.supera = prev.supera || Boolean(ln.supera)
    }
  }
  return [...map.values()]
}

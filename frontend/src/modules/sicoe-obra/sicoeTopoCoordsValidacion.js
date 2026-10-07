/**
 * Validación de coordenadas topográficas al guardar reporte / portada.
 * Cota vacía es opcional (con advertencia); Norte/Este inválidos bloquean.
 */
import { claveCeldaTopo } from './sicoePortadaTopoPaste.js'
import { normalizarPuntosTopoPortada, numeroTopoONull } from './sicoePortadaTopografia.js'

function etiquetaPunto(row, index) {
  const raw = String(row?.punto ?? row?.num ?? '').trim()
  return raw || String(index + 1)
}

function esTextoNoNumerico(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return false
  return numeroTopoONull(s) == null
}

function esCotaVacia(raw) {
  return numeroTopoONull(raw) == null && String(raw ?? '').trim() === ''
}

/**
 * Une etiquetas de puntos: "1", "1 y 2", "1, 2 y 3".
 * @param {Array<string|number>} labels
 */
export function formatearListaPuntosTopo(labels) {
  const list = (labels || []).map((x) => String(x).trim()).filter(Boolean)
  if (!list.length) return ''
  if (list.length === 1) return list[0]
  if (list.length === 2) return `${list[0]} y ${list[1]}`
  return `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`
}

/**
 * Analiza filas de la tabla topo antes de guardar.
 * @param {Array<object>} rows
 * @returns {{
 *   puntos: ReturnType<typeof normalizarPuntosTopoPortada>,
 *   errores: Array<{ index: number, campo: string, label: string, clave: string }>,
 *   cotasVacias: Array<{ index: number, label: string, clave: string }>,
 * }}
 */
export function analizarPuntosTopoParaGuardar(rows) {
  const list = Array.isArray(rows) ? rows : []
  const errores = []
  const cotasVacias = []

  list.forEach((row, index) => {
    if (!row || typeof row !== 'object') return
    const nRaw = String(row.norte ?? '').trim()
    const eRaw = String(row.este ?? '').trim()
    const cRaw = String(row.cota ?? '').trim()
    // Fila totalmente vacía (sin norte/este): se ignora al guardar
    if (!nRaw && !eRaw && !cRaw && !String(row.punto ?? '').trim() && !String(row.descripcion ?? row.desc ?? '').trim()) {
      return
    }
    if (!nRaw && !eRaw) {
      // Solo cota/desc sin coordenadas: no se envía; no es error duro
      return
    }
    const label = etiquetaPunto(row, index)
    if (esTextoNoNumerico(row.norte)) {
      errores.push({
        index,
        campo: 'norte',
        label,
        clave: claveCeldaTopo(index, 'norte'),
      })
    }
    if (esTextoNoNumerico(row.este)) {
      errores.push({
        index,
        campo: 'este',
        label,
        clave: claveCeldaTopo(index, 'este'),
      })
    }
    if (cRaw && esTextoNoNumerico(row.cota)) {
      errores.push({
        index,
        campo: 'cota',
        label,
        clave: claveCeldaTopo(index, 'cota'),
      })
    }
    if (esCotaVacia(row.cota) && (nRaw || eRaw) && !esTextoNoNumerico(row.norte) && !esTextoNoNumerico(row.este)) {
      cotasVacias.push({
        index,
        label,
        clave: claveCeldaTopo(index, 'cota'),
      })
    }
  })

  return {
    puntos: normalizarPuntosTopoPortada(list),
    errores,
    cotasVacias,
  }
}

/** Mensaje breve de error bloqueante (sin opción de continuar). */
export function mensajeErrorDatosTopo(errores) {
  const list = Array.isArray(errores) ? errores : []
  if (!list.length) return 'Revise las coordenadas topográficas.'
  const byCampo = new Map()
  for (const e of list) {
    const campo = e.campo === 'norte' ? 'Norte' : e.campo === 'este' ? 'Este' : e.campo === 'cota' ? 'Cota' : String(e.campo || 'dato')
    if (!byCampo.has(campo)) byCampo.set(campo, [])
    byCampo.get(campo).push(e.label)
  }
  const parts = []
  for (const [campo, labels] of byCampo) {
    const uniq = [...new Set(labels)]
    parts.push(`${campo} inválido en el punto ${formatearListaPuntosTopo(uniq)}`)
  }
  if (parts.length === 1) return `${parts[0]}. Corrija el dato para guardar.`
  return `${parts.join('. ')}. Corrija los datos para guardar.`
}

/** Mensaje breve de advertencia por cotas vacías. */
export function mensajeAdvertenciaCotaVacia(cotasVacias) {
  const list = Array.isArray(cotasVacias) ? cotasVacias : []
  const labels = [...new Set(list.map((c) => c.label))]
  if (!labels.length) return 'Cota vacía. ¿Desea continuar?'
  return `Cota vacía en los puntos ${formatearListaPuntosTopo(labels)}. ¿Desea continuar?`
}

/**
 * Conserva solo resaltes que siguen aplicando tras editar la tabla.
 * @param {Iterable<string>|Set<string>} keys
 * @param {Array<object>} rows
 * @returns {Set<string>}
 */
export function depurarResaltesTopo(keys, rows) {
  const next = new Set()
  const list = Array.isArray(rows) ? rows : []
  for (const k of keys || []) {
    const [riStr, campo] = String(k).split(':')
    const ri = Number(riStr)
    if (!Number.isFinite(ri) || !campo) continue
    const row = list[ri]
    if (!row) continue
    if (campo === 'cota') {
      if (esCotaVacia(row.cota)) next.add(k)
      continue
    }
    if (campo === 'norte' || campo === 'este') {
      if (esTextoNoNumerico(row[campo])) next.add(k)
    }
  }
  return next
}

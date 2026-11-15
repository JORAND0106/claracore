/**
 * Datos del PNG descargable de Bitácora:
 * (1) colaboradores por tramo × empresa
 * (2) eventos del día
 *
 * La captura DOM usa html-to-image; el nodo NO debe quedar en left:-9999
 * (eso genera PNG en blanco en Chrome/Safari/iPad).
 */

import { labelEventoTipo } from './bitacoraConstants.js'
import { htmlToPlainText } from './richTextUtils.js'
import {
  buildResumenTramoEmpresa,
  formatearFechaReportePersonal,
} from './bitacoraReportePersonal.js'

function textoCorto(htmlOrText, max = 320) {
  const plain = htmlToPlainText(htmlOrText || '').replace(/\s+/g, ' ').trim()
  if (!plain) return ''
  if (plain.length <= max) return plain
  return `${plain.slice(0, max - 1)}…`
}

/** Filas de eventos para la tabla del PNG. */
export function buildEventosPngRows(eventos = []) {
  const rows = []
  for (const ev of Array.isArray(eventos) ? eventos : []) {
    if (!ev || typeof ev !== 'object') continue
    const tipo = String(ev.evento_tipo || '').trim() || 'reporte_actividades'
    const det = ev.evento_detalle && typeof ev.evento_detalle === 'object' ? ev.evento_detalle : {}
    const partes = []
    const cuerpo = textoCorto(ev.cuerpo_html)
    if (cuerpo) partes.push(cuerpo)
    if (tipo === 'incidente_sst') {
      const desc = String(det.descripcion_incidente || '').trim()
      const lugar = String(det.lugar || '').trim()
      if (desc) partes.push(desc)
      if (lugar) partes.push(`Lugar: ${lugar}`)
    }
    if (tipo === 'visita_terceros') {
      const entidad = String(det.entidad || '').trim()
      const motivo = String(det.motivo || '').trim()
      if (entidad) partes.push(`Entidad: ${entidad}`)
      if (motivo) partes.push(`Motivo: ${motivo}`)
      const lista = Array.isArray(det.visitantes_lista) ? det.visitantes_lista : []
      const nombres = lista.map((v) => String(v?.nombre || '').trim()).filter(Boolean)
      if (nombres.length) partes.push(`Asistentes: ${nombres.join(', ')}`)
    }
    rows.push({
      tipo: labelEventoTipo(tipo),
      dirigido_a: String(ev.dirigido_a || '').trim() || '—',
      resumen: partes.join(' · ') || '—',
    })
  }
  return rows
}

/**
 * Payload del PNG: solo personal (matriz) + eventos.
 */
export function buildBitacoraPngPayload({
  asistencia = [],
  eventos = [],
  rrhhCatalogo = [],
  logosByEmpresaKey = {},
  fecha = '',
  contratoMeta = {},
} = {}) {
  const resumen = buildResumenTramoEmpresa({
    asistencia,
    usos: [],
    materiales: [],
    rrhhCatalogo,
    logosByEmpresaKey,
  })
  const personal = resumen.personal
  const eventosRows = buildEventosPngRows(eventos)
  return {
    fechaFmt: formatearFechaReportePersonal(fecha) || String(fecha || '').trim() || '—',
    numero: String(contratoMeta?.numero || '').trim(),
    contratista: String(contratoMeta?.contratista || '').trim(),
    personal,
    eventosRows,
    hasData: Boolean(personal?.hasData || eventosRows.length),
  }
}

/** Nombre de archivo de descarga. */
export function nombreArchivoBitacoraPng(fecha) {
  const f = String(fecha || '').trim().slice(0, 10) || 'dia'
  return `bitacora_reporte_${f}.png`
}

/**
 * Opciones de captura que evitan PNG en blanco:
 * - fondo sólido
 * - dimensiones reales del nodo
 * - pixelRatio acotado (legible sin saturar memoria en iPad)
 */
export function optsCapturaBitacoraPng(node, {
  pixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 2 : 2,
} = {}) {
  const w = Math.max(1, Math.ceil(node?.scrollWidth || node?.offsetWidth || 920))
  const h = Math.max(1, Math.ceil(node?.scrollHeight || node?.offsetHeight || 100))
  return {
    pixelRatio: Math.min(2.5, Math.max(2, pixelRatio || 2)),
    backgroundColor: '#ffffff',
    cacheBust: true,
    width: w,
    height: h,
    style: {
      // Forzar layout visible para el clon interno de html-to-image
      transform: 'none',
      opacity: '1',
    },
  }
}

/**
 * Posiciona el nodo para captura (visible al motor de layout, no a la UI)
 * y restaura estilos al terminar. Evita left:-9999 → PNG blanco.
 */
export async function withCapturePosition(node, run) {
  if (!node) throw new Error('No hay contenido para capturar')
  const prev = {
    position: node.style.position,
    left: node.style.left,
    top: node.style.top,
    right: node.style.right,
    bottom: node.style.bottom,
    opacity: node.style.opacity,
    visibility: node.style.visibility,
    zIndex: node.style.zIndex,
    pointerEvents: node.style.pointerEvents,
    transform: node.style.transform,
  }
  Object.assign(node.style, {
    position: 'fixed',
    left: '0px',
    top: '0px',
    opacity: '1',
    visibility: 'visible',
    zIndex: '-1',
    pointerEvents: 'none',
    transform: 'none',
  })
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  })
  try {
    return await run(node)
  } finally {
    Object.assign(node.style, prev)
  }
}

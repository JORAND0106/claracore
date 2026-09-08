/**
 * Resolución de datos de proveedor al abrir el popup de edición de un insumo.
 * Puro (sin React) para poder unit-testear sin cargar el formulario completo.
 */
import {
  applyAutoGanadoraByMinValor,
  pickGanadora,
  seedCotizacionPares,
  syncLegacyFromGanadora,
  impuestoGanadoraDesdePares,
} from './catalogoInsumosCotizaciones.js'
import {
  EMPTY_IMPUESTO,
  formImpuestoDesdeTributos,
  seedTributosDesdeLegado,
} from './catalogoInsumosTributos.js'

export const EMPTY_INSUMO_FORM_BASE = {
  proveedor_id: '',
  razon_social: '',
  nit: '',
  contacto_email: '',
  contacto_nombre: '',
  contacto_telefono: '',
  codigo: '',
  descripcion: '',
  unidad: '',
  rendimiento: '',
  costo_base: '',
  valor_no_previsto: '',
  cantidad_negociada: '',
  cantidad_negociada_np: '',
  impuesto: { ...EMPTY_IMPUESTO },
  impuesto_np: { ...EMPTY_IMPUESTO },
  cotizacion_numero: '',
  cotizacion_fecha: '',
  cotizacion_vigencia: '',
  cotizacion_numero_np: '',
  cotizacion_fecha_np: '',
  cotizacion_vigencia_np: '',
  cotizacion_pdf: null,
  cotizacion_pdf_nombre: '',
  cotizacion_pdf_np: null,
  cotizacion_pdf_nombre_np: '',
  cotizaciones_detalle: [],
  requiere_cotizacion: true,
}

/** Nombre de proveedor usable (ignora placeholders del listado). */
export function normProveedorNombreUi(v) {
  const s = String(v ?? '').trim()
  if (!s || s === '—' || s === '-' || s === '–') return ''
  return s
}

/**
 * Resuelve datos de proveedor al editar un insumo:
 * fila enriquecida → ganadora de cotizaciones → directorio local.
 */
export function resolveProveedorFieldsForEdit(row, pares = [], directorio = []) {
  const ganPar = (pares || []).find((p) => p.es_ganadora) || (pares || [])[0] || null
  const ganLado = ganPar?.insumo || pickGanadora(pares) || null

  let proveedor_id = row?.proveedor_id || ganPar?.proveedor_id || ganLado?.proveedor_id || ''
  let razon_social = (
    normProveedorNombreUi(row?.proveedor_nombre)
    || normProveedorNombreUi(row?.razon_social)
    || normProveedorNombreUi(ganLado?.proveedor)
    || normProveedorNombreUi(ganPar?.insumo?.proveedor)
    || ''
  )
  let nit = String(row?.proveedor_nit || row?.nit || ganPar?.nit || ganLado?.nit || '').trim()
  let contacto_email = String(row?.contacto_email || ganPar?.contacto_email || '').trim()
  let contacto_nombre = String(row?.contacto_nombre || ganPar?.contacto_nombre || '').trim()
  let contacto_telefono = String(row?.contacto_telefono || ganPar?.contacto_telefono || '').trim()

  const dir = Array.isArray(directorio) ? directorio : []
  let match = null
  if (proveedor_id) {
    match = dir.find((p) => String(p.id) === String(proveedor_id)) || null
  }
  if (!match && (razon_social || nit)) {
    const nameKey = razon_social.toLowerCase()
    match = dir.find((p) => {
      if (nit && String(p.nit || '').trim() === nit) return true
      if (nameKey && String(p.razon_social || '').trim().toLowerCase() === nameKey) return true
      return false
    }) || null
  }
  if (match) {
    if (!proveedor_id) proveedor_id = match.id
    if (!razon_social) razon_social = normProveedorNombreUi(match.razon_social)
    if (!nit) nit = String(match.nit || '').trim()
    if (!contacto_email) contacto_email = String(match.contacto_email || '').trim()
    if (!contacto_nombre) contacto_nombre = String(match.contacto_nombre || '').trim()
    if (!contacto_telefono) contacto_telefono = String(match.contacto_telefono || '').trim()
  }

  return {
    proveedor_id: proveedor_id || '',
    razon_social: razon_social || '',
    nit: nit || '',
    contacto_email: contacto_email || '',
    contacto_nombre: contacto_nombre || '',
    contacto_telefono: contacto_telefono || '',
  }
}

/** Arma el formulario de edición a partir de una fila de catálogo (listado o detalle). */
export function buildEditFormFromInsumoRow(row, { proveedoresDirectorio = [] } = {}) {
  const trib = seedTributosDesdeLegado(row)
  const provNombreSeed = (
    normProveedorNombreUi(row?.proveedor_nombre)
    || normProveedorNombreUi(row?.razon_social)
    || ''
  )
  let cotizaciones = seedCotizacionPares({
    existing: row?.cotizaciones_detalle,
    minPares: 0,
    legacy: {
      cotizacion_numero: row?.cotizacion_numero,
      cotizacion_fecha: row?.cotizacion_fecha,
      cotizacion_vigencia: row?.cotizacion_vigencia,
    },
    proveedorNombre: provNombreSeed,
    costoBase: row?.costo ?? row?.costo_base ?? '',
  })
  cotizaciones = cotizaciones.map((p) => ({
    ...p,
    coherencia: p.coherencia || {
      descripcion: row?.descripcion || '',
      unidad: row?.unidad || '',
      rendimiento: row?.rendimiento ?? '',
    },
  }))
  cotizaciones = applyAutoGanadoraByMinValor(cotizaciones)
  const legacySync = syncLegacyFromGanadora(cotizaciones)
  const gan = pickGanadora(cotizaciones)
  const impuestoGan = impuestoGanadoraDesdePares(cotizaciones)
  const prov = resolveProveedorFieldsForEdit(row, cotizaciones, proveedoresDirectorio)

  return {
    ...EMPTY_INSUMO_FORM_BASE,
    ...prov,
    codigo: row?.codigo || '',
    descripcion: row?.descripcion || '',
    unidad: row?.unidad || '',
    rendimiento: row?.rendimiento ?? '',
    costo_base: gan?.valor != null && gan.valor !== '' ? String(gan.valor) : (row?.costo ?? row?.costo_base ?? ''),
    valor_no_previsto: '',
    cantidad_negociada: row?.cantidad_negociada ?? '',
    impuesto: impuestoGan || formImpuestoDesdeTributos(trib),
    cotizacion_numero: legacySync.cotizacion_numero || row?.cotizacion_numero || '',
    cotizacion_fecha: '',
    cotizacion_vigencia: '',
    cotizaciones_detalle: cotizaciones,
    requiere_cotizacion: row?.requiere_cotizacion !== false,
  }
}

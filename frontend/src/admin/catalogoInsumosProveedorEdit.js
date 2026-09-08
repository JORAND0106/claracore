/**
 * Resolución de datos de proveedor al abrir el popup de edición de un insumo.
 * Puro (sin React) para poder unit-testear sin cargar el formulario completo.
 */
import {
  applyAutoGanadoraByMinValor,
  cloneImpuestoLado,
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

/** ¿Faltan NIT o alguno de los tres contactos? */
export function proveedorContactsIncomplete(prov) {
  if (!prov) return true
  return !(
    String(prov.nit || '').trim()
    && String(prov.contacto_email || '').trim()
    && String(prov.contacto_nombre || '').trim()
    && String(prov.contacto_telefono || '').trim()
  )
}

function contactScore(p) {
  if (!p) return 0
  let n = 0
  if (String(p.nit || '').trim()) n += 1
  if (String(p.contacto_email || '').trim()) n += 1
  if (String(p.contacto_nombre || '').trim()) n += 1
  if (String(p.contacto_telefono || '').trim()) n += 1
  if (normProveedorNombreUi(p.razon_social || p.proveedor_nombre)) n += 1
  return n
}

function findProveedorInDirectorio(directorio, { proveedor_id, razon_social, nit } = {}) {
  const dir = Array.isArray(directorio) ? directorio : []
  if (!dir.length) return null

  const byId = proveedor_id
    ? (dir.find((p) => String(p.id) === String(proveedor_id)) || null)
    : null

  const nameKey = normProveedorNombreUi(razon_social).toLowerCase()
  const nitKey = String(nit || '').trim()
  const byNameOrNit = (nameKey || nitKey)
    ? (dir.find((p) => {
      if (nitKey && String(p.nit || '').trim() === nitKey) return true
      if (nameKey && String(p.razon_social || '').trim().toLowerCase() === nameKey) return true
      return false
    }) || null)
    : null

  // Preferir el registro más completo (id vs nombre/NIT pueden diferir en calidad).
  if (byId && byNameOrNit && String(byId.id) !== String(byNameOrNit.id)) {
    return contactScore(byNameOrNit) > contactScore(byId) ? byNameOrNit : byId
  }
  if (byId && contactScore(byId) > 0) return byId
  if (byNameOrNit) return byNameOrNit
  return byId
}

/**
 * Aplica un registro del directorio sobre campos de proveedor (siempre en bloque).
 * Completa vacíos; si `force` es true, el directorio manda en contactos/NIT.
 */
export function applyDirectorioProveedor(base, match, { force = false } = {}) {
  const out = {
    proveedor_id: base?.proveedor_id || '',
    razon_social: normProveedorNombreUi(base?.razon_social) || '',
    nit: String(base?.nit || '').trim(),
    contacto_email: String(base?.contacto_email || '').trim(),
    contacto_nombre: String(base?.contacto_nombre || '').trim(),
    contacto_telefono: String(base?.contacto_telefono || '').trim(),
  }
  if (!match) return out
  if (!out.proveedor_id) out.proveedor_id = match.id || ''
  if (!out.razon_social) out.razon_social = normProveedorNombreUi(match.razon_social)
  if (force || !out.nit) out.nit = String(match.nit || '').trim() || out.nit
  if (force || !out.contacto_email) {
    out.contacto_email = String(match.contacto_email || '').trim() || out.contacto_email
  }
  if (force || !out.contacto_nombre) {
    out.contacto_nombre = String(match.contacto_nombre || '').trim() || out.contacto_nombre
  }
  if (force || !out.contacto_telefono) {
    out.contacto_telefono = String(match.contacto_telefono || '').trim() || out.contacto_telefono
  }
  return out
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

  const match = findProveedorInDirectorio(directorio, { proveedor_id, razon_social, nit })
  const filled = applyDirectorioProveedor(
    {
      proveedor_id,
      razon_social,
      nit,
      contacto_email,
      contacto_nombre,
      contacto_telefono,
    },
    match,
    // Si ya hay razón social pero faltan contactos, forzar bloque completo del directorio.
    { force: !!(razon_social && proveedorContactsIncomplete({
      nit, contacto_email, contacto_nombre, contacto_telefono,
    })) },
  )

  return {
    proveedor_id: filled.proveedor_id || '',
    razon_social: filled.razon_social || '',
    nit: filled.nit || '',
    contacto_email: filled.contacto_email || '',
    contacto_nombre: filled.contacto_nombre || '',
    contacto_telefono: filled.contacto_telefono || '',
  }
}

/**
 * Campos de captura (proveedor + Costos Insumo + Costos No Previsto) desde un par de la tabla.
 */
export function captureFieldsFromPar(par) {
  const ins = par?.insumo || {}
  const np = par?.no_previsto || {}
  return {
    proveedor_id: par?.proveedor_id || '',
    razon_social: normProveedorNombreUi(ins.proveedor) || '',
    nit: String(par?.nit || '').trim(),
    contacto_email: String(par?.contacto_email || '').trim(),
    contacto_nombre: String(par?.contacto_nombre || '').trim(),
    contacto_telefono: String(par?.contacto_telefono || '').trim(),
    costo_base: ins.valor != null && ins.valor !== '' ? String(ins.valor) : '',
    valor_no_previsto: np.valor != null && np.valor !== '' ? String(np.valor) : '',
    cotizacion_numero: ins.numero || '',
    cotizacion_fecha: ins.fecha || '',
    cotizacion_vigencia: ins.vigencia || '',
    cotizacion_numero_np: np.numero || '',
    cotizacion_fecha_np: np.fecha || '',
    cotizacion_vigencia_np: np.vigencia || '',
    cotizacion_pdf: ins.pdf || null,
    cotizacion_pdf_nombre: ins.pdf?.name || ins.pdf_nombre || '',
    cotizacion_pdf_np: np.pdf || null,
    cotizacion_pdf_nombre_np: np.pdf?.name || np.pdf_nombre || '',
    impuesto: cloneImpuestoLado(ins.impuesto),
    impuesto_np: cloneImpuestoLado(np.impuesto),
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

  const ganPar = (cotizaciones || []).find((p) => p.es_ganadora) || (cotizaciones || [])[0] || null
  const fromPar = ganPar ? captureFieldsFromPar(ganPar) : null

  return {
    ...EMPTY_INSUMO_FORM_BASE,
    ...prov,
    codigo: row?.codigo || '',
    descripcion: row?.descripcion || '',
    unidad: row?.unidad || '',
    rendimiento: row?.rendimiento ?? '',
    // Ambos paneles desde la ganadora (o primera fila), no solo el lado Insumo.
    costo_base: fromPar?.costo_base
      || (gan?.valor != null && gan.valor !== '' ? String(gan.valor) : (row?.costo ?? row?.costo_base ?? '')),
    valor_no_previsto: fromPar?.valor_no_previsto || '',
    cantidad_negociada: row?.cantidad_negociada ?? '',
    impuesto: fromPar?.impuesto || impuestoGan || formImpuestoDesdeTributos(trib),
    impuesto_np: fromPar?.impuesto_np || { ...EMPTY_IMPUESTO },
    cotizacion_numero: fromPar?.cotizacion_numero || legacySync.cotizacion_numero || row?.cotizacion_numero || '',
    cotizacion_fecha: fromPar?.cotizacion_fecha || '',
    cotizacion_vigencia: fromPar?.cotizacion_vigencia || '',
    cotizacion_numero_np: fromPar?.cotizacion_numero_np || '',
    cotizacion_fecha_np: fromPar?.cotizacion_fecha_np || '',
    cotizacion_vigencia_np: fromPar?.cotizacion_vigencia_np || '',
    cotizacion_pdf: fromPar?.cotizacion_pdf || null,
    cotizacion_pdf_nombre: fromPar?.cotizacion_pdf_nombre || '',
    cotizacion_pdf_np: fromPar?.cotizacion_pdf_np || null,
    cotizacion_pdf_nombre_np: fromPar?.cotizacion_pdf_nombre_np || '',
    cotizaciones_detalle: cotizaciones,
    requiere_cotizacion: row?.requiere_cotizacion !== false,
  }
}

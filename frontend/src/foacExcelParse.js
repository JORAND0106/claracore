import * as XLSX from 'xlsx'

/** Mapa columnas plantilla FOAC (índice 0-based en fila de datos). */
export const FOAC_COL_MAP = {
  0: 'numero',
  1: 'empresa',
  4: 'tipo_contrato',
  7: 'nombre',
  12: 'cedula',
  16: 'edad',
  18: 'sexo',
  20: 'localidad_residencia',
  23: 'cargo',
  26: 'fecha_ingreso',
  28: 'fecha_retiro',
  30: 'arl',
  32: 'clase_riesgo_arl',
  33: 'fecha_afiliacion_arl',
  35: 'eps',
  37: 'afp',
  39: 'fecha_examen_ingreso',
  41: 'fecha_examen_periodico',
  44: 'fecha_examen_egreso',
  46: 'concepto_medico',
}

/**
 * Lee un ArrayBuffer de .xlsx/.xls FOAC y devuelve filas como objetos planos.
 * @param {ArrayBuffer} buf
 * @returns {Array<Record<string, string|null>>}
 */
export function parseFoacExcelBuffer(buf) {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const filas = []
  raw.forEach((row) => {
    const num = row[0]
    const nombre = row[7]
    if (num && String(num).trim().match(/^\d+$/) && nombre && String(nombre).trim().length > 3) {
      const obj = {}
      Object.entries(FOAC_COL_MAP).forEach(([idx, campo]) => {
        let v = row[parseInt(idx, 10)]
        if (v instanceof Date) v = v.toLocaleDateString('es-CO')
        obj[campo] = v !== undefined && v !== null && String(v).trim() !== '' ? String(v).trim() : null
      })
      filas.push(obj)
    }
  })
  return filas
}

/** Orden de columnas checklist (mismos campos que plantilla FOAC). */
export function foacChecklistColumnKeys() {
  return Object.entries(FOAC_COL_MAP)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, v]) => v)
}

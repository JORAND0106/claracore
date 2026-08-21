/** Constantes UI Bitácora de Obra. */

export const MAX_FOTOS_BITACORA = 4

export const CARGOS_PERSONAL = [
  'Oficial',
  'Ayudante',
  'Maestro de obra',
  'Cadenero',
  'Topógrafo',
  'Conductor',
  'Boal',
  'Tráficos',
  'Insp. SST',
  'Insp. Tráfico',
  'Ing. Obra',
  'Ing. SST',
  'Ing. Ambiental',
  'Otro',
]

/** Tipos de evento; `conDestinatario` controla el campo «a quién se dirige». */
export const EVENTO_TIPOS = [
  { value: 'visita_terceros', label: 'Recorrido de obra', conDestinatario: true },
  { value: 'incidente_sst', label: 'Incidente de seguridad (SST)', conDestinatario: true },
  { value: 'reporte_actividades', label: 'Reporte de actividades', conDestinatario: false },
  { value: 'novedades', label: 'Novedades/Observaciones generales', conDestinatario: true },
]

export const WMO_LABELS = {
  0: 'Despejado',
  1: 'Mayormente despejado',
  2: 'Parcialmente nublado',
  3: 'Nublado',
  45: 'Niebla',
  51: 'Llovizna ligera',
  53: 'Llovizna',
  61: 'Lluvia ligera',
  63: 'Lluvia',
  65: 'Lluvia intensa',
  80: 'Chubascos',
  95: 'Tormenta',
}

export function labelEventoTipo(value) {
  return EVENTO_TIPOS.find((x) => x.value === value)?.label || value || 'Evento'
}

export function eventoTieneDestinatario(value) {
  const row = EVENTO_TIPOS.find((x) => x.value === value)
  return row ? Boolean(row.conDestinatario) : true
}

export function labelClima(code) {
  if (code == null || code === '') return ''
  const c = Number(code)
  if (WMO_LABELS[c]) return WMO_LABELS[c]
  return `Código ${c}`
}

export function hoyISOBogota() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

export function horaActualBogota() {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Bogota',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date())
  } catch {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
}

export function personalPlantillaVacia() {
  return CARGOS_PERSONAL.map((cargo) => ({
    cargo,
    cantidad: 0,
    cargo_otro: '',
  }))
}

/** Particiona cargos en 3 columnas para la grilla Excel. */
export function personalEnColumnas(rows) {
  const list = Array.isArray(rows) ? rows : personalPlantillaVacia()
  const cols = [[], [], []]
  list.forEach((row, i) => {
    cols[i % 3].push(row)
  })
  return cols
}

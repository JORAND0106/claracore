/** GG.MMSS numerico -> grados decimales (misma logica que backend). */
export function gmsToDecimal(gms) {
  const n = Number(gms) || 0
  const sign = n < 0 ? -1 : 1
  const abs = Math.abs(n)
  let grados = Math.floor(abs)
  const frac = Math.round((abs - grados) * 1e8) / 1e8
  const mmss = Math.round(frac * 100 * 1e6) / 1e6
  let minutos = Math.floor(mmss)
  let segundos = Math.round((mmss - minutos) * 100 * 100) / 100
  if (segundos >= 60) {
    minutos += 1
    segundos -= 60
  }
  if (minutos >= 60) {
    grados += 1
    minutos -= 60
  }
  return sign * (grados + minutos / 60 + segundos / 3600)
}

export function decimalToGms(decimal) {
  const grados = Math.floor(decimal)
  const minutosDec = (decimal - grados) * 60
  const minutos = Math.floor(minutosDec)
  const segundos = Math.round((minutosDec - minutos) * 60 * 100) / 100
  return `${grados}°${String(minutos).padStart(2, '0')}'${String(segundos.toFixed(2)).padStart(5, '0')}"`
}

export function validarGms(valor) {
  const str = String(valor)
  const partes = str.split('.')
  if (partes.length !== 2) return false
  const mm = parseInt(partes[1].substring(0, 2), 10)
  const ss = parseInt(partes[1].substring(2, 4), 10)
  if (Number.isNaN(mm) || Number.isNaN(ss)) return false
  return mm < 60 && ss < 60
}

/** Miles con espacio; decimales con coma (formato CO en pantalla). */
export function fmtNum(n, dec = 4) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  const neg = v < 0
  const abs = Math.abs(v)
  const [ent, frac = ''] = abs.toFixed(dec).split('.')
  const entFmt = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const num = frac ? `${entFmt},${frac}` : entFmt
  return neg ? `-${num}` : num
}

/** Entero con separador de miles = espacio (ej. 9 935). */
export function fmtEntero(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  const neg = v < 0
  const ent = String(Math.round(Math.abs(v)))
  const entFmt = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return neg ? `-${entFmt}` : entFmt
}

/** Precision relativa 1:N (N entero, miles con espacio). */
export function fmtRatio(n) {
  const v = Number(n)
  if (!Number.isFinite(v) || v <= 0) return '—'
  return `1:${fmtEntero(Math.round(v))}`
}

/**
 * Resumen de cierre angular en vivo a partir de los angulos observados.
 * sentido: 'horario' (exteriores, (n+2)*180) o 'antihorario' (interiores, (n-2)*180).
 * Las estaciones traen angulo_medido en grados decimales.
 */
export function resumenAngular(estaciones, sentido = 'antihorario', tipo = 'cerrada') {
  const n = (estaciones || []).length
  const sumaObs = (estaciones || []).reduce((acc, e) => acc + (Number(e.angulo_medido) || 0), 0)
  if (tipo !== 'cerrada' || n === 0) {
    return { n, vertices: n, sumaObs, sumaTeorica: null, difSeg: null, sumaObsTexto: n ? decimalToGms(sumaObs) : '—', sumaTeoricaTexto: '—', difTexto: '—' }
  }
  const sumaTeorica = (sentido === 'horario' ? (n + 2) : (n - 2)) * 180
  const dif = sumaObs - sumaTeorica
  const difSeg = dif * 3600
  return {
    n,
    vertices: n,
    sumaObs,
    sumaTeorica,
    difSeg,
    sumaObsTexto: decimalToGms(sumaObs),
    sumaTeoricaTexto: decimalToGms(sumaTeorica),
    difTexto: `${difSeg >= 0 ? '' : '-'}${Math.abs(difSeg).toFixed(1)}"`,
  }
}

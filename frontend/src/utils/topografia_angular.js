export function gmsToDecimal(gms) {
  const grados = Math.floor(gms)
  const minutos = Math.floor((gms - grados) * 100)
  const segundos = Math.round(((gms - grados) * 100 - minutos) * 100 * 100) / 100
  return grados + minutos / 60 + segundos / 3600
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

export function fmtNum(n, dec = 4) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return v.toFixed(dec)
}

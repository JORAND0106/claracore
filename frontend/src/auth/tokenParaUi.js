/**
 * El access token se renueva seguido, pero es la misma sesión.
 * Los módulos no deben recargar su pantalla solo porque cambió la cadena del token.
 * El token que se entrega a la interfaz se mantiene mientras el usuario (sub) sea el mismo.
 * Las llamadas que leen el almacenamiento siguen usando el token vigente.
 */

let tokenUi = ''

export function idSesion(token) {
  try {
    const parte = String(token || '').split('.')[1]
    if (!parte) return ''
    const b64 = parte.replace(/-/g, '+').replace(/_/g, '/')
    const relleno = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const json = JSON.parse(atob(relleno))
    return String(json.sub || '')
  } catch {
    return ''
  }
}

export function tokenActual() {
  try {
    return localStorage.getItem('cc_token') || sessionStorage.getItem('cc_token') || ''
  } catch {
    return ''
  }
}

export function tokenParaUi() {
  const actual = tokenActual()
  if (!actual) {
    tokenUi = ''
    return ''
  }
  if (!tokenUi || idSesion(tokenUi) !== idSesion(actual)) tokenUi = actual
  return tokenUi
}

export function olvidarTokenUi() {
  tokenUi = ''
}

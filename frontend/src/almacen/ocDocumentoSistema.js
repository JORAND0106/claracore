/** Marca distinta de «pendiente de envío»: se eligió no notificar al comercial. */

export const ETIQUETA_DOCUMENTO_SISTEMA = 'Documento de sistema'

export function esDocumentoSistema(oc) {
  if (!oc || typeof oc !== 'object') return false
  const estado = String(oc.envio_estado || '')
  if (estado === 'enviado' || estado === 'pendiente') return false
  return oc.documento_sistema === true || oc.documento_sistema === 'true' || oc.documento_sistema === 't'
}

export function textoListaOc(base, oc) {
  const txt = String(base || '')
  if (!esDocumentoSistema(oc)) return txt
  return txt ? `${txt} · ${ETIQUETA_DOCUMENTO_SISTEMA}` : ETIQUETA_DOCUMENTO_SISTEMA
}

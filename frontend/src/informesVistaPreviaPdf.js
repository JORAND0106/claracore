/**
 * Helpers de vista previa Informes: no tratar HTML (FO-EO-04) como PDF descargable.
 * Mirror de la lógica en ModuloInformes.jsx (vistaPreviaEsPdfBinario).
 */

export function vistaPreviaEsPdfBinario(vp) {
  if (!vp || vp.fase !== 'ok') return false
  const t = String(vp.tipo || '')
  const mime = String(vp.mimeTipo || vp.pdfBlob?.type || '').toLowerCase()
  if (t === 'idu-html' || t.endsWith('-html') || mime.includes('text/html')) return false
  if (mime.includes('application/pdf')) return true
  if (vp.pdfBlob && String(vp.pdfBlob.type || '').toLowerCase().includes('pdf')) return true
  return (
    t.endsWith('-pdf') ||
    t === 'memoria-pdf' ||
    t === 'memoria-pdf-todos' ||
    t === 'memoria-sem-pdf' ||
    t === 'memoria-mes-pdf'
  )
}

export function mensajeSiRespuestaEsHtmlEnVezDePdf(textSample) {
  const text = String(textSample || '')
  if (/cc-rotate-btn|<!DOCTYPE\s+html|<html[\s>]/i.test(text)) {
    return (
      'El servidor devolvió HTML (p. ej. vista previa FO-IDU-EO-04), no un archivo PDF. ' +
      'Use «Generar / descargar PDF» del formato correspondiente; «Descargar PDF» solo aplica a vistas previas binarias.'
    )
  }
  return null
}

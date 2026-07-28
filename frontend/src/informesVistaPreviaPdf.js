/**
 * Helpers de vista previa Informes.
 * Distinguen HTML (FO-EO-04 preview-html) de PDF binario para enrutar la descarga
 * al endpoint correcto — no para ocultar el botón «Descargar PDF».
 */

export function vistaPreviaEsHtmlIdu(vp) {
  if (!vp || vp.fase !== 'ok') return false
  const t = String(vp.tipo || '')
  const mime = String(vp.mimeTipo || vp.pdfBlob?.type || '').toLowerCase()
  return t === 'idu-html' || t.endsWith('-html') || mime.includes('text/html')
}

export function vistaPreviaEsPdfBinario(vp) {
  if (!vp || vp.fase !== 'ok') return false
  if (vistaPreviaEsHtmlIdu(vp)) return false
  const t = String(vp.tipo || '')
  const mime = String(vp.mimeTipo || vp.pdfBlob?.type || '').toLowerCase()
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

/**
 * Plan de descarga desde el modal de vista previa.
 * - PDF binario en memoria → blob-local
 * - FO-EO-04 HTML → job PDF ya listo, o generar el PDF real (nunca el blob HTML)
 */
export function planDescargaPdfDesdeVistaPrevia(vp, { foEo04LastJobId = null, contratoId = null } = {}) {
  if (!vp || vp.fase !== 'ok') return { action: 'none' }
  if (vistaPreviaEsPdfBinario(vp)) return { action: 'blob-local' }
  if (vistaPreviaEsHtmlIdu(vp)) {
    const jobId = foEo04LastJobId ? String(foEo04LastJobId) : ''
    const cid = contratoId != null && contratoId !== '' ? String(contratoId) : ''
    if (jobId && cid) {
      return {
        action: 'fo-eo-04-job-pdf',
        jobId,
        path: `/informes/${cid}/ccd/pdf-job/${jobId}/pdf`,
        nombre: 'FO-IDU-EO-04-V2.pdf',
      }
    }
    return { action: 'fo-eo-04-generar', conSello: false }
  }
  return {
    action: 'error',
    message: 'No hay un PDF binario en esta vista previa para descargar.',
  }
}

export function planDescargaSelloDesdeVistaPrevia(vp, { foEo04LastJobId = null, contratoId = null } = {}) {
  if (!vp || vp.fase !== 'ok') return { action: 'none' }
  if (vistaPreviaEsPdfBinario(vp) && vp.rutaSello) {
    return {
      action: 'ruta-sello',
      path: vp.rutaSello,
      nombre: vp.nombreArchivoSello || 'documento_firmado.pdf',
    }
  }
  if (vistaPreviaEsHtmlIdu(vp)) {
    const jobId = foEo04LastJobId ? String(foEo04LastJobId) : ''
    const cid = contratoId != null && contratoId !== '' ? String(contratoId) : ''
    if (jobId && cid) {
      return {
        action: 'fo-eo-04-job-sello',
        jobId,
        path: `/informes/${cid}/ccd/pdf-job/${jobId}/con-sello-firma`,
        nombre: 'FO-IDU-EO-04-V2-sello.pdf',
      }
    }
    return { action: 'fo-eo-04-generar', conSello: true }
  }
  return {
    action: 'error',
    message: 'Esta vista previa no tiene ruta de sello SHA.',
  }
}

export function mensajeSiRespuestaEsHtmlEnVezDePdf(textSample) {
  const text = String(textSample || '')
  if (/cc-rotate-btn|<!DOCTYPE\s+html|<html[\s>]/i.test(text)) {
    return (
      'El servidor devolvió HTML (p. ej. vista previa FO-IDU-EO-04) en lugar de application/pdf. ' +
      'La descarga debe usar el endpoint del job PDF (/ccd/pdf-job/.../pdf), no preview-html.'
    )
  }
  return null
}

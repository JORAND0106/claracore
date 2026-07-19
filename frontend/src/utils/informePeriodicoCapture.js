/** Captura del cuadro «Validación por rol» para compartir (copiar o descargar). */

const CAPTURE_OPTS = {
  pixelRatio: Math.min(3, typeof window !== 'undefined' ? window.devicePixelRatio || 2 : 2),
  backgroundColor: '#ffffff',
  cacheBust: true,
}

export function isClipboardImageAvailable() {
  if (typeof navigator === 'undefined') return false
  return Boolean(navigator.clipboard?.write && typeof ClipboardItem !== 'undefined')
}

export async function captureInformePeriodicoBlob(node) {
  if (!node) throw new Error('No hay contenido para capturar')
  const { toBlob } = await import('html-to-image')
  const blob = await toBlob(node, CAPTURE_OPTS)
  if (!blob) throw new Error('No se pudo generar la imagen')
  return blob
}

export async function copyInformePeriodicoBlob(blob) {
  if (!isClipboardImageAvailable()) {
    throw new Error('Portapapeles no disponible en este navegador')
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

export function downloadInformePeriodicoBlob(blob, filename = 'informe-validacion.png') {
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function informePeriodicoCaptureFilename(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `informe-validacion-${y}-${m}-${d}.png`
}

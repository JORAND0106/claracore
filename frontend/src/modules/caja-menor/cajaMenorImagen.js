/** Prepara la foto del recibo antes de subirla. Sin depender de Contabilidad. */
export function imagenDePortapapeles(event) {
  const items = event?.clipboardData?.items || []
  for (const item of items) {
    if (String(item.type || '').startsWith('image/')) {
      const file = item.getAsFile()
      if (file) return file
    }
  }
  return null
}

export function comprimirImagen(file, maxEdge = 1600, quality = 0.82) {
  return new Promise((resolve) => {
    if (!file || typeof document === 'undefined') {
      resolve(file)
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width || 1, img.height || 1))
      const w = Math.max(1, Math.round((img.width || 1) * scale))
      const h = Math.max(1, Math.round((img.height || 1) * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        resolve(file)
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url)
        if (!blob) resolve(file)
        else resolve(new File([blob], 'soporte.jpg', { type: 'image/jpeg' }))
      }, 'image/jpeg', quality)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }
    img.src = url
  })
}

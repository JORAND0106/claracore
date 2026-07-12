/**
 * Impresión POS 80 mm — Despachador.
 * Android: RawBT (402d) o BR RawPrinter (datalu) vía intent scheme rawbt:.
 * iOS: hoja Compartir con PDF → BR RawPrinter; respaldo visor Safari.
 */

const RAWBT_PACKAGE = 'ru.a402d.rawbtprinter'
const BR_RAWPRINTER_ANDROID = 'br.com.datalu.thermalprinter'
const RAWBT_SCHEME = 'rawbt'
const BR_RAWPRINTER_IOS_SHARE_HINT = 'BR RawPrinter'

export function isAndroidDevice() {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '')
}

export function isIOSDevice() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/i.test(ua)) return true
  // iPadOS 13+ a veces se identifica como Mac
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

export function isMobileDevice() {
  return isAndroidDevice() || isIOSDevice()
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      resolve(dataUrl.split(',')[1] || '')
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function rawbtPayload(base64) {
  return `rawbt:data:application/pdf;base64,${base64}`
}

/** Intent Android → app de impresión térmica (RawBT o BR RawPrinter). */
function launchAndroidPrintIntent(base64, packageName, storeUrl) {
  const payload = rawbtPayload(base64)
  const suffix = [
    `#Intent;scheme=${RAWBT_SCHEME}`,
    `package=${packageName}`,
    `S.browser_fallback_url=${encodeURIComponent(storeUrl)}`,
    'end',
  ].join(';')
  window.location.href = `intent:${encodeURIComponent(payload)}${suffix}`
}

export function launchRawBtPdfBase64(base64) {
  launchAndroidPrintIntent(
    base64,
    RAWBT_PACKAGE,
    'https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter',
  )
}

function launchBrRawPrinterAndroid(base64) {
  launchAndroidPrintIntent(
    base64,
    BR_RAWPRINTER_ANDROID,
    'https://play.google.com/store/apps/details?id=br.com.datalu.thermalprinter',
  )
}

async function tryAndroidThermalPrint(blob) {
  if (!isAndroidDevice()) return false
  const base64 = await blobToBase64(blob)
  if (!base64) return false
  // BR RawPrinter (datalu) — app indicada en campo; RawBT (402d) como respaldo vía share.
  launchBrRawPrinterAndroid(base64)
  return true
}

/**
 * iOS: abre la hoja Compartir con el PDF para elegir BR RawPrinter.
 * Safari no permite invocar apps por package; Compartir es la vía oficial.
 */
async function tryIosBrRawPrinterShare(blob, filename) {
  if (!isIOSDevice() || !navigator.share || typeof File === 'undefined') return false

  const safeName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`
  const file = new File([blob], safeName, { type: 'application/pdf' })
  const shareData = {
    files: [file],
    title: 'Disposición POS',
    text: `Imprimir con ${BR_RAWPRINTER_IOS_SHARE_HINT}`,
  }

  const canShareFiles = !navigator.canShare || navigator.canShare({ files: [file] })
  if (!canShareFiles) {
    return false
  }

  try {
    await navigator.share(shareData)
    return true
  } catch (err) {
    if (err?.name === 'AbortError') return true
    return false
  }
}

/** iOS respaldo: PDF en visor Safari → Compartir → BR RawPrinter. */
function openPdfViewerForIosShare(blob, filename) {
  const url = URL.createObjectURL(blob)
  const opened = window.open(url, '_blank', 'noopener,noreferrer')
  if (!opened) {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  setTimeout(() => URL.revokeObjectURL(url), 120000)
}

async function trySharePrint(blob, filename) {
  if (!isMobileDevice() || !navigator.share || typeof File === 'undefined') return false
  const file = new File([blob], filename, { type: 'application/pdf' })
  if (navigator.canShare && !navigator.canShare({ files: [file] })) return false
  await navigator.share({
    files: [file],
    title: 'Disposición POS',
    text: `Imprimir con ${BR_RAWPRINTER_IOS_SHARE_HINT}`,
  })
  return true
}

function printViaBrowserTab(blob) {
  const url = URL.createObjectURL(blob)
  const w = window.open(url, '_blank', 'noopener,noreferrer')
  if (w) {
    w.addEventListener('load', () => {
      try { w.print() } catch { /* ignore */ }
    })
    setTimeout(() => URL.revokeObjectURL(url), 120000)
    return
  }
  const iframe = document.createElement('iframe')
  iframe.style.display = 'none'
  iframe.src = url
  document.body.appendChild(iframe)
  iframe.onload = () => {
    try {
      iframe.contentWindow?.print()
    } finally {
      setTimeout(() => {
        iframe.remove()
        URL.revokeObjectURL(url)
      }, 60000)
    }
  }
}

/**
 * Imprime o envía el PDF POS al flujo más directo según dispositivo.
 */
export async function printPosPdfBlob(blob, { filename = 'disposicion.pdf' } = {}) {
  if (isIOSDevice()) {
    if (await tryIosBrRawPrinterShare(blob, filename)) return
    openPdfViewerForIosShare(blob, filename)
    return
  }

  if (await tryAndroidThermalPrint(blob)) return

  try {
    if (await trySharePrint(blob, filename)) return
  } catch (err) {
    if (err?.name === 'AbortError') return
  }

  // Respaldo Android: intent RawBT clásico (402d)
  if (isAndroidDevice()) {
    const base64 = await blobToBase64(blob)
    if (base64) {
      launchRawBtPdfBase64(base64)
      return
    }
  }

  printViaBrowserTab(blob)
}

/** Abre el PDF para impresión o visualización. */
export async function openPosPdfBlob(blob, { filename = 'disposicion.pdf' } = {}) {
  if (isIOSDevice()) {
    if (await tryIosBrRawPrinterShare(blob, filename)) return
    openPdfViewerForIosShare(blob, filename)
    return
  }

  if (await tryAndroidThermalPrint(blob)) return

  const url = URL.createObjectURL(blob)
  const opened = window.open(url, '_blank', 'noopener,noreferrer')
  if (!opened) {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
  }
  setTimeout(() => URL.revokeObjectURL(url), 120000)
}

export { launchBrRawPrinterAndroid, tryIosBrRawPrinterShare }

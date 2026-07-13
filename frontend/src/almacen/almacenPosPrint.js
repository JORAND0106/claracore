/**
 * Impresión POS 80 mm — Despachador / Entradas (Almacén).
 * Android: BR RawPrinter o RawBT vía intent scheme rawbt:.
 * iOS / móvil: Web Share API con File (PDF real) → BR RawPrinter; nunca visor blob: URL.
 */

import { CLARA_BP } from '../useClaraViewport'

const RAWBT_PACKAGE = 'ru.a402d.rawbtprinter'
const BR_RAWPRINTER_ANDROID = 'br.com.datalu.thermalprinter'
const RAWBT_SCHEME = 'rawbt'

export function isAndroidDevice() {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '')
}

export function isIOSDevice() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/i.test(ua)) return true
  if (/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)) return true
  if (navigator.userAgentData?.platform === 'iOS') return true
  if (typeof window !== 'undefined' && window.navigator?.standalone === true) return true
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true
  return false
}

export function isMobileDevice() {
  return isAndroidDevice() || isIOSDevice()
}

/** Misma lógica que Almacén compact (teléfono / landscape móvil). */
export function isCompactAlmacenViewport() {
  if (typeof window === 'undefined') return false
  const width = window.innerWidth
  const isLandscape =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(orientation: landscape)').matches
      : width > window.innerHeight
  return width <= CLARA_BP.mobileMax || (isLandscape && width <= CLARA_BP.landscapeMobileMax)
}

/**
 * En móvil no abrir blob: en Safari (BR RawPrinter recibe un enlace vacío).
 * Siempre pedir gesto del usuario con hoja Compartir + File.
 */
export function shouldUsePdfSharePrompt() {
  if (isIOSDevice()) return true
  if (isAndroidDevice()) return false
  if (!isCompactAlmacenViewport()) return false
  return Boolean(navigator.share && typeof File !== 'undefined')
}

function safePdfFilename(filename) {
  const base = (filename || 'documento.pdf').trim() || 'documento.pdf'
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`
}

function pdfFileFromBlob(blob, filename) {
  return new File([blob], safePdfFilename(filename), {
    type: 'application/pdf',
    lastModified: Date.now(),
  })
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
  launchBrRawPrinterAndroid(base64)
  return true
}

function canSharePdfFile(file) {
  if (!navigator.share || typeof File === 'undefined') return false
  if (!navigator.canShare) return true
  try {
    return navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

/** Descarga del PDF (respaldo si Compartir no está disponible). */
function triggerPdfDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = safePdfFilename(filename)
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

/**
 * Tras fetch async, iOS pierde el "user gesture" de navigator.share.
 * Mostramos un botón para que el usuario dispare Compartir con el PDF en memoria.
 */
function promptMobilePdfShare(blob, filename) {
  return new Promise((resolve) => {
    const safeName = safePdfFilename(filename)

    const overlay = document.createElement('div')
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.setAttribute('aria-label', 'Compartir PDF para imprimir')
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2147483646',
      'background:rgba(15,23,42,0.55)',
      'display:flex', 'align-items:flex-end', 'justify-content:center',
      'padding:0',
    ].join(';')

    const sheet = document.createElement('div')
    sheet.style.cssText = [
      'background:#fff', 'width:100%', 'max-width:480px',
      'border-radius:16px 16px 0 0',
      'padding:20px 16px calc(20px + env(safe-area-inset-bottom,0px))',
      'box-shadow:0 -12px 40px rgba(0,0,0,0.25)',
    ].join(';')

    const title = document.createElement('p')
    title.textContent = 'Compartir PDF para imprimir'
    title.style.cssText = 'margin:0 0 8px;font-weight:700;font-size:17px;color:#0f172a;'

    const hint = document.createElement('p')
    hint.textContent =
      'Toque «Compartir PDF» y elija BR RawPrinter. Se enviará el archivo completo, no un enlace de vista previa.'
    hint.style.cssText = 'margin:0 0 16px;font-size:14px;line-height:1.4;color:#64748b;'

    const btnShare = document.createElement('button')
    btnShare.type = 'button'
    btnShare.textContent = 'Compartir PDF'
    btnShare.style.cssText = [
      'width:100%', 'padding:14px 16px', 'margin-bottom:8px',
      'background:#047857', 'color:#fff', 'border:none', 'border-radius:10px',
      'font-size:16px', 'font-weight:600', 'cursor:pointer',
    ].join(';')

    const btnCancel = document.createElement('button')
    btnCancel.type = 'button'
    btnCancel.textContent = 'Cancelar'
    btnCancel.style.cssText = [
      'width:100%', 'padding:12px 16px',
      'background:#f1f5f9', 'color:#334155', 'border:none', 'border-radius:10px',
      'font-size:16px', 'cursor:pointer',
    ].join(';')

    const cleanup = () => {
      overlay.remove()
    }

    const runShare = async () => {
      const file = pdfFileFromBlob(blob, safeName)
      if (!canSharePdfFile(file)) {
        triggerPdfDownload(blob, safeName)
        cleanup()
        resolve(false)
        return
      }
      try {
        await navigator.share({ files: [file] })
        cleanup()
        resolve(true)
      } catch (err) {
        if (err?.name === 'AbortError') {
          cleanup()
          resolve(true)
          return
        }
        triggerPdfDownload(blob, safeName)
        cleanup()
        resolve(false)
      }
    }

    btnShare.addEventListener('click', () => {
      void runShare()
    })

    btnCancel.addEventListener('click', () => {
      cleanup()
      resolve(false)
    })

    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) {
        cleanup()
        resolve(false)
      }
    })

    sheet.addEventListener('click', (ev) => ev.stopPropagation())

    sheet.append(title, hint, btnShare, btnCancel)
    overlay.appendChild(sheet)
    document.body.appendChild(overlay)
  })
}

/** iOS / móvil: nunca abrir blob: URL; siempre hoja Compartir con gesto del usuario. */
async function deliverMobilePdf(blob, filename) {
  await promptMobilePdfShare(blob, filename)
}

function printViaBrowserTab(blob) {
  const url = URL.createObjectURL(blob)
  const w = window.open(url, '_blank', 'noopener,noreferrer')
  if (w) {
    w.addEventListener('load', () => {
      try {
        w.print()
      } catch {
        /* ignore */
      }
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

/** Imprime o envía el PDF POS al flujo más directo según dispositivo. */
export async function printPosPdfBlob(blob, { filename = 'disposicion.pdf' } = {}) {
  if (shouldUsePdfSharePrompt()) {
    await deliverMobilePdf(blob, filename)
    return
  }

  if (await tryAndroidThermalPrint(blob)) return

  if (isAndroidDevice()) {
    const base64 = await blobToBase64(blob)
    if (base64) {
      launchRawBtPdfBase64(base64)
      return
    }
  }

  printViaBrowserTab(blob)
}

/** Abre/comparte el PDF (móvil: mismo flujo de archivo real que imprimir). */
export async function openPosPdfBlob(blob, { filename = 'disposicion.pdf' } = {}) {
  if (shouldUsePdfSharePrompt()) {
    await deliverMobilePdf(blob, filename)
    return
  }

  if (await tryAndroidThermalPrint(blob)) return

  const url = URL.createObjectURL(blob)
  const opened = window.open(url, '_blank', 'noopener,noreferrer')
  if (!opened) {
    triggerPdfDownload(blob, filename)
  }
  setTimeout(() => URL.revokeObjectURL(url), 120000)
}

export { launchBrRawPrinterAndroid }

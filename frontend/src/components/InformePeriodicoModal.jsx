import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Copy, Check, Download } from 'lucide-react'
import { getDashTypoUI } from '../typographyScale'
import MatrizValidacionSicoePanel from './MatrizValidacionSicoePanel'
import {
  captureInformePeriodicoBlob,
  copyInformePeriodicoBlob,
  downloadInformePeriodicoBlob,
  informePeriodicoCaptureFilename,
  isClipboardImageAvailable,
} from '../utils/informePeriodicoCapture'

export default function InformePeriodicoModal({
  open,
  t,
  activeTheme,
  fontSize = 'normal',
  matriz,
  matrizLoading = false,
  niveles,
  onRefreshData,
  copiedInModal,
  onDismissWithoutCopy,
  onCopySuccess,
  onOk,
}) {
  const captureRef = useRef(null)
  const [shareBusy, setShareBusy] = useState(false)
  const [shareDone, setShareDone] = useState(false)
  const [shareMethod, setShareMethod] = useState(null)
  const [shareError, setShareError] = useState(null)
  const du = getDashTypoUI(fontSize)

  useEffect(() => {
    if (!open) return
    setShareDone(false)
    setShareMethod(null)
    setShareError(null)
    onRefreshData?.()
  }, [open, onRefreshData])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onDismissWithoutCopy?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onDismissWithoutCopy])

  const markShareCompleted = useCallback(
    (method) => {
      setShareDone(true)
      setShareMethod(method)
      setShareError(null)
      onCopySuccess?.()
    },
    [onCopySuccess],
  )

  const runShare = useCallback(
    async (method) => {
      if (!captureRef.current || shareBusy) return
      setShareBusy(true)
      setShareError(null)
      try {
        const blob = await captureInformePeriodicoBlob(captureRef.current)
        if (method === 'clipboard') {
          await copyInformePeriodicoBlob(blob)
        } else {
          downloadInformePeriodicoBlob(blob, informePeriodicoCaptureFilename())
        }
        markShareCompleted(method)
      } catch (err) {
        const msg = err?.message || 'No se pudo compartir la imagen'
        setShareError(
          method === 'clipboard'
            ? `${msg} Use «Descargar imagen» para guardar el informe en su dispositivo.`
            : msg,
        )
      } finally {
        setShareBusy(false)
      }
    },
    [shareBusy, markShareCompleted],
  )

  const handleCopy = useCallback(() => void runShare('clipboard'), [runShare])
  const handleDownload = useCallback(() => void runShare('download'), [runShare])

  if (!open) return null

  const canShare = Boolean(matriz) && !matrizLoading
  const hasShared = copiedInModal || shareDone
  const clipboardAvailable = isClipboardImageAvailable()
  const headerTitlePx = Math.round(du.title * 1.65)
  const headerLeadPx = Math.round(du.body * 1.15)

  let statusMessage = 'Copie o descargue la imagen antes de cerrar.'
  if (shareError) {
    statusMessage = shareError
  } else if (hasShared) {
    statusMessage =
      shareMethod === 'download'
        ? 'Imagen descargada. Puede cerrar con OK o haciendo clic fuera del modal.'
        : 'Imagen copiada. Puede cerrar con OK o haciendo clic fuera del modal.'
  } else if (matrizLoading) {
    statusMessage = 'Cargando datos de validación…'
  } else if (!clipboardAvailable) {
    statusMessage =
      'El portapapeles no está disponible aquí. Use «Descargar imagen» y compártala desde su galería o archivos.'
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="informe-periodico-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1400,
        background: 'rgba(15, 23, 42, 0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={() => onDismissWithoutCopy?.()}
    >
      <div
        style={{
          background: t.bgCard,
          borderRadius: 16,
          border: `1px solid ${t.border}`,
          boxShadow: t.shadow,
          width: 'min(1288px, 100%)',
          maxHeight: 'min(92vh, 960px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '28px 32px 24px',
            borderBottom: `2px solid ${t.border}`,
            background: `linear-gradient(180deg, ${t.primary}18 0%, ${t.bgCard} 100%)`,
            boxShadow: 'inset 0 -1px 0 rgba(15, 23, 42, 0.06)',
          }}
        >
          <h2
            id="informe-periodico-title"
            style={{
              margin: 0,
              fontSize: headerTitlePx,
              lineHeight: 1.2,
              fontWeight: 900,
              letterSpacing: '-0.02em',
              color: t.text,
            }}
          >
            Es hora de enviar tu informe
          </h2>
          <p
            style={{
              margin: '14px 0 0',
              fontSize: headerLeadPx,
              fontWeight: 500,
              color: t.textMuted,
              lineHeight: 1.55,
              maxWidth: '52em',
            }}
          >
            Comparte el estado de validación del día. Copie la imagen del cuadro siguiente, descárguela
            si el portapapeles no está disponible, y luego pulse OK.
          </p>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px 16px', background: t.bgCard }}>
          <div
            ref={captureRef}
            style={{
              background: '#ffffff',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              padding: 16,
              color: '#0f172a',
            }}
          >
            <MatrizValidacionSicoePanel
              variant="capture"
              matriz={matriz}
              loading={matrizLoading}
              niveles={niveles}
              t={t}
              activeTheme={activeTheme}
              fontSize={fontSize}
            />
          </div>
        </div>

        <div
          style={{
            padding: '12px 16px 16px',
            borderTop: `1px solid ${t.border}`,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 12,
          }}
        >
          <span
            style={{
              flex: '1 1 200px',
              fontSize: du.sub,
              color: shareError ? '#dc2626' : t.textMuted,
            }}
          >
            {statusMessage}
          </span>
          {clipboardAvailable ? (
            <button
              type="button"
              title="Copiar imagen al portapapeles"
              aria-label="Copiar imagen al portapapeles"
              disabled={shareBusy || !canShare}
              onClick={handleCopy}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 44,
                height: 44,
                borderRadius: 10,
                border: `1px solid ${t.border}`,
                background: hasShared && shareMethod === 'clipboard' ? '#dcfce7' : t.bg,
                color: hasShared && shareMethod === 'clipboard' ? '#15803d' : t.text,
                cursor: shareBusy || !canShare ? 'wait' : 'pointer',
              }}
            >
              {hasShared && shareMethod === 'clipboard' ? <Check size={22} /> : <Copy size={22} />}
            </button>
          ) : null}
          <button
            type="button"
            title="Descargar imagen"
            aria-label="Descargar imagen"
            disabled={shareBusy || !canShare}
            onClick={handleDownload}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              minHeight: 44,
              padding: clipboardAvailable ? '0 12px' : '0 14px',
              borderRadius: 10,
              border: `1px solid ${t.border}`,
              background: hasShared && shareMethod === 'download' ? '#dcfce7' : t.bg,
              color: hasShared && shareMethod === 'download' ? '#15803d' : t.text,
              fontWeight: 600,
              fontSize: du.sub,
              cursor: shareBusy || !canShare ? 'wait' : 'pointer',
            }}
          >
            {hasShared && shareMethod === 'download' ? <Check size={20} /> : <Download size={20} />}
            {!clipboardAvailable ? 'Descargar imagen' : null}
          </button>
          <button
            type="button"
            onClick={onOk}
            disabled={!hasShared}
            style={{
              minWidth: 88,
              minHeight: 44,
              borderRadius: 10,
              border: 'none',
              background: hasShared ? t.primary : t.border,
              color: hasShared ? '#fff' : t.textMuted,
              fontWeight: 700,
              fontSize: du.body,
              cursor: hasShared ? 'pointer' : 'not-allowed',
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

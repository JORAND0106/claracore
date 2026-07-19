import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Copy, Check } from 'lucide-react'
import { getDashTypoUI } from '../typographyScale'
import MatrizValidacionSicoePanel from './MatrizValidacionSicoePanel'

async function copyCaptureToClipboard(node) {
  const { toBlob } = await import('html-to-image')
  const blob = await toBlob(node, {
    pixelRatio: Math.min(3, window.devicePixelRatio || 2),
    backgroundColor: '#ffffff',
    cacheBust: true,
  })
  if (!blob) throw new Error('No se pudo generar la imagen')
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Portapapeles no disponible en este navegador')
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

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
  const [copyBusy, setCopyBusy] = useState(false)
  const [copyDone, setCopyDone] = useState(false)
  const [copyError, setCopyError] = useState(null)
  const du = getDashTypoUI(fontSize)

  useEffect(() => {
    if (!open) return
    setCopyDone(false)
    setCopyError(null)
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

  const handleCopy = useCallback(async () => {
    if (!captureRef.current || copyBusy) return
    setCopyBusy(true)
    setCopyError(null)
    try {
      await copyCaptureToClipboard(captureRef.current)
      setCopyDone(true)
      onCopySuccess?.()
    } catch (err) {
      setCopyError(err?.message || 'No se pudo copiar la imagen')
    } finally {
      setCopyBusy(false)
    }
  }, [copyBusy, onCopySuccess])

  if (!open) return null

  const canCopy = Boolean(matriz) && !matrizLoading
  const hasCopied = copiedInModal || copyDone
  const headerTitlePx = Math.round(du.title * 1.65)
  const headerLeadPx = Math.round(du.body * 1.15)

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
            Comparte el estado de validación del día. Copia la imagen del cuadro siguiente y luego pulsa OK.
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
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 12,
          }}
        >
          {copyError ? (
            <span style={{ flex: 1, fontSize: du.sub, color: '#dc2626' }}>{copyError}</span>
          ) : (
            <span style={{ flex: 1, fontSize: du.sub, color: t.textMuted }}>
              {hasCopied
                ? 'Imagen copiada. Puede cerrar con OK o haciendo clic fuera del modal.'
                : matrizLoading
                  ? 'Cargando datos de validación…'
                  : 'Copie la imagen antes de cerrar.'}
            </span>
          )}
          <button
            type="button"
            title="Copiar imagen al portapapeles"
            aria-label="Copiar imagen al portapapeles"
            disabled={copyBusy || !canCopy}
            onClick={() => void handleCopy()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 44,
              height: 44,
              borderRadius: 10,
              border: `1px solid ${t.border}`,
              background: hasCopied ? '#dcfce7' : t.bg,
              color: hasCopied ? '#15803d' : t.text,
              cursor: copyBusy || !canCopy ? 'wait' : 'pointer',
            }}
          >
            {hasCopied ? <Check size={22} /> : <Copy size={22} />}
          </button>
          <button
            type="button"
            onClick={onOk}
            disabled={!hasCopied}
            style={{
              minWidth: 88,
              minHeight: 44,
              borderRadius: 10,
              border: 'none',
              background: hasCopied ? t.primary : t.border,
              color: hasCopied ? '#fff' : t.textMuted,
              fontWeight: 700,
              fontSize: du.body,
              cursor: hasCopied ? 'pointer' : 'not-allowed',
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

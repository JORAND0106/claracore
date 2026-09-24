/**
 * Resumen cruzado Tramo × Empresa: misma vista en pantalla y en PNG exportado.
 * No altera el PDF completo de Bitácora.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import { API_BASE } from '../../apiBase'
import {
  downloadInformePeriodicoBlob,
} from '../../utils/informePeriodicoCapture'
import {
  buildResumenTramoEmpresa,
  formatearFechaReportePersonal,
  formatoCeldaResumen,
  nombreArchivoResumenPng,
  resolveLogosPorEmpresa,
  tituloReportePersonal,
} from './bitacoraReportePersonal'

const CAPTURE_OPTS = {
  pixelRatio: Math.min(3, typeof window !== 'undefined' ? window.devicePixelRatio || 2 : 2),
  backgroundColor: '#ffffff',
  cacheBust: true,
}

function EmpresaLogo({ url, nombre, t, size = 28 }) {
  const [broken, setBroken] = useState(false)
  if (!url || broken) {
    return (
      <div
        aria-hidden
        title={nombre}
        style={{
          width: size,
          height: size * 0.7,
          borderRadius: 4,
          border: `1px dashed ${t?.border || '#cbd5e1'}`,
          background: t?.inputBg || '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 8,
          fontWeight: 700,
          color: t?.textMuted || '#64748b',
          flexShrink: 0,
        }}
      >
        —
      </div>
    )
  }
  return (
    <img
      src={url}
      alt=""
      onError={() => setBroken(true)}
      style={{
        width: size,
        height: size * 0.7,
        objectFit: 'contain',
        borderRadius: 4,
        background: '#fff',
        border: `1px solid ${t?.border || '#e2e8f0'}`,
        flexShrink: 0,
      }}
    />
  )
}

function CeldaResumen({ cell, t, strong = false }) {
  const txt = formatoCeldaResumen(cell)
  const empty = txt === '—'
  return (
    <td
      style={{
        padding: '8px 10px',
        textAlign: 'center',
        borderBottom: `1px solid ${t?.border || '#e2e8f0'}`,
        borderRight: `1px solid ${t?.border || '#e2e8f0'}`,
        color: empty ? (t?.textMuted || '#94a3b8') : (t?.text || '#0f2942'),
        fontWeight: strong ? 800 : (empty ? 500 : 700),
        fontSize: 13,
        whiteSpace: 'nowrap',
        background: strong ? (t?.inputBg || '#f8fafc') : undefined,
      }}
    >
      {txt}
    </td>
  )
}

export default function BitacoraReportePersonalModal({
  open,
  onClose,
  t,
  fecha,
  asistencia = [],
  usos = [],
  rrhhCatalogo = [],
  contratoId,
  token,
  contratoMeta = {},
}) {
  const [empresasOpts, setEmpresasOpts] = useState([])
  const [pngBusy, setPngBusy] = useState(false)
  const [pngError, setPngError] = useState('')
  const captureRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    if (!contratoId || !token) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/rrhh/${contratoId}/empresas-contratantes`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok || cancelled) return
        const data = await res.json()
        const opts = Array.isArray(data?.opciones) ? data.opciones : []
        if (!cancelled) setEmpresasOpts(opts)
      } catch { /* sin permiso RRHH: solo logo contratista del contrato */ }
    })()
    return () => { cancelled = true }
  }, [open, contratoId, token])

  const logosByEmpresaKey = useMemo(
    () => resolveLogosPorEmpresa({
      empresasOpciones: empresasOpts,
      contrato: contratoMeta,
    }),
    [empresasOpts, contratoMeta],
  )

  const resumen = useMemo(
    () => buildResumenTramoEmpresa({
      asistencia,
      usos,
      rrhhCatalogo,
      logosByEmpresaKey,
    }),
    [asistencia, usos, rrhhCatalogo, logosByEmpresaKey],
  )

  const titulo = tituloReportePersonal(fecha)
  const fechaFmt = formatearFechaReportePersonal(fecha)
  const numero = String(contratoMeta?.numero || '').trim()
  const objeto = String(contratoMeta?.objeto || '').trim()
  const proyecto = String(contratoMeta?.contratista || '').trim()
  const vacio = resumen.tramos.length === 0 || resumen.empresas.length === 0

  const descargarPng = useCallback(async () => {
    const node = captureRef.current
    if (!node || typeof window === 'undefined') return
    setPngBusy(true)
    setPngError('')
    try {
      // Esperar logos antes de capturar (misma imagen que se ve en pantalla).
      const imgs = [...node.querySelectorAll('img')]
      await Promise.all(imgs.map((img) => (
        img.complete ? Promise.resolve() : new Promise((res) => {
          img.onload = img.onerror = () => res()
        })
      )))
      const { toBlob } = await import('html-to-image')
      const blob = await toBlob(node, CAPTURE_OPTS)
      if (!blob) throw new Error('No se pudo generar la imagen')
      downloadInformePeriodicoBlob(blob, nombreArchivoResumenPng(fecha))
    } catch (err) {
      setPngError(err?.message || 'No se pudo descargar el PNG')
    } finally {
      setPngBusy(false)
    }
  }, [fecha])

  if (!open) return null

  const border = t?.border || '#bae6fd'
  const text = t?.text || '#0f2942'
  const muted = t?.textMuted || '#4a7fa5'

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100080,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(960px, 100%)',
          maxHeight: '92vh',
          overflow: 'auto',
          background: t?.bgCard || '#fff',
          borderRadius: 16,
          border: `1px solid ${border}`,
          boxShadow: '0 24px 80px rgba(0,0,0,0.28)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <CcModalBrandHeader theme={t} />
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: `1px solid ${t?.border || '#e2e8f0'}`,
        }}>
          <div style={{ fontWeight: 800, color: text, fontSize: 'var(--cc-title, 15px)' }}>
            {titulo}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {pngError ? (
              <span style={{ fontSize: 11, color: '#b91c1c', maxWidth: 220 }}>{pngError}</span>
            ) : null}
            <button
              type="button"
              onClick={() => void descargarPng()}
              disabled={pngBusy || vacio}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: 'none',
                background: t?.primary || '#0077B6',
                color: '#fff',
                fontWeight: 700,
                fontSize: 12,
                cursor: pngBusy || vacio ? 'not-allowed' : 'pointer',
                opacity: pngBusy || vacio ? 0.65 : 1,
              }}
              title="Descarga exactamente lo mostrado como imagen PNG"
            >
              {pngBusy ? 'Generando…' : 'Descargar PNG'}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: `1px solid ${border}`,
                background: t?.inputBg || '#f8fafc',
                color: text,
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Cerrar
            </button>
          </div>
        </div>

        {/* Este nodo es la vista previa Y la fuente del PNG (misma composición). */}
        <div
          ref={captureRef}
          style={{
            padding: 16,
            background: '#fff',
            color: text,
          }}
        >
          <h1 style={{
            margin: '0 0 4px',
            fontSize: 17,
            color: text,
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          }}>
            Resumen por tramo y empresa · {fechaFmt || fecha || '—'}
          </h1>
          <div style={{
            fontSize: 12,
            color: muted,
            marginBottom: 12,
            lineHeight: 1.4,
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          }}>
            {numero ? <>Contrato {numero}</> : null}
            {numero && (proyecto || objeto) ? ' · ' : null}
            {proyecto || null}
            {proyecto && objeto ? ' — ' : null}
            {objeto || null}
            {!numero && !proyecto && !objeto ? 'Bitácora de obra' : null}
          </div>

          <div style={{
            fontSize: 11,
            color: muted,
            marginBottom: 10,
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          }}>
            Celdas: personal (p) · maquinaria (m). Filas = tramos · columnas = empresas.
          </div>

          {vacio ? (
            <div style={{
              padding: 16,
              borderRadius: 10,
              border: `1px dashed ${t?.border || '#cbd5e1'}`,
              color: muted,
              fontSize: 13,
            }}>
              No hay personal ni maquinaria registrados para este día.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
                  fontSize: 12,
                  minWidth: 320 + resumen.empresas.length * 88,
                }}
              >
                <thead>
                  <tr>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '8px 10px',
                        background: t?.primary ? `${t.primary}14` : '#ddeff8',
                        borderBottom: `1px solid ${border}`,
                        borderRight: `1px solid ${border}`,
                        color: muted,
                        fontWeight: 800,
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: '0.03em',
                        position: 'sticky',
                        left: 0,
                        zIndex: 1,
                      }}
                    >
                      Tramo
                    </th>
                    {resumen.empresas.map((emp) => (
                      <th
                        key={emp.key}
                        style={{
                          padding: '8px 8px 6px',
                          background: t?.primary ? `${t.primary}14` : '#ddeff8',
                          borderBottom: `1px solid ${border}`,
                          borderRight: `1px solid ${border}`,
                          color: text,
                          fontWeight: 700,
                          fontSize: 11,
                          verticalAlign: 'bottom',
                          minWidth: 88,
                        }}
                      >
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 4,
                        }}>
                          <EmpresaLogo url={emp.logo_url} nombre={emp.nombre} t={t} />
                          <span style={{ textAlign: 'center', lineHeight: 1.2 }}>{emp.nombre}</span>
                        </div>
                      </th>
                    ))}
                    <th
                      style={{
                        padding: '8px 10px',
                        background: t?.primary ? `${t.primary}22` : '#cfe7f5',
                        borderBottom: `1px solid ${border}`,
                        color: text,
                        fontWeight: 800,
                        fontSize: 11,
                        textAlign: 'center',
                      }}
                    >
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.tramos.map((tr) => (
                    <tr key={tr.key}>
                      <td
                        style={{
                          padding: '8px 10px',
                          borderBottom: `1px solid ${t?.border || '#e2e8f0'}`,
                          borderRight: `1px solid ${t?.border || '#e2e8f0'}`,
                          color: text,
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                          background: '#fff',
                          position: 'sticky',
                          left: 0,
                          zIndex: 1,
                        }}
                      >
                        {tr.nombre}
                      </td>
                      {resumen.empresas.map((emp) => (
                        <CeldaResumen
                          key={`${tr.key}-${emp.key}`}
                          cell={resumen.cells[tr.key]?.[emp.key]}
                          t={t}
                        />
                      ))}
                      <CeldaResumen
                        cell={resumen.rowTotals[tr.key]}
                        t={t}
                        strong
                      />
                    </tr>
                  ))}
                  <tr>
                    <td
                      style={{
                        padding: '8px 10px',
                        borderTop: `2px solid ${border}`,
                        borderRight: `1px solid ${t?.border || '#e2e8f0'}`,
                        color: text,
                        fontWeight: 800,
                        background: t?.inputBg || '#f8fafc',
                        position: 'sticky',
                        left: 0,
                        zIndex: 1,
                      }}
                    >
                      Total
                    </td>
                    {resumen.empresas.map((emp) => (
                      <CeldaResumen
                        key={`tot-${emp.key}`}
                        cell={resumen.colTotals[emp.key]}
                        t={t}
                        strong
                      />
                    ))}
                    <CeldaResumen cell={resumen.grandTotal} t={t} strong />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined'
    ? createPortal(overlay, document.body)
    : overlay
}

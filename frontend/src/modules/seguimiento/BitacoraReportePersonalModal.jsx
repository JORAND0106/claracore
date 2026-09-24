/**
 * Resumen Cruzado Tramo × Empresa: tablas separadas Personal / Maquinaria / Materiales.
 * PNG → copiar al portapapeles (mismo mecanismo del informe Dashboard 9 a.m.).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy } from 'lucide-react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import { API_BASE } from '../../apiBase'
import {
  copyInformePeriodicoBlob,
  downloadInformePeriodicoBlob,
  isClipboardImageAvailable,
} from '../../utils/informePeriodicoCapture'
import {
  buildResumenTramoEmpresa,
  formatearFechaReportePersonal,
  formatoCeldaCantidad,
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

function CeldaCantidad({ value, t, strong = false }) {
  const txt = formatoCeldaCantidad(value)
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

function TablaEmpresaTramo({ tituloSeccion, matrix, t, border, text, muted }) {
  if (!matrix?.hasData) return null
  const { tramos, empresas, cells, rowTotals, colTotals, grandTotal } = matrix
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 style={{
        margin: '0 0 8px',
        fontSize: 14,
        fontWeight: 800,
        color: text,
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      }}>
        {tituloSeccion}
      </h2>
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
            fontSize: 12,
            minWidth: 280 + empresas.length * 80,
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
              {empresas.map((emp) => (
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
                    minWidth: 80,
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
            {tramos.map((tr) => (
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
                {empresas.map((emp) => (
                  <CeldaCantidad
                    key={`${tr.key}-${emp.key}`}
                    value={cells[tr.key]?.[emp.key]}
                    t={t}
                  />
                ))}
                <CeldaCantidad value={rowTotals[tr.key]} t={t} strong />
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
              {empresas.map((emp) => (
                <CeldaCantidad
                  key={`tot-${emp.key}`}
                  value={colTotals[emp.key]}
                  t={t}
                  strong
                />
              ))}
              <CeldaCantidad value={grandTotal} t={t} strong />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TablaMateriales({ matrix, t, border, text, muted }) {
  if (!matrix?.hasData) return null
  const { rows = [], colTotals = {}, grandTotal = {} } = matrix
  const thBase = {
    padding: '8px 10px',
    background: t?.primary ? `${t.primary}14` : '#ddeff8',
    borderBottom: `1px solid ${border}`,
    borderRight: `1px solid ${border}`,
    fontWeight: 800,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  }
  return (
    <div style={{ marginBottom: 8 }}>
      <h2 style={{
        margin: '0 0 8px',
        fontSize: 14,
        fontWeight: 800,
        color: text,
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      }}>
        Materiales
      </h2>
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
            fontSize: 12,
            minWidth: 360,
          }}
        >
          <thead>
            <tr>
              <th style={{ ...thBase, textAlign: 'left', color: muted }}>
                Tipo de material
              </th>
              <th style={{ ...thBase, textAlign: 'left', color: muted }}>
                Tramo
              </th>
              <th style={{ ...thBase, textAlign: 'center', color: text }}>
                Ingreso
              </th>
              <th style={{ ...thBase, textAlign: 'center', color: text }}>
                Salida
              </th>
              <th
                style={{
                  ...thBase,
                  borderRight: 'none',
                  background: t?.primary ? `${t.primary}22` : '#cfe7f5',
                  textAlign: 'center',
                  color: text,
                }}
              >
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td
                  style={{
                    padding: '8px 10px',
                    borderBottom: `1px solid ${t?.border || '#e2e8f0'}`,
                    borderRight: `1px solid ${t?.border || '#e2e8f0'}`,
                    color: text,
                    fontWeight: 700,
                  }}
                >
                  {r.tipo}
                </td>
                <td
                  style={{
                    padding: '8px 10px',
                    borderBottom: `1px solid ${t?.border || '#e2e8f0'}`,
                    borderRight: `1px solid ${t?.border || '#e2e8f0'}`,
                    color: text,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.tramo}
                </td>
                <CeldaCantidad value={r.ingreso} t={t} />
                <CeldaCantidad value={r.salida} t={t} />
                <CeldaCantidad value={(r.ingreso || 0) + (r.salida || 0)} t={t} strong />
              </tr>
            ))}
            <tr>
              <td
                colSpan={2}
                style={{
                  padding: '8px 10px',
                  borderTop: `2px solid ${border}`,
                  borderRight: `1px solid ${t?.border || '#e2e8f0'}`,
                  color: text,
                  fontWeight: 800,
                  background: t?.inputBg || '#f8fafc',
                }}
              >
                Total
              </td>
              <CeldaCantidad value={colTotals.ingreso} t={t} strong />
              <CeldaCantidad value={colTotals.salida} t={t} strong />
              <CeldaCantidad
                value={(grandTotal.ingreso || 0) + (grandTotal.salida || 0)}
                t={t}
                strong
              />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function BitacoraReportePersonalModal({
  open,
  onClose,
  t,
  fecha,
  asistencia = [],
  usos = [],
  materiales = [],
  rrhhCatalogo = [],
  contratoId,
  token,
  contratoMeta = {},
}) {
  const [empresasOpts, setEmpresasOpts] = useState([])
  const [pngBusy, setPngBusy] = useState(false)
  const [pngError, setPngError] = useState('')
  const [pngCopied, setPngCopied] = useState(false)
  const captureRef = useRef(null)
  const copiedTimer = useRef(null)

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

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
  }, [])

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
      materiales,
      rrhhCatalogo,
      logosByEmpresaKey,
    }),
    [asistencia, usos, materiales, rrhhCatalogo, logosByEmpresaKey],
  )

  const titulo = tituloReportePersonal(fecha)
  const fechaFmt = formatearFechaReportePersonal(fecha)
  const numero = String(contratoMeta?.numero || '').trim()
  const objeto = String(contratoMeta?.objeto || '').trim()
  const proyecto = String(contratoMeta?.contratista || '').trim()
  const vacio = !resumen.personal.hasData
    && !resumen.maquinaria.hasData
    && !resumen.materiales.hasData
  const clipboardOk = isClipboardImageAvailable()

  const copiarPng = useCallback(async () => {
    const node = captureRef.current
    if (!node || typeof window === 'undefined') return
    setPngBusy(true)
    setPngError('')
    setPngCopied(false)
    try {
      const imgs = [...node.querySelectorAll('img')]
      await Promise.all(imgs.map((img) => (
        img.complete ? Promise.resolve() : new Promise((res) => {
          img.onload = img.onerror = () => res()
        })
      )))
      const { toBlob } = await import('html-to-image')
      const blob = await toBlob(node, CAPTURE_OPTS)
      if (!blob) throw new Error('No se pudo generar la imagen')
      if (clipboardOk) {
        await copyInformePeriodicoBlob(blob)
        setPngCopied(true)
        if (copiedTimer.current) clearTimeout(copiedTimer.current)
        copiedTimer.current = setTimeout(() => setPngCopied(false), 2500)
      } else {
        downloadInformePeriodicoBlob(blob, nombreArchivoResumenPng(fecha))
        setPngError('Portapapeles no disponible: se descargó el PNG')
      }
    } catch (err) {
      setPngError(err?.message || 'No se pudo copiar la imagen')
    } finally {
      setPngBusy(false)
    }
  }, [fecha, clipboardOk])

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
          justifyContent: 'flex-end',
          padding: '10px 14px',
          borderBottom: `1px solid ${t?.border || '#e2e8f0'}`,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginRight: 'auto' }}>
            {pngCopied ? (
              <span
                role="status"
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: t?.primary || '#0077B6',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Check size={14} aria-hidden />
                Imagen copiada
              </span>
            ) : null}
            {pngError ? (
              <span style={{ fontSize: 11, color: '#b91c1c', maxWidth: 260 }}>{pngError}</span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void copiarPng()}
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
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
            title={clipboardOk
              ? 'Copia el resumen al portapapeles como imagen PNG'
              : 'Portapapeles no disponible: descargará el PNG'}
          >
            <Copy size={14} aria-hidden />
            {pngBusy ? 'Generando…' : (pngCopied ? 'Copiado' : 'Copiar imagen')}
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

        {/* Vista previa = fuente del PNG (título principal una sola vez aquí). */}
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
            marginBottom: 14,
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

          {vacio ? (
            <div style={{
              padding: 16,
              borderRadius: 10,
              border: `1px dashed ${t?.border || '#cbd5e1'}`,
              color: muted,
              fontSize: 13,
            }}>
              No hay personal, maquinaria ni materiales registrados para este día.
            </div>
          ) : (
            <>
              <TablaEmpresaTramo
                tituloSeccion="Personal"
                matrix={resumen.personal}
                t={t}
                border={border}
                text={text}
                muted={muted}
              />
              <TablaEmpresaTramo
                tituloSeccion="Maquinaria"
                matrix={resumen.maquinaria}
                t={t}
                border={border}
                text={text}
                muted={muted}
              />
              <TablaMateriales
                matrix={resumen.materiales}
                t={t}
                border={border}
                text={text}
                muted={muted}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined'
    ? createPortal(overlay, document.body)
    : overlay
}

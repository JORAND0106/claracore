/**
 * Resumen completo de Bitácora → tablas por sección → PNG al portapapeles.
 * Si el contenido es muy alto, se parte en varias imágenes (copiar parte a parte).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy } from 'lucide-react'
import CcConfirmModal from '../../components/CcConfirmModal'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import { API_BASE } from '../../apiBase'
import {
  copyInformePeriodicoBlob,
  isClipboardImageAvailable,
} from '../../utils/informePeriodicoCapture'
import {
  buildResumenBitacoraCompleto,
  formatearFechaReportePersonal,
  formatoCeldaCantidad,
  resolveLogosPorEmpresa,
  tituloReportePersonal,
} from './bitacoraReportePersonal'

/** Altura máxima por parte (px CSS) para no saturar html-to-image / portapapeles. */
const MAX_CHUNK_HEIGHT_PX = 4200

const CAPTURE_OPTS = {
  pixelRatio: Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 2 : 2),
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
    <div data-resumen-chunk style={{ marginBottom: 18 }}>
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
              <th style={{
                padding: '8px 10px',
                textAlign: 'left',
                borderBottom: `2px solid ${border}`,
                borderRight: `1px solid ${border}`,
                background: t?.inputBg || '#f1f5f9',
                color: muted,
                fontWeight: 700,
                position: 'sticky',
                left: 0,
                zIndex: 1,
              }}>
                Tramo
              </th>
              {empresas.map((emp) => (
                <th
                  key={emp.key}
                  style={{
                    padding: '8px 6px',
                    textAlign: 'center',
                    borderBottom: `2px solid ${border}`,
                    borderRight: `1px solid ${border}`,
                    background: t?.inputBg || '#f1f5f9',
                    color: text,
                    fontWeight: 700,
                    minWidth: 72,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <EmpresaLogo url={emp.logo_url} nombre={emp.nombre} t={t} />
                    <span style={{ fontSize: 10, lineHeight: 1.2, maxWidth: 88, wordBreak: 'break-word' }}>
                      {emp.nombre}
                    </span>
                  </div>
                </th>
              ))}
              <th style={{
                padding: '8px 10px',
                textAlign: 'center',
                borderBottom: `2px solid ${border}`,
                background: t?.inputBg || '#e2e8f0',
                color: text,
                fontWeight: 800,
              }}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {tramos.map((tr) => (
              <tr key={tr.key}>
                <td style={{
                  padding: '8px 10px',
                  borderBottom: `1px solid ${border}`,
                  borderRight: `1px solid ${border}`,
                  fontWeight: 700,
                  color: text,
                  whiteSpace: 'nowrap',
                  background: '#fff',
                  position: 'sticky',
                  left: 0,
                }}>
                  {tr.nombre}
                </td>
                {empresas.map((emp) => (
                  <CeldaCantidad
                    key={emp.key}
                    value={cells[tr.key]?.[emp.key]}
                    t={t}
                  />
                ))}
                <CeldaCantidad value={rowTotals[tr.key]} t={t} strong />
              </tr>
            ))}
            <tr>
              <td style={{
                padding: '8px 10px',
                borderTop: `2px solid ${border}`,
                borderRight: `1px solid ${border}`,
                fontWeight: 800,
                color: text,
                background: t?.inputBg || '#f8fafc',
                position: 'sticky',
                left: 0,
              }}>
                Total
              </td>
              {empresas.map((emp) => (
                <CeldaCantidad key={emp.key} value={colTotals[emp.key]} t={t} strong />
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
  const { rows, colTotals } = matrix
  return (
    <div data-resumen-chunk style={{ marginBottom: 18 }}>
      <h2 style={{
        margin: '0 0 8px',
        fontSize: 14,
        fontWeight: 800,
        color: text,
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      }}>
        Materiales (ingresos / salidas)
      </h2>
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
            fontSize: 12,
            minWidth: 320,
          }}
        >
          <thead>
            <tr>
              {['Tipo de material', 'Tramo', 'Ingreso', 'Salida'].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: '8px 10px',
                    textAlign: h === 'Tipo de material' || h === 'Tramo' ? 'left' : 'center',
                    borderBottom: `2px solid ${border}`,
                    background: t?.inputBg || '#f1f5f9',
                    color: muted,
                    fontWeight: 700,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td style={{
                  padding: '8px 10px',
                  borderBottom: `1px solid ${border}`,
                  color: text,
                  fontWeight: 600,
                }}>
                  {r.tipo}
                </td>
                <td style={{
                  padding: '8px 10px',
                  borderBottom: `1px solid ${border}`,
                  color: text,
                }}>
                  {r.tramo}
                </td>
                <CeldaCantidad value={r.ingreso} t={t} />
                <CeldaCantidad value={r.salida} t={t} />
              </tr>
            ))}
            <tr>
              <td
                colSpan={2}
                style={{
                  padding: '8px 10px',
                  borderTop: `2px solid ${border}`,
                  fontWeight: 800,
                  color: text,
                  background: t?.inputBg || '#f8fafc',
                }}
              >
                Total
              </td>
              <CeldaCantidad value={colTotals.ingreso} t={t} strong />
              <CeldaCantidad value={colTotals.salida} t={t} strong />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TablaKv({ titulo, rows, t, border, text, muted }) {
  if (!rows?.length) return null
  return (
    <div data-resumen-chunk style={{ marginBottom: 18 }}>
      <h2 style={{
        margin: '0 0 8px',
        fontSize: 14,
        fontWeight: 800,
        color: text,
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      }}>
        {titulo}
      </h2>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          fontSize: 12,
        }}
      >
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.label}-${r.value}`}>
              <td style={{
                padding: '7px 10px',
                borderBottom: `1px solid ${border}`,
                color: muted,
                fontWeight: 700,
                width: '36%',
                background: t?.inputBg || '#f8fafc',
              }}>
                {r.label}
              </td>
              <td style={{
                padding: '7px 10px',
                borderBottom: `1px solid ${border}`,
                color: text,
              }}>
                {r.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TablaGenerica({ titulo, columns, rows, t, border, text, muted }) {
  if (!rows?.length) return null
  return (
    <div data-resumen-chunk style={{ marginBottom: 18 }}>
      <h2 style={{
        margin: '0 0 8px',
        fontSize: 14,
        fontWeight: 800,
        color: text,
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      }}>
        {titulo}
      </h2>
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
            fontSize: 12,
            minWidth: 280,
          }}
        >
          <thead>
            <tr>
              {(columns || []).map((c) => (
                <th
                  key={c.key}
                  style={{
                    padding: '8px 10px',
                    textAlign: 'left',
                    borderBottom: `2px solid ${border}`,
                    background: t?.inputBg || '#f1f5f9',
                    color: muted,
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx}>
                {(columns || []).map((c) => (
                  <td
                    key={c.key}
                    style={{
                      padding: '7px 10px',
                      borderBottom: `1px solid ${border}`,
                      color: text,
                      verticalAlign: 'top',
                      maxWidth: c.key === 'resumen' || c.key === 'texto' || c.key === 'observacion'
                        ? 320
                        : undefined,
                      wordBreak: 'break-word',
                    }}
                  >
                    {r[c.key] != null && r[c.key] !== '' ? String(r[c.key]) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function renderSeccion(sec, { t, border, text, muted }) {
  if (!sec?.hasData) return null
  if (sec.kind === 'tramo_empresa') {
    return (
      <TablaEmpresaTramo
        key={sec.id}
        tituloSeccion={sec.title}
        matrix={sec}
        t={t}
        border={border}
        text={text}
        muted={muted}
      />
    )
  }
  if (sec.kind === 'materiales') {
    return (
      <TablaMateriales
        key={sec.id}
        matrix={sec}
        t={t}
        border={border}
        text={text}
        muted={muted}
      />
    )
  }
  if (sec.kind === 'kv') {
    return (
      <TablaKv
        key={sec.id}
        titulo={sec.title}
        rows={sec.rows}
        t={t}
        border={border}
        text={text}
        muted={muted}
      />
    )
  }
  return (
    <TablaGenerica
      key={sec.id}
      titulo={sec.title}
      columns={sec.columns}
      rows={sec.rows}
      t={t}
      border={border}
      text={text}
      muted={muted}
    />
  )
}

async function waitImages(node) {
  const imgs = [...node.querySelectorAll('img')]
  await Promise.all(imgs.map((img) => (
    img.complete ? Promise.resolve() : new Promise((res) => {
      img.onload = img.onerror = () => res()
    })
  )))
}

/**
 * Parte nodos [data-resumen-chunk] en grupos cuya altura acumulada
 * no supera MAX_CHUNK_HEIGHT_PX (conserva orden y no omite secciones).
 */
function planChunks(root) {
  const chunks = [...root.querySelectorAll('[data-resumen-chunk]')]
  if (!chunks.length) return [[root]]
  const groups = []
  let current = []
  let height = 0
  for (const el of chunks) {
    const h = el.offsetHeight || 0
    if (current.length && height + h > MAX_CHUNK_HEIGHT_PX) {
      groups.push(current)
      current = []
      height = 0
    }
    current.push(el)
    height += h
  }
  if (current.length) groups.push(current)
  return groups
}

export default function BitacoraReportePersonalModal({
  open = false,
  onClose,
  t,
  fecha,
  asistencia = [],
  usos = [],
  materiales = [],
  rrhhCatalogo = [],
  eventos = [],
  clima = {},
  horaInicio = '',
  cuerpoHtml = '',
  imagenes = [],
  elaboradoPor = '',
  contratoId,
  token,
  contratoMeta = {},
}) {
  const border = t?.border || '#bae6fd'
  const text = t?.text || '#0f2942'
  const muted = t?.textMuted || '#4a7fa5'

  const [empresasOpts, setEmpresasOpts] = useState([])
  const [pngBusy, setPngBusy] = useState(false)
  const [pngCopied, setPngCopied] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [partQueue, setPartQueue] = useState(null)
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

  useEffect(() => {
    if (!open) {
      setPartQueue(null)
      setAviso(null)
      setPngCopied(false)
    }
  }, [open])

  const logosByEmpresaKey = useMemo(
    () => resolveLogosPorEmpresa({
      empresasOpciones: empresasOpts,
      contrato: contratoMeta,
    }),
    [empresasOpts, contratoMeta],
  )

  const resumen = useMemo(
    () => buildResumenBitacoraCompleto({
      asistencia,
      usos,
      materiales,
      rrhhCatalogo,
      logosByEmpresaKey,
      eventos,
      clima,
      horaInicio,
      cuerpoHtml,
      imagenes,
      elaboradoPor,
    }),
    [
      asistencia, usos, materiales, rrhhCatalogo, logosByEmpresaKey,
      eventos, clima, horaInicio, cuerpoHtml, imagenes, elaboradoPor,
    ],
  )

  const titulo = tituloReportePersonal(fecha)
  const fechaFmt = formatearFechaReportePersonal(fecha)
  const numero = String(contratoMeta?.numero || '').trim()
  const objeto = String(contratoMeta?.objeto || '').trim()
  const proyecto = String(contratoMeta?.contratista || '').trim()
  const vacio = !resumen.hasAnyData
  const clipboardOk = isClipboardImageAvailable()

  const markCopied = useCallback(() => {
    setPngCopied(true)
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setPngCopied(false), 2500)
  }, [])

  const captureNodeBlob = useCallback(async (node) => {
    if (!node) return null
    await waitImages(node)
    const { toBlob } = await import('html-to-image')
    const blob = await toBlob(node, CAPTURE_OPTS)
    if (!blob) throw new Error('No se pudo generar la imagen')
    return blob
  }, [])

  const copiarBlob = useCallback(async (blob) => {
    if (!clipboardOk) {
      throw new Error(
        'Este navegador o dispositivo no permite copiar imágenes al portapapeles. Pruebe en Chrome/Edge de escritorio o pegue desde otra captura.',
      )
    }
    await copyInformePeriodicoBlob(blob)
  }, [clipboardOk])

  const construirPartes = useCallback(async () => {
    const root = captureRef.current
    if (!root) return []
    await waitImages(root)
    const groups = planChunks(root)
    if (groups.length <= 1) {
      const blob = await captureNodeBlob(root)
      return blob ? [blob] : []
    }

    const { toBlob } = await import('html-to-image')
    const blobs = []
    const header = root.querySelector('[data-resumen-header]')
    for (let i = 0; i < groups.length; i += 1) {
      const wrap = document.createElement('div')
      wrap.style.cssText = 'padding:16px;background:#fff;color:#0f2942;width:920px;font-family:system-ui,sans-serif;'
      if (header) wrap.appendChild(header.cloneNode(true))
      const partLabel = document.createElement('div')
      partLabel.style.cssText = 'font-size:11px;color:#64748b;margin:0 0 10px;font-weight:700;'
      partLabel.textContent = `Parte ${i + 1} de ${groups.length}`
      wrap.appendChild(partLabel)
      for (const el of groups[i]) {
        wrap.appendChild(el.cloneNode(true))
      }
      document.body.appendChild(wrap)
      try {
        await waitImages(wrap)
        const blob = await toBlob(wrap, CAPTURE_OPTS)
        if (blob) blobs.push(blob)
      } finally {
        wrap.remove()
      }
    }
    return blobs
  }, [captureNodeBlob])

  const copiarPng = useCallback(async () => {
    setPngBusy(true)
    setPngCopied(false)
    setAviso(null)
    setPartQueue(null)
    try {
      const blobs = await construirPartes()
      if (!blobs.length) return
      await copiarBlob(blobs[0])
      markCopied()
      if (blobs.length > 1) {
        setPartQueue({ blobs, index: 0 })
        setAviso({
          tipo: 'info',
          titulo: 'Resumen en varias partes',
          mensaje: `El resumen es largo: se partió en ${blobs.length} imágenes. La parte 1 ya está en el portapapeles. Puede pegarla ahora y luego copiar la siguiente.`,
        })
      }
    } catch (err) {
      setAviso({
        tipo: 'warn',
        titulo: 'No se pudo copiar el resumen',
        mensaje: err?.message || 'No se pudo copiar la imagen al portapapeles.',
      })
    } finally {
      setPngBusy(false)
    }
  }, [construirPartes, copiarBlob, markCopied])

  const copiarSiguienteParte = useCallback(async () => {
    if (!partQueue) return
    const next = partQueue.index + 1
    if (next >= partQueue.blobs.length) {
      setPartQueue(null)
      setAviso(null)
      return
    }
    setPngBusy(true)
    try {
      await copiarBlob(partQueue.blobs[next])
      markCopied()
      const last = next >= partQueue.blobs.length - 1
      setPartQueue(last ? null : { ...partQueue, index: next })
      setAviso(last
        ? {
          tipo: 'success',
          titulo: 'Partes copiadas',
          mensaje: `Se copió la última parte (${next + 1} de ${partQueue.blobs.length}). Ya puede pegarla.`,
        }
        : {
          tipo: 'info',
          titulo: 'Siguiente parte lista',
          mensaje: `Parte ${next + 1} de ${partQueue.blobs.length} copiada al portapapeles. Péguela y continue con la siguiente si aplica.`,
        })
    } catch (err) {
      setAviso({
        tipo: 'warn',
        titulo: 'No se pudo copiar la parte',
        mensaje: err?.message || 'No se pudo copiar la imagen al portapapeles.',
      })
    } finally {
      setPngBusy(false)
    }
  }, [partQueue, copiarBlob, markCopied])

  if (!open) return null

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
            title="Copia el resumen al portapapeles como imagen PNG"
            aria-label="Copiar imagen PNG"
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

        <div
          ref={captureRef}
          style={{
            padding: 16,
            background: '#fff',
            color: text,
          }}
        >
          <div data-resumen-header>
            <h1 style={{
              margin: '0 0 4px',
              fontSize: 17,
              color: text,
              fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
            }}>
              Resumen de bitácora · {fechaFmt || fecha || '—'}
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
          </div>

          {vacio ? (
            <div
              data-resumen-chunk
              style={{
                padding: 16,
                borderRadius: 10,
                border: `1px dashed ${t?.border || '#cbd5e1'}`,
                color: muted,
                fontSize: 13,
              }}
            >
              No hay información registrada en las secciones de este día.
            </div>
          ) : (
            (resumen.sections || []).map((sec) => renderSeccion(sec, { t, border, text, muted }))
          )}
        </div>
      </div>
    </div>
  )

  const portal = typeof document !== 'undefined'
    ? createPortal(overlay, document.body)
    : overlay

  const haySiguiente = Boolean(partQueue && partQueue.index + 1 < partQueue.blobs.length)

  return (
    <>
      {portal}
      {aviso && createPortal(
        <CcConfirmModal
          theme={t}
          titulo={aviso.titulo}
          tipo={aviso.tipo || 'info'}
          confirmar={haySiguiente ? 'Copiar siguiente parte' : 'Entendido'}
          cancelar={haySiguiente ? 'Cerrar' : undefined}
          soloConfirmar={!haySiguiente}
          zIndex={100090}
          procesando={pngBusy}
          onConfirm={() => {
            if (haySiguiente) {
              void copiarSiguienteParte()
            } else {
              setAviso(null)
              if (!haySiguiente) setPartQueue(null)
            }
          }}
          onCancel={() => {
            setAviso(null)
            setPartQueue(null)
          }}
        >
          <p style={{ margin: 0, lineHeight: 1.45 }}>{aviso.mensaje}</p>
        </CcConfirmModal>,
        document.body,
      )}
    </>
  )
}

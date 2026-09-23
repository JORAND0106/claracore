/**
 * Vista tipo captura: Reporte de personal del día, agrupado por empresa.
 * Impresión / guardar PDF vía ventana de impresión del navegador (no altera el PDF completo).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import { API_BASE } from '../../apiBase'
import {
  buildReportePersonalPorEmpresa,
  formatearFechaReportePersonal,
  resolveLogosPorEmpresa,
  tituloReportePersonal,
} from './bitacoraReportePersonal'

function EmpresaLogo({ url, nombre, t }) {
  const [broken, setBroken] = useState(false)
  if (!url || broken) {
    return (
      <div
        aria-hidden
        title={nombre}
        style={{
          width: 56,
          height: 40,
          borderRadius: 6,
          border: `1px dashed ${t?.border || '#cbd5e1'}`,
          background: t?.inputBg || '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 9,
          fontWeight: 700,
          color: t?.textMuted || '#64748b',
          letterSpacing: '0.04em',
          flexShrink: 0,
        }}
      >
        LOGO
      </div>
    )
  }
  return (
    <img
      src={url}
      alt={`Logo ${nombre}`}
      onError={() => setBroken(true)}
      style={{
        width: 56,
        height: 40,
        objectFit: 'contain',
        borderRadius: 6,
        background: '#fff',
        border: `1px solid ${t?.border || '#e2e8f0'}`,
        flexShrink: 0,
      }}
    />
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
  const printRef = useRef(null)

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

  const bloques = useMemo(
    () => buildReportePersonalPorEmpresa({
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

  const imprimir = () => {
    const node = printRef.current
    if (!node || typeof window === 'undefined') return
    const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700')
    if (!w) return
    const styles = `
      * { box-sizing: border-box; }
      body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        color: #0f2942; background: #fff; padding: 24px; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      .meta { font-size: 12px; color: #4a7fa5; margin-bottom: 16px; line-height: 1.4; }
      .block { border: 1px solid #bae6fd; border-radius: 10px; margin-bottom: 14px; overflow: hidden; }
      .block-h { display: flex; align-items: center; gap: 10px; padding: 10px 12px;
        background: #ddeff8; border-bottom: 1px solid #bae6fd; }
      .block-h img, .block-h .ph { width: 56px; height: 40px; object-fit: contain;
        border-radius: 6px; background: #fff; border: 1px solid #e2e8f0; }
      .block-h .ph { display: flex; align-items: center; justify-content: center;
        font-size: 9px; font-weight: 700; color: #64748b; border-style: dashed; }
      .block-h strong { font-size: 14px; }
      .sec { padding: 8px 12px 10px; }
      .sec h3 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase;
        letter-spacing: 0.04em; color: #4a7fa5; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #e2e8f0; }
      th { color: #4a7fa5; font-weight: 700; font-size: 10px; text-transform: uppercase; }
      .empty { font-size: 12px; color: #94a3b8; padding: 4px 0; }
      @media print { body { padding: 12px; } .block { break-inside: avoid; } }
    `
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${titulo}</title>
      <style>${styles}</style></head><body>${node.innerHTML}</body></html>`)
    w.document.close()
    // Esperar imágenes antes de imprimir
    const imgs = [...w.document.images]
    Promise.all(imgs.map((img) => (
      img.complete ? Promise.resolve() : new Promise((res) => {
        img.onload = img.onerror = () => res()
      })
    ))).then(() => {
      try { w.focus(); w.print() } catch { /* ignore */ }
    })
  }

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
          width: 'min(720px, 100%)',
          maxHeight: '92vh',
          overflow: 'auto',
          background: t?.bgCard || '#fff',
          borderRadius: 16,
          border: `1px solid ${t?.border || '#bae6fd'}`,
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
          <div style={{ fontWeight: 800, color: t?.text || '#0f2942', fontSize: 'var(--cc-title, 15px)' }}>
            {titulo}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={imprimir}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: 'none',
                background: t?.primary || '#0077B6',
                color: '#fff',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
              }}
              title="Abre la impresión del navegador (puede guardar como PDF)"
            >
              Imprimir / PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: `1px solid ${t?.border || '#bae6fd'}`,
                background: t?.inputBg || '#f8fafc',
                color: t?.text || '#0f2942',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Cerrar
            </button>
          </div>
        </div>

        <div ref={printRef} style={{ padding: 14 }}>
          <h1 style={{
            margin: '0 0 4px',
            fontSize: 17,
            color: t?.text || '#0f2942',
          }}>
            Reporte de personal · {fechaFmt || fecha || '—'}
          </h1>
          <div style={{
            fontSize: 12,
            color: t?.textMuted || '#4a7fa5',
            marginBottom: 14,
            lineHeight: 1.4,
          }} className="meta">
            {numero ? <>Contrato {numero}</> : null}
            {numero && (proyecto || objeto) ? ' · ' : null}
            {proyecto || null}
            {proyecto && objeto ? ' — ' : null}
            {objeto || null}
            {!numero && !proyecto && !objeto ? 'Bitácora de obra' : null}
          </div>

          {bloques.length === 0 ? (
            <div style={{
              padding: 16,
              borderRadius: 10,
              border: `1px dashed ${t?.border || '#cbd5e1'}`,
              color: t?.textMuted || '#64748b',
              fontSize: 13,
            }}>
              No hay personal ni maquinaria registrados para este día.
            </div>
          ) : bloques.map((bloque) => (
            <div
              key={bloque.empresa_key}
              className="block"
              style={{
                border: `1px solid ${t?.border || '#bae6fd'}`,
                borderRadius: 10,
                marginBottom: 12,
                overflow: 'hidden',
                background: t?.bgCard || '#fff',
              }}
            >
              <div
                className="block-h"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  background: t?.primary ? `${t.primary}14` : '#ddeff8',
                  borderBottom: `1px solid ${t?.border || '#bae6fd'}`,
                }}
              >
                <EmpresaLogo url={bloque.logo_url} nombre={bloque.empresa} t={t} />
                <strong style={{ color: t?.text || '#0f2942', fontSize: 14 }}>
                  {bloque.empresa}
                </strong>
              </div>
              <div className="sec" style={{ padding: '8px 12px 10px' }}>
                <h3 style={{
                  margin: '0 0 6px',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: t?.textMuted || '#4a7fa5',
                }}>
                  Personal en obra
                </h3>
                {bloque.personal.length === 0 ? (
                  <div className="empty" style={{ fontSize: 12, color: t?.textMuted || '#94a3b8' }}>
                    Sin personal de esta empresa
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '4px 6px', color: t?.textMuted || '#4a7fa5' }}>Nombre</th>
                        <th style={{ textAlign: 'left', padding: '4px 6px', color: t?.textMuted || '#4a7fa5' }}>Cargo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bloque.personal.map((p, i) => (
                        <tr key={`p-${bloque.empresa_key}-${i}`}>
                          <td style={{ padding: '4px 6px', borderBottom: `1px solid ${t?.border || '#e2e8f0'}`, color: t?.text }}>
                            {p.nombre}
                          </td>
                          <td style={{ padding: '4px 6px', borderBottom: `1px solid ${t?.border || '#e2e8f0'}`, color: t?.text }}>
                            {p.cargo || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <h3 style={{
                  margin: '12px 0 6px',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: t?.textMuted || '#4a7fa5',
                }}>
                  Maquinaria / equipos
                </h3>
                {bloque.maquinaria.length === 0 ? (
                  <div className="empty" style={{ fontSize: 12, color: t?.textMuted || '#94a3b8' }}>
                    Sin maquinaria con operador de esta empresa
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '4px 6px', color: t?.textMuted || '#4a7fa5' }}>Equipo</th>
                        <th style={{ textAlign: 'left', padding: '4px 6px', color: t?.textMuted || '#4a7fa5' }}>Operador</th>
                        <th style={{ textAlign: 'left', padding: '4px 6px', color: t?.textMuted || '#4a7fa5' }}>Cant.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bloque.maquinaria.map((m, i) => (
                        <tr key={`m-${bloque.empresa_key}-${i}`}>
                          <td style={{ padding: '4px 6px', borderBottom: `1px solid ${t?.border || '#e2e8f0'}`, color: t?.text }}>
                            {m.equipo}
                          </td>
                          <td style={{ padding: '4px 6px', borderBottom: `1px solid ${t?.border || '#e2e8f0'}`, color: t?.text }}>
                            {m.operador}
                          </td>
                          <td style={{ padding: '4px 6px', borderBottom: `1px solid ${t?.border || '#e2e8f0'}`, color: t?.text }}>
                            {m.cantidad === '' ? '—' : m.cantidad}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined'
    ? createPortal(overlay, document.body)
    : overlay
}

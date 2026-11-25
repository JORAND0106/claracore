/**
 * Popup institucional: informe de horas extras con grilla previa y descarga PDF/Word.
 * Abierto desde la barra principal de Seguimiento (no desde cada día).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, X } from 'lucide-react'
import CcConfirmModal from '../../components/CcConfirmModal'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || 'horas_extra.pdf'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

function defaultRango() {
  const hoy = new Date()
  const hasta = hoy.toISOString().slice(0, 10)
  const desdeDate = new Date(hoy)
  desdeDate.setDate(desdeDate.getDate() - 14)
  const desde = desdeDate.toISOString().slice(0, 10)
  return { desde, hasta }
}

function fmtExtra(n) {
  const v = Number(n)
  if (!Number.isFinite(v) || v <= 0) return ''
  return v.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

const HEADERS_HE = [
  'No',
  'Nombre colaborador',
  'No. Documento',
  'Fecha',
  'Hora inicio',
  'Hora fin',
  'Extra diurna',
  'Extra nocturna',
  'Extra festiva diurna',
  'Extra festiva nocturna',
  'Total tiempo extra',
  'Observación',
]

export default function BitacoraHorasExtraExportModal({
  open = false,
  onClose,
  t,
  api,
  usuario = null,
  initialDesde = '',
  initialHasta = '',
}) {
  const defaults = useMemo(() => defaultRango(), [])
  const [fechaDesde, setFechaDesde] = useState(() => String(initialDesde || defaults.desde).slice(0, 10))
  const [fechaHasta, setFechaHasta] = useState(() => String(initialHasta || defaults.hasta).slice(0, 10))
  const [empresaKey, setEmpresaKey] = useState('')
  const [responsableId, setResponsableId] = useState('')
  const [elaboradorId, setElaboradorId] = useState('')
  const [aprobadorId, setAprobadorId] = useState('')
  const [formato, setFormato] = useState('pdf')
  const [empresas, setEmpresas] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [filas, setFilas] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [aviso, setAviso] = useState(null)

  const border = t?.border || '#e2e8f0'
  const text = t?.text || '#0f172a'
  const muted = t?.textMuted || '#64748b'
  const inputBg = t?.inputBg || '#f8fafc'
  const primary = t?.primary || '#0077B6'
  const bgCard = t?.bgCard || '#fff'
  const headBg = t?.primary
    ? `color-mix(in srgb, ${primary} 18%, ${bgCard})`
    : '#e2e8f0'

  useEffect(() => {
    if (!open) return
    const uid = usuario?.id != null ? String(usuario.id) : ''
    if (uid) setElaboradorId((prev) => prev || uid)
  }, [open, usuario?.id])

  // Carga empresas/usuarios/filas al cambiar periodo o empresa
  useEffect(() => {
    if (!open) return undefined
    if (!api?.opcionesBitacoraHorasExtra) return undefined
    const d0 = String(fechaDesde || '').slice(0, 10)
    const d1 = String(fechaHasta || '').slice(0, 10)
    if (!d0 || !d1 || d1 < d0) {
      setFilas([])
      return undefined
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const data = await api.opcionesBitacoraHorasExtra(d0, d1, empresaKey || undefined)
        if (cancelled) return
        const emps = Array.isArray(data?.empresas) ? data.empresas : []
        const us = Array.isArray(data?.usuarios) ? data.usuarios : []
        setEmpresas(emps)
        setUsuarios(us)
        setEmpresaKey((prev) => {
          if (prev && emps.some((e) => e.key === prev)) return prev
          return emps[0]?.key || ''
        })
        setResponsableId((prev) => {
          if (prev && us.some((u) => String(u.id) === String(prev))) return prev
          return us[0]?.id != null ? String(us[0].id) : ''
        })
        setAprobadorId((prev) => {
          if (prev && us.some((u) => String(u.id) === String(prev))) return prev
          return prev || ''
        })
        setElaboradorId((prev) => {
          if (prev && us.some((u) => String(u.id) === String(prev))) return prev
          const uid = usuario?.id
          if (uid != null && us.some((u) => String(u.id) === String(uid))) return String(uid)
          return us[0]?.id != null ? String(us[0].id) : ''
        })
        // Filas solo vienen cuando la petición incluyó empresa.
        if (empresaKey) {
          setFilas(Array.isArray(data?.filas) ? data.filas : [])
        } else {
          setFilas([])
        }
      } catch (e) {
        if (!cancelled) {
          setFilas([])
          setAviso({
            titulo: 'No se pudieron cargar datos',
            mensaje: e?.message || 'Intente de nuevo en unos momentos.',
          })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, api, fechaDesde, fechaHasta, empresaKey, usuario?.id])

  const tieneDetalle = filas.some((r) => !r?.tipo || r.tipo === 'detalle')
  const puedeDescargar = tieneDetalle && !!empresaKey && !loading && !busy
  const ncolsHe = HEADERS_HE.length

  const exportar = useCallback(async () => {
    if (!puedeDescargar || !api?.exportBitacoraHorasExtraBlob) return
    const d0 = String(fechaDesde || '').slice(0, 10)
    const d1 = String(fechaHasta || '').slice(0, 10)
    setBusy(true)
    setAviso(null)
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
    try {
      const { blob, filename } = await api.exportBitacoraHorasExtraBlob({
        fechaDesde: d0,
        fechaHasta: d1,
        empresa: empresaKey,
        formato,
        responsableId: responsableId || undefined,
        elaboradorId: elaboradorId || undefined,
        aprobadorId: aprobadorId || undefined,
      })
      triggerDownload(blob, filename)
      const ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)
      console.info('[Bitácora] Informe horas extras OK', ms, 'ms', 'filas', filas.length)
      onClose?.()
    } catch (e) {
      const msg = e?.message || 'No se pudo generar el informe.'
      setAviso({
        titulo: 'No se pudo descargar',
        mensaje: msg,
      })
    } finally {
      setBusy(false)
    }
  }, [
    puedeDescargar, api, fechaDesde, fechaHasta, empresaKey, formato,
    responsableId, elaboradorId, aprobadorId, onClose, filas.length,
  ])

  if (!open) return null

  const field = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '7px 9px',
    borderRadius: 8,
    border: `1px solid ${border}`,
    background: inputBg,
    color: text,
    fontSize: 'var(--cc-sm, 13px)',
  }
  const label = {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    fontSize: 11,
    fontWeight: 700,
    color: muted,
    minWidth: 0,
  }
  const iconBtn = (enabled) => ({
    width: 36,
    height: 36,
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    border: `1px solid ${enabled ? primary : border}`,
    background: enabled ? primary : inputBg,
    color: enabled ? '#fff' : muted,
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.55,
  })

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Informe de horas extras"
      data-testid="bitacora-horas-extra-modal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100080,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(980px, 100%)',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          background: bgCard,
          borderRadius: 16,
          border: `1px solid ${border}`,
          boxShadow: '0 24px 80px rgba(0,0,0,0.28)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <CcModalBrandHeader theme={t} />
        <div style={{ padding: '10px 14px 6px', flex: '0 0 auto' }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 'var(--cc-title, 16px)', color: text }}>
            Informe de horas extras
          </h2>

          {/* Parte superior: Empresa | Desde | Hasta */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <label style={{ ...label, flex: '1 1 160px' }}>
              Empresa
              <select
                value={empresaKey}
                onChange={(e) => setEmpresaKey(e.target.value)}
                style={field}
                disabled={loading || busy}
                aria-label="Empresa tiempo extra"
              >
                {!empresas.length ? (
                  <option value="">Sin empresas con personal en el periodo</option>
                ) : null}
                {empresas.map((e) => (
                  <option key={e.key} value={e.key}>{e.nombre}</option>
                ))}
              </select>
            </label>
            <label style={{ ...label, flex: '1 1 120px' }}>
              Fecha de inicio
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                style={field}
                aria-label="Fecha inicio periodo horas extras"
              />
            </label>
            <label style={{ ...label, flex: '1 1 120px' }}>
              Fecha de fin
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                style={field}
                aria-label="Fecha fin periodo horas extras"
              />
            </label>
          </div>

          {/* Firmantes + formato en una línea compacta */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginTop: 8,
            }}
          >
            <label style={{ ...label, flex: '1 1 140px' }}>
              Responsable de obra
              <select
                value={responsableId}
                onChange={(e) => setResponsableId(e.target.value)}
                style={field}
                disabled={loading || busy}
              >
                <option value="">—</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}{u.cargo ? ` · ${u.cargo}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ ...label, flex: '1 1 140px' }}>
              Elaborador
              <select
                value={elaboradorId}
                onChange={(e) => setElaboradorId(e.target.value)}
                style={field}
                disabled={loading || busy}
              >
                <option value="">—</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}{u.cargo ? ` · ${u.cargo}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ ...label, flex: '1 1 140px' }}>
              Aprobador
              <select
                value={aprobadorId}
                onChange={(e) => setAprobadorId(e.target.value)}
                style={field}
                disabled={loading || busy}
              >
                <option value="">—</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}{u.cargo ? ` · ${u.cargo}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ ...label, flex: '0 1 110px' }}>
              Formato
              <select
                value={formato}
                onChange={(e) => setFormato(e.target.value)}
                style={field}
                disabled={busy}
                aria-label="Formato de descarga"
              >
                <option value="pdf">PDF</option>
                <option value="docx">Word</option>
              </select>
            </label>
          </div>
        </div>

        {/* Parte central: grilla */}
        <div
          style={{
            flex: '1 1 auto',
            minHeight: 180,
            maxHeight: 'min(52vh, 420px)',
            overflow: 'auto',
            margin: '4px 14px 0',
            border: `1px solid ${border}`,
            borderRadius: 10,
            background: bgCard,
          }}
        >
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: muted, fontSize: 13 }}>
              Cargando horas extras…
            </div>
          ) : !filas.length ? (
            <div
              role="status"
              style={{ padding: 24, textAlign: 'center', color: muted, fontSize: 13, lineHeight: 1.45 }}
            >
              No hay horas extras para la empresa y el periodo elegidos.
            </div>
          ) : (
            <table
              data-testid="bitacora-horas-extra-grid"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                /* −1.5 pt ≈ −2 px respecto a 12 px base */
                fontSize: 'calc(var(--cc-sm, 12px) - 2px)',
                color: text,
                lineHeight: 1.2,
              }}
            >
              <thead>
                <tr>
                  {HEADERS_HE.map((h) => (
                    <th
                      key={h}
                      style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 1,
                        background: headBg,
                        border: `1px solid ${border}`,
                        padding: '3px 4px',
                        textAlign: 'left',
                        fontWeight: 800,
                        whiteSpace: 'nowrap',
                        fontSize: 'calc(var(--cc-sm, 12px) - 3px)',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((r, i) => {
                  const tipo = r.tipo || 'detalle'
                  const isEmp = tipo === 'empresa'
                  const isSub = tipo === 'subtotal'
                  const isSubEmp = tipo === 'subtotal_empresa'
                  const isTot = tipo === 'total'
                  const rowBg = isTot || isEmp
                    ? primary
                    : (isSub || isSubEmp)
                      ? headBg
                      : (i % 2 ? 'transparent' : (t?.bg || 'transparent'))
                  const rowColor = (isTot || isEmp) ? '#fff' : text
                  const cell = {
                    border: `1px solid ${border}`,
                    padding: '2px 4px',
                    fontWeight: (isSub || isSubEmp || isTot || isEmp) ? 800 : 400,
                    color: rowColor,
                    background: rowBg,
                    whiteSpace: 'nowrap',
                  }
                  if (isEmp) {
                    return (
                      <tr key={`empresa-${r.nombre}-${i}`}>
                        <td colSpan={ncolsHe} style={{ ...cell, whiteSpace: 'normal' }}>
                          {r.nombre || 'Sin empresa'}
                        </td>
                      </tr>
                    )
                  }
                  const nombreLbl = isSub
                    ? `Subtotal · ${r.nombre || ''}`
                    : isSubEmp
                      ? `Subtotal empresa · ${r.nombre || ''}`
                      : isTot
                        ? 'Total general'
                        : r.nombre
                  const hideMeta = isSub || isSubEmp || isTot
                  return (
                    <tr key={`${tipo}-${r.fecha}-${r.documento}-${r.nombre}-${i}`}>
                      <td style={cell}>{hideMeta ? '' : (r.no ?? '')}</td>
                      <td style={{ ...cell, whiteSpace: 'normal' }}>{nombreLbl}</td>
                      <td style={cell}>{isTot || isSubEmp ? '' : (r.documento || '')}</td>
                      <td style={cell}>{hideMeta ? '' : r.fecha}</td>
                      <td style={cell}>{hideMeta ? '' : r.hora_inicio}</td>
                      <td style={cell}>{hideMeta ? '' : r.hora_fin}</td>
                      <td style={cell}>{fmtExtra(r.extra_diurna)}</td>
                      <td style={cell}>{fmtExtra(r.extra_nocturna)}</td>
                      <td style={cell}>{fmtExtra(r.extra_festiva_diurna)}</td>
                      <td style={cell}>{fmtExtra(r.extra_festiva_nocturna)}</td>
                      <td style={{ ...cell, fontWeight: 800 }}>{fmtExtra(r.tiempo_extra)}</td>
                      <td style={{ ...cell, whiteSpace: 'normal' }}>{hideMeta ? '' : (r.observacion || '—')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pie: descargar | cancelar */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            alignItems: 'center',
            padding: '12px 14px 14px',
            flex: '0 0 auto',
          }}
        >
          <button
            type="button"
            onClick={() => void exportar()}
            disabled={!puedeDescargar}
            style={iconBtn(puedeDescargar)}
            title={puedeDescargar ? (busy ? 'Generando…' : `Descargar ${formato === 'docx' ? 'Word' : 'PDF'}`) : 'Sin filas para descargar'}
            aria-label={puedeDescargar ? 'Descargar informe' : 'Descarga inactiva'}
            data-testid="bitacora-horas-extra-download"
          >
            <Download size={18} strokeWidth={2.3} aria-hidden />
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              ...iconBtn(true),
              background: inputBg,
              color: text,
              border: `1px solid ${border}`,
            }}
            title="Cancelar"
            aria-label="Cancelar"
          >
            <X size={18} strokeWidth={2.3} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay}
      {aviso && createPortal(
        <CcConfirmModal
          theme={t}
          tipo="info"
          titulo={aviso.titulo}
          confirmar="Entendido"
          soloConfirmar
          zIndex={100090}
          onConfirm={() => setAviso(null)}
          onCancel={() => setAviso(null)}
        >
          <p style={{ margin: 0, lineHeight: 1.45 }}>{aviso.mensaje}</p>
        </CcConfirmModal>,
        document.body,
      )}
    </>
  )
}

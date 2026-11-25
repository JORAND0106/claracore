/**
 * Popup: informe consolidado de asistencia de personal o presencia de maquinaria.
 * Misma barra de Seguimiento / permiso exportar que horas extras.
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
  a.download = filename || 'informe.pdf'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

function defaultRango() {
  const hoy = new Date()
  const hasta = hoy.toISOString().slice(0, 10)
  const desdeDate = new Date(hoy)
  desdeDate.setDate(1) // mes en curso
  const desde = desdeDate.toISOString().slice(0, 10)
  return { desde, hasta }
}

const TITULOS = {
  personal: 'Informe de asistencia de personal',
  maquinaria: 'Informe de presencia de maquinaria',
}

const VACIO = {
  personal: 'No hay asistencia para la empresa y el periodo elegidos.',
  maquinaria: 'No hay maquinaria reportada para la empresa y el periodo elegidos.',
}

export default function BitacoraPresenciaExportModal({
  open = false,
  onClose,
  t,
  api,
  tipo = 'personal', // personal | maquinaria
  initialDesde = '',
  initialHasta = '',
}) {
  const tipoL = tipo === 'maquinaria' ? 'maquinaria' : 'personal'
  const defaults = useMemo(() => defaultRango(), [])
  const [fechaDesde, setFechaDesde] = useState(() => String(initialDesde || defaults.desde).slice(0, 10))
  const [fechaHasta, setFechaHasta] = useState(() => String(initialHasta || defaults.hasta).slice(0, 10))
  const [empresaKey, setEmpresaKey] = useState('')
  const [formato, setFormato] = useState('pdf')
  const [empresas, setEmpresas] = useState([])
  const [dias, setDias] = useState([])
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
  const festBg = 'color-mix(in srgb, #ea580c 22%, #fff7ed)'

  useEffect(() => {
    if (!open) return undefined
    if (!api?.opcionesBitacoraPresencia) return undefined
    const d0 = String(fechaDesde || '').slice(0, 10)
    const d1 = String(fechaHasta || '').slice(0, 10)
    if (!d0 || !d1 || d1 < d0) {
      setFilas([])
      setDias([])
      return undefined
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const data = await api.opcionesBitacoraPresencia({
          tipo: tipoL,
          fechaDesde: d0,
          fechaHasta: d1,
          empresa: empresaKey || undefined,
        })
        if (cancelled) return
        const emps = Array.isArray(data?.empresas) ? data.empresas : []
        setEmpresas(emps)
        setEmpresaKey((prev) => {
          if (prev && emps.some((e) => e.key === prev)) return prev
          return emps[0]?.key || ''
        })
        setDias(Array.isArray(data?.dias) ? data.dias : [])
        if (empresaKey) {
          setFilas(Array.isArray(data?.filas) ? data.filas : [])
        } else {
          setFilas([])
        }
      } catch (e) {
        if (!cancelled) {
          setFilas([])
          setDias([])
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
  }, [open, api, fechaDesde, fechaHasta, empresaKey, tipoL])

  const tieneFilas = filas.length > 0
  const puedeDescargar = tieneFilas && !!empresaKey && !loading && !busy

  const exportar = useCallback(async () => {
    if (!puedeDescargar || !api?.exportBitacoraPresenciaBlob) return
    const d0 = String(fechaDesde || '').slice(0, 10)
    const d1 = String(fechaHasta || '').slice(0, 10)
    setBusy(true)
    setAviso(null)
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
    try {
      const { blob, filename } = await api.exportBitacoraPresenciaBlob({
        tipo: tipoL,
        fechaDesde: d0,
        fechaHasta: d1,
        empresa: empresaKey,
        formato,
      })
      triggerDownload(blob, filename)
      const ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)
      console.info('[Bitácora] Informe presencia OK', tipoL, ms, 'ms', 'filas', filas.length)
      onClose?.()
    } catch (e) {
      setAviso({
        titulo: 'No se pudo descargar',
        mensaje: e?.message || 'No se pudo generar el informe.',
      })
    } finally {
      setBusy(false)
    }
  }, [puedeDescargar, api, fechaDesde, fechaHasta, empresaKey, formato, tipoL, filas.length, onClose])

  if (!open) return null

  const field = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    borderRadius: 8,
    border: `1px solid ${border}`,
    background: inputBg,
    color: text,
    fontSize: 'var(--cc-sm, 13px)',
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
    background: enabled ? primary : (t?.bg || '#f1f5f9'),
    color: enabled ? '#fff' : muted,
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.55,
  })

  const esPersonal = tipoL === 'personal'
  const testId = esPersonal ? 'bitacora-asistencia-modal' : 'bitacora-maquinaria-presencia-modal'

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={TITULOS[tipoL]}
      data-testid={testId}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 12000,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose?.() }}
    >
      <div
        style={{
          width: 'min(1100px, 100%)',
          maxHeight: '92vh',
          background: bgCard,
          borderRadius: 14,
          border: `1px solid ${border}`,
          boxShadow: '0 24px 60px rgba(15,23,42,0.28)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <CcModalBrandHeader theme={t} />
        <div style={{ padding: '10px 14px 6px', flex: '0 0 auto' }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 'var(--cc-title, 16px)', color: text }}>
            {TITULOS[tipoL]}
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 10,
          }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: muted }}>
              Empresa
              <select
                value={empresaKey}
                onChange={(e) => setEmpresaKey(e.target.value)}
                style={field}
                aria-label="Empresa informe presencia"
                data-testid="bitacora-presencia-empresa"
              >
                {!empresas.length ? <option value="">Sin empresas</option> : null}
                {empresas.map((e) => (
                  <option key={e.key} value={e.key}>{e.nombre}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: muted }}>
              Fecha de inicio
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                style={field}
                aria-label="Fecha inicio"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: muted }}>
              Fecha de fin
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                style={field}
                aria-label="Fecha fin"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: muted }}>
              Formato
              <select
                value={formato}
                onChange={(e) => setFormato(e.target.value)}
                style={field}
                aria-label="Formato descarga"
              >
                <option value="pdf">PDF</option>
                <option value="docx">Word</option>
              </select>
            </label>
          </div>
        </div>

        <div style={{
          flex: '1 1 auto',
          overflow: 'auto',
          padding: 10,
          minHeight: 180,
        }}>
          {loading ? (
            <div style={{ color: muted, padding: 16 }}>Cargando…</div>
          ) : !tieneFilas ? (
            <div
              style={{ color: muted, padding: 16, fontSize: 'var(--cc-sm, 13px)' }}
              data-testid="bitacora-presencia-vacio"
            >
              {VACIO[tipoL]}
            </div>
          ) : (
            <table
              data-testid="bitacora-presencia-grid"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 'calc(var(--cc-sm, 12px) - 3px)',
                color: text,
                lineHeight: 1.15,
              }}
            >
              <thead>
                <tr>
                  {(esPersonal
                    ? ['No', 'Nombre', 'Documento', 'Cargo']
                    : ['No', 'Equipo o máquina', 'Placa o identificación', 'Tipo']
                  ).map((h) => (
                    <th
                      key={h}
                      style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 2,
                        background: headBg,
                        border: `1px solid ${border}`,
                        padding: '3px 4px',
                        textAlign: 'left',
                        fontWeight: 800,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                  {dias.map((d) => (
                    <th
                      key={d.iso}
                      title={d.especial ? 'Domingo o festivo' : d.iso}
                      style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 2,
                        background: d.especial ? festBg : headBg,
                        border: `1px solid ${border}`,
                        padding: '2px 2px',
                        textAlign: 'center',
                        fontWeight: 800,
                        minWidth: 22,
                      }}
                    >
                      {d.label || `${d.dia}${d.inicial}`}
                    </th>
                  ))}
                  <th
                    style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 2,
                      background: headBg,
                      border: `1px solid ${border}`,
                      padding: '3px 4px',
                      textAlign: 'center',
                      fontWeight: 800,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.map((r, i) => {
                  const rowBg = i % 2 ? 'transparent' : (t?.bg || 'transparent')
                  const cell = {
                    border: `1px solid ${border}`,
                    padding: '2px 4px',
                    background: rowBg,
                  }
                  return (
                    <tr key={`${r.no}-${r.nombre}-${i}`}>
                      <td style={cell}>{r.no}</td>
                      <td style={cell}>{r.nombre}</td>
                      <td style={cell}>{esPersonal ? r.documento : r.identificacion}</td>
                      <td style={cell}>{esPersonal ? r.cargo : r.tipo}</td>
                      {(r.marcas || []).map((m, di) => (
                        <td
                          key={`${r.no}-${di}`}
                          style={{
                            ...cell,
                            textAlign: 'center',
                            fontWeight: 800,
                            background: dias[di]?.especial ? festBg : rowBg,
                          }}
                        >
                          {m || ''}
                        </td>
                      ))}
                      <td style={{ ...cell, textAlign: 'center', fontWeight: 800 }}>{r.total}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end',
          alignItems: 'center',
          padding: '12px 14px 14px',
          flex: '0 0 auto',
        }}>
          <button
            type="button"
            onClick={() => void exportar()}
            disabled={!puedeDescargar}
            style={iconBtn(puedeDescargar)}
            title={puedeDescargar ? (busy ? 'Generando…' : `Descargar ${formato === 'docx' ? 'Word' : 'PDF'}`) : 'Sin filas para descargar'}
            aria-label={puedeDescargar ? 'Descargar informe' : 'Descarga inactiva'}
            data-testid="bitacora-presencia-download"
          >
            <Download size={18} strokeWidth={2.3} aria-hidden />
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              ...iconBtn(true),
              background: 'transparent',
              color: text,
              border: `1px solid ${border}`,
            }}
            aria-label="Cancelar"
          >
            <X size={18} strokeWidth={2.3} aria-hidden />
          </button>
        </div>
      </div>

      {aviso ? (
        <CcConfirmModal
          t={t}
          open
          title={aviso.titulo}
          message={aviso.mensaje}
          confirmLabel="Entendido"
          onConfirm={() => setAviso(null)}
          onCancel={() => setAviso(null)}
        />
      ) : null}
    </div>
  )

  return createPortal(modal, document.body)
}

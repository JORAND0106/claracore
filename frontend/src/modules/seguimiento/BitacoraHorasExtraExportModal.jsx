/**
 * Popup institucional: configurar e exportar informe de horas extras (PDF/Word).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
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
  const [loadingOpts, setLoadingOpts] = useState(false)
  const [busy, setBusy] = useState(false)
  const [aviso, setAviso] = useState(null)

  const border = t?.border || '#e2e8f0'
  const text = t?.text || '#0f172a'
  const muted = t?.textMuted || '#64748b'
  const inputBg = t?.inputBg || '#f8fafc'
  const primary = t?.primary || '#0077B6'

  // Preseleccionar elaborador = usuario actual
  useEffect(() => {
    if (!open) return
    const uid = usuario?.id != null ? String(usuario.id) : ''
    if (uid) setElaboradorId((prev) => prev || uid)
  }, [open, usuario?.id])

  useEffect(() => {
    if (!open) return undefined
    if (!api?.opcionesBitacoraHorasExtra) return undefined
    const d0 = String(fechaDesde || '').slice(0, 10)
    const d1 = String(fechaHasta || '').slice(0, 10)
    if (!d0 || !d1 || d1 < d0) return undefined
    let cancelled = false
    setLoadingOpts(true)
    ;(async () => {
      try {
        const data = await api.opcionesBitacoraHorasExtra(d0, d1)
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
          return ''
        })
        setElaboradorId((prev) => {
          if (prev && us.some((u) => String(u.id) === String(prev))) return prev
          const uid = usuario?.id
          if (uid != null && us.some((u) => String(u.id) === String(uid))) return String(uid)
          return us[0]?.id != null ? String(us[0].id) : ''
        })
      } catch (e) {
        if (!cancelled) {
          setAviso({
            titulo: 'No se pudieron cargar opciones',
            mensaje: e?.message || 'Intente de nuevo en unos momentos.',
          })
        }
      } finally {
        if (!cancelled) setLoadingOpts(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, api, fechaDesde, fechaHasta, usuario?.id])

  const exportar = useCallback(async () => {
    if (!api?.exportBitacoraHorasExtraBlob) {
      setAviso({
        titulo: 'Exportación no disponible',
        mensaje: 'La exportación de horas extras no está disponible en esta sesión.',
      })
      return
    }
    const d0 = String(fechaDesde || '').slice(0, 10)
    const d1 = String(fechaHasta || '').slice(0, 10)
    if (!d0 || !d1) {
      setAviso({ titulo: 'Fechas incompletas', mensaje: 'Indique el rango de fechas del informe.' })
      return
    }
    if (d1 < d0) {
      setAviso({ titulo: 'Rango inválido', mensaje: 'La fecha Hasta debe ser posterior o igual a Desde.' })
      return
    }
    if (!empresaKey) {
      setAviso({
        titulo: 'Empresa requerida',
        mensaje: 'Seleccione la empresa a la cual se genera el tiempo extra.',
      })
      return
    }
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
      if (ms > 15000) {
        // Evidencia de rendimiento: si tarda, al menos no se queda colgado (busy se limpia).
        console.info('[Bitácora] Informe horas extras generado en', ms, 'ms')
      } else {
        console.info('[Bitácora] Informe horas extras OK', ms, 'ms')
      }
      onClose?.()
    } catch (e) {
      const msg = e?.message || 'No se pudo generar el informe.'
      setAviso({
        titulo: 'Sin tiempo extra',
        mensaje: /tiempo extra|empresa|rango/i.test(msg)
          ? msg
          : 'No hay tiempo extra para el rango y la empresa seleccionados, o la descarga falló.',
      })
    } finally {
      setBusy(false)
    }
  }, [
    api, fechaDesde, fechaHasta, empresaKey, formato,
    responsableId, elaboradorId, aprobadorId, onClose,
  ])

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
  const label = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 12,
    fontWeight: 700,
    color: muted,
  }

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Informe de horas extras"
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
          width: 'min(560px, 100%)',
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
        <div style={{ padding: '14px 18px 18px' }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 17, color: text }}>
            Informe de horas extras
          </h2>
          <p style={{ margin: '0 0 14px', fontSize: 12, color: muted, lineHeight: 1.4 }}>
            Configure el rango, la empresa y los firmantes. Solo se incluyen trabajadores
            con tiempo extra en el periodo.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={label}>
              Desde
              <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} style={field} />
            </label>
            <label style={label}>
              Hasta
              <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} style={field} />
            </label>
          </div>

          <label style={{ ...label, marginTop: 10 }}>
            Empresa (tiempo extra)
            <select
              value={empresaKey}
              onChange={(e) => setEmpresaKey(e.target.value)}
              style={field}
              disabled={loadingOpts || busy}
            >
              {!empresas.length ? (
                <option value="">Sin empresas con personal en el rango</option>
              ) : null}
              {empresas.map((e) => (
                <option key={e.key} value={e.key}>{e.nombre}</option>
              ))}
            </select>
          </label>

          <label style={{ ...label, marginTop: 10 }}>
            Responsable de obra
            <select
              value={responsableId}
              onChange={(e) => setResponsableId(e.target.value)}
              style={field}
              disabled={loadingOpts || busy}
            >
              <option value="">— Seleccione —</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}{u.cargo ? ` · ${u.cargo}` : ''}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <label style={label}>
              Elaborador
              <select
                value={elaboradorId}
                onChange={(e) => setElaboradorId(e.target.value)}
                style={field}
                disabled={loadingOpts || busy}
              >
                <option value="">— Seleccione —</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}{u.cargo ? ` · ${u.cargo}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label style={label}>
              Aprobador
              <select
                value={aprobadorId}
                onChange={(e) => setAprobadorId(e.target.value)}
                style={field}
                disabled={loadingOpts || busy}
              >
                <option value="">— Seleccione —</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}{u.cargo ? ` · ${u.cargo}` : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label style={{ ...label, marginTop: 10 }}>
            Formato
            <select value={formato} onChange={(e) => setFormato(e.target.value)} style={field} disabled={busy}>
              <option value="pdf">PDF</option>
              <option value="docx">Word (.docx)</option>
            </select>
          </label>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: `1px solid ${border}`,
                background: inputBg,
                color: text,
                fontWeight: 700,
                cursor: busy ? 'wait' : 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void exportar()}
              disabled={busy || loadingOpts || !empresaKey}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: 'none',
                background: primary,
                color: '#fff',
                fontWeight: 700,
                cursor: busy || loadingOpts || !empresaKey ? 'not-allowed' : 'pointer',
                opacity: busy || loadingOpts || !empresaKey ? 0.65 : 1,
              }}
            >
              {busy ? 'Generando…' : (loadingOpts ? 'Cargando…' : 'Exportar')}
            </button>
          </div>
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

import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatCOP } from '../../utils/formatCOP'
import { downloadPresupuestoInformeExcel } from './presupuestoExportExcel'
import PptoVersionCompareModal from './PptoVersionCompareModal'
import {
  esDesarrolladorPresupuesto,
  esRolContratistaDepuracion,
  esRolInterventoriaValidacion,
} from './pptoRolesValidacion'

const PPTO_TIPO = 'Presupuesto de Obra'

/** Estado del ciclo de aprobación (doble llave) → etiqueta y colores. */
function estadoMeta(v) {
  const e = v?.estado || (v?.es_vigente ? 'borrador' : 'aprobado_sellado')
  switch (e) {
    case 'enviado_interventoria':
      return { key: e, label: 'En revisión (interventoría)', color: '#B45309', bg: '#F59E0B1A' }
    case 'aprobado_sellado':
      return { key: e, label: 'Aprobada y sellada', color: '#15803D', bg: '#16A34A1A' }
    case 'rechazado':
      return { key: e, label: 'Rechazada (devuelta)', color: '#B91C1C', bg: '#DC262614' }
    case 'borrador':
    default:
      return { key: 'borrador', label: 'Borrador', color: '#2563EB', bg: '#2563EB14' }
  }
}

/**
 * Token fresco desde almacenamiento. El prop `token` se captura una sola vez en el
 * render y queda obsoleto cuando /auth/refresh renueva el JWT en localStorage; usar
 * siempre el almacenado evita el error "Token inválido" en restaurar/eliminar/crear.
 */
function tokenFresco(fallback) {
  if (typeof window === 'undefined') return fallback
  return (
    window.localStorage?.getItem('cc_token') ||
    window.sessionStorage?.getItem('cc_token') ||
    fallback
  )
}

function fmtFecha(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('es-CO', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return String(iso)
  }
}

function overlayStyle(z = 10000) {
  return {
    position: 'fixed',
    inset: 0,
    zIndex: z,
    background: 'rgba(0,0,0,0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  }
}

function headerDark(t) {
  return {
    padding: '16px 20px',
    borderBottom: `1px solid ${t.border}`,
    background: '#0F1923',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  }
}

/**
 * Modales y panel lateral del versionador de presupuesto (solo Presupuesto de Obra).
 */
export default function PptoVersionador({
  t,
  token,
  API,
  contratoId,
  usuario,
  versionesPresupuesto = [],
  versionVigente = null,
  createOpen,
  onCreateOpenChange,
  panelOpen,
  onPanelOpenChange,
  onVersionesReload,
  versionActiva = null,
  onTrabajarEnVersion,
}) {
  const authToken = useCallback(() => tokenFresco(token), [token])

  const esDev = useMemo(() => esDesarrolladorPresupuesto(usuario), [usuario])
  const esInterventoria = useMemo(
    () => esDev || esRolInterventoriaValidacion(usuario),
    [esDev, usuario],
  )
  const esContratista = useMemo(
    () => esDev || esRolContratistaDepuracion(usuario),
    [esDev, usuario],
  )

  const esPrimeraVersion = versionesPresupuesto.length === 0
  const siguienteNumero = useMemo(() => {
    const max = versionesPresupuesto.reduce((m, v) => Math.max(m, Number(v.numero_version) || 0), 0)
    return max + 1
  }, [versionesPresupuesto])
  /** numero_version de la versión inicial (la más antigua); nunca eliminable. */
  const numeroInicial = useMemo(() => {
    if (!versionesPresupuesto.length) return null
    return versionesPresupuesto.reduce(
      (m, v) => Math.min(m, Number(v.numero_version) || Infinity),
      Infinity,
    )
  }, [versionesPresupuesto])

  const [capitulosModal, setCapitulosModal] = useState([])
  const [loadingCapitulosModal, setLoadingCapitulosModal] = useState(false)
  /** AIU del contrato como fracción (0.23 = 23 %), igual que panel administrativo */
  const [aiuFraccion, setAiuFraccion] = useState(0)
  const [loadingAiu, setLoadingAiu] = useState(false)
  const [etiqueta, setEtiqueta] = useState('')
  const [justificacion, setJustificacion] = useState('')
  const [creando, setCreando] = useState(false)
  const [errorCrear, setErrorCrear] = useState(null)

  const [compareOpen, setCompareOpen] = useState(false)
  const [compareSel, setCompareSel] = useState([])
  const [compareVersions, setCompareVersions] = useState([])

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteStep, setDeleteStep] = useState('export')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [deleteExportOk, setDeleteExportOk] = useState(false)

  // Ciclo de aprobación (doble llave).
  const [enviarBusyId, setEnviarBusyId] = useState(null)
  const [revisionEstado, setRevisionEstado] = useState(null)
  const [selloTarget, setSelloTarget] = useState(null)
  const [selloResumen, setSelloResumen] = useState(null)
  const [selloLoading, setSelloLoading] = useState(false)
  const [selloBusy, setSelloBusy] = useState(false)
  const [selloObs, setSelloObs] = useState('')
  const [selloError, setSelloError] = useState(null)
  const [rechazarTarget, setRechazarTarget] = useState(null)
  const [rechazarObs, setRechazarObs] = useState('')
  const [rechazarBusy, setRechazarBusy] = useState(false)
  const [rechazarError, setRechazarError] = useState(null)

  const costoDirectoTotal = useMemo(
    () => capitulosModal.reduce((s, c) => s + Math.round(Number(c.costo_total) || 0), 0),
    [capitulosModal],
  )

  const aiuDisplayPct = useMemo(() => {
    const f = Number(aiuFraccion)
    if (!Number.isFinite(f) || f <= 0) return '0'
    return (f * 100).toFixed(4).replace(/\.?0+$/, '')
  }, [aiuFraccion])

  const directoMasAiu = useMemo(
    () => Math.round(costoDirectoTotal * (1 + (Number(aiuFraccion) || 0))),
    [costoDirectoTotal, aiuFraccion],
  )

  useEffect(() => {
    if (!createOpen) return
    setErrorCrear(null)
    setJustificacion('')
    setEtiqueta(esPrimeraVersion ? 'Inicial' : `V${siguienteNumero}`)
  }, [createOpen, esPrimeraVersion, siguienteNumero])

  useEffect(() => {
    if (!createOpen || !contratoId) return
    setLoadingAiu(true)
    fetch(`${API}/contratos/${contratoId}`, {
      headers: { Authorization: `Bearer ${authToken()}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        const raw = c?.aiu
        const n = parseFloat(String(raw ?? '').replace(',', '.'))
        setAiuFraccion(Number.isFinite(n) && n >= 0 ? n : 0)
      })
      .catch(() => setAiuFraccion(0))
      .finally(() => setLoadingAiu(false))
  }, [createOpen, contratoId, authToken, API])

  useEffect(() => {
    if (!createOpen || !contratoId) return
    setLoadingCapitulosModal(true)
    const p = new URLSearchParams({ tipo_ejecucion: PPTO_TIPO })
    fetch(`${API}/presupuesto/${contratoId}/capitulos-lista?${p}`, {
      headers: { Authorization: `Bearer ${authToken()}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setCapitulosModal(Array.isArray(list) ? list : []))
      .catch(() => setCapitulosModal([]))
      .finally(() => setLoadingCapitulosModal(false))
  }, [createOpen, contratoId, authToken, API])

  const confirmarCrear = useCallback(async () => {
    if (!contratoId || creando) return
    const et = String(etiqueta || '').trim()
    if (!et) {
      setErrorCrear('La etiqueta es obligatoria.')
      return
    }
    const just = String(justificacion || '').trim()
    if (!esPrimeraVersion && just.length < 10) {
      setErrorCrear('La justificación técnica es obligatoria para versiones posteriores a la inicial (mín. 10 caracteres).')
      return
    }
    setCreando(true)
    setErrorCrear(null)
    try {
      const res = await fetch(`${API}/presupuesto/${contratoId}/versiones/crear`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          etiqueta: et,
          justificacion_tecnica: just || null,
          aiu_porcentaje: Number(aiuFraccion) || 0,
        }),
      })
      if (!res.ok) {
        const msg = await res.text().catch(() => '')
        throw new Error(msg || `Error ${res.status}`)
      }
      onCreateOpenChange(false)
      await onVersionesReload?.()
    } catch (e) {
      setErrorCrear(e?.message || 'No se pudo crear la versión.')
    } finally {
      setCreando(false)
    }
  }, [
    API,
    contratoId,
    creando,
    esPrimeraVersion,
    etiqueta,
    justificacion,
    onCreateOpenChange,
    onVersionesReload,
    authToken,
    aiuFraccion,
  ])

  const toggleCompareSel = useCallback((versionId) => {
    setCompareSel((prev) => {
      const id = String(versionId)
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 3) return prev
      return [...prev, id]
    })
  }, [])

  const ejecutarComparar = useCallback(() => {
    if (compareSel.length < 2 || !contratoId) return
    const selected = versionesPresupuesto
      .filter((v) => compareSel.includes(String(v.id)))
      .sort((a, b) => (Number(a.numero_version) || 0) - (Number(b.numero_version) || 0))
    setCompareVersions(selected)
    setCompareOpen(true)
  }, [compareSel, contratoId, versionesPresupuesto])

  const exportarVersionExcel = useCallback(
    async (version, metaContrato) => {
      const res = await fetch(`${API}/presupuesto/${contratoId}/exportar-informe`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          modo: 'presupuesto_obra',
          version_id: String(version.id),
        }),
      })
      if (!res.ok) {
        const msg = await res.text().catch(() => '')
        throw new Error(msg || `Error ${res.status} exportando respaldo`)
      }
      const payload = await res.json()
      const slug = String(version.etiqueta || version.numero_version || 'version').replace(/[^\w.-]+/g, '_')
      await downloadPresupuestoInformeExcel(
        payload,
        {
          ...(metaContrato || {}),
          logo_contratista: metaContrato?.logo_contratista || usuario?.logo_contratista || null,
          logo_interventoria:
            metaContrato?.logo_interventoria || usuario?.logo_interventoria || null,
          logo_entidad: metaContrato?.logo_entidad || null,
        },
        contratoId,
        `presupuesto_version_${slug}_${contratoId}.xlsx`,
      )
    },
    [API, contratoId, authToken, usuario?.logo_contratista, usuario?.logo_interventoria],
  )

  const iniciarEliminar = useCallback(
    async (version) => {
      if (version.es_vigente) return
      setDeleteTarget(version)
      setDeleteStep('export')
      setDeleteError(null)
      setDeleteExportOk(false)
      setDeleteBusy(true)
      try {
        let meta = null
        try {
          const rc = await fetch(`${API}/contratos/${contratoId}`, {
            headers: { Authorization: `Bearer ${authToken()}` },
          })
          meta = rc.ok ? await rc.json() : null
        } catch {
          meta = null
        }
        await exportarVersionExcel(version, meta)
        setDeleteExportOk(true)
        setDeleteStep('confirm')
      } catch (e) {
        setDeleteError(e?.message || 'Error al generar el respaldo Excel.')
      } finally {
        setDeleteBusy(false)
      }
    },
    [API, contratoId, exportarVersionExcel, authToken],
  )

  const confirmarEliminar = useCallback(async () => {
    if (!deleteTarget || deleteBusy) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      const res = await fetch(
        `${API}/presupuesto/${contratoId}/versiones/${deleteTarget.id}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${authToken()}` } },
      )
      if (!res.ok) {
        const msg = await res.text().catch(() => '')
        throw new Error(msg || `Error ${res.status}`)
      }
      setDeleteTarget(null)
      setCompareSel((prev) => prev.filter((id) => id !== String(deleteTarget.id)))
      await onVersionesReload?.()
    } catch (e) {
      setDeleteError(e?.message || 'No se pudo eliminar la versión.')
    } finally {
      setDeleteBusy(false)
    }
  }, [API, contratoId, deleteBusy, deleteTarget, onVersionesReload, authToken])

  // Estado de revisión del presupuesto vivo (para el aviso de 100% aprobado).
  const recargarRevision = useCallback(async () => {
    if (!contratoId) return
    try {
      const r = await fetch(
        `${API}/presupuesto/${contratoId}/versiones/estado-revision`,
        { headers: { Authorization: `Bearer ${authToken()}` } },
      )
      setRevisionEstado(r.ok ? await r.json() : null)
    } catch {
      setRevisionEstado(null)
    }
  }, [API, contratoId, authToken])

  useEffect(() => {
    if (panelOpen) void recargarRevision()
  }, [panelOpen, recargarRevision, versionesPresupuesto])

  const enviarInterventoria = useCallback(
    async (version) => {
      if (!contratoId || enviarBusyId) return
      setEnviarBusyId(version.id)
      try {
        const res = await fetch(
          `${API}/presupuesto/${contratoId}/versiones/${version.id}/enviar-interventoria`,
          { method: 'POST', headers: { Authorization: `Bearer ${authToken()}` } },
        )
        if (!res.ok) {
          const msg = await res.text().catch(() => '')
          throw new Error(msg || `Error ${res.status}`)
        }
        await onVersionesReload?.()
      } catch (e) {
        window.alert(e?.message || 'No se pudo enviar a interventoría.')
      } finally {
        setEnviarBusyId(null)
      }
    },
    [API, contratoId, enviarBusyId, onVersionesReload, authToken],
  )

  const abrirSello = useCallback(
    async (version) => {
      setSelloTarget(version)
      setSelloResumen(null)
      setSelloObs('')
      setSelloError(null)
      setSelloLoading(true)
      try {
        const res = await fetch(
          `${API}/presupuesto/${contratoId}/versiones/${version.id}/resumen-ejecutivo`,
          { headers: { Authorization: `Bearer ${authToken()}` } },
        )
        if (!res.ok) {
          const msg = await res.text().catch(() => '')
          throw new Error(msg || `Error ${res.status}`)
        }
        setSelloResumen(await res.json())
      } catch (e) {
        setSelloError(e?.message || 'No se pudo cargar el resumen ejecutivo.')
      } finally {
        setSelloLoading(false)
      }
    },
    [API, contratoId, authToken],
  )

  const confirmarSello = useCallback(async () => {
    if (!selloTarget || selloBusy) return
    setSelloBusy(true)
    setSelloError(null)
    try {
      const res = await fetch(
        `${API}/presupuesto/${contratoId}/versiones/${selloTarget.id}/aprobar-sellar`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ observaciones: String(selloObs || '').trim() || null }),
        },
      )
      if (!res.ok) {
        const msg = await res.text().catch(() => '')
        throw new Error(msg || `Error ${res.status}`)
      }
      setSelloTarget(null)
      setSelloResumen(null)
      await onVersionesReload?.()
    } catch (e) {
      setSelloError(e?.message || 'No se pudo aprobar y sellar la versión.')
    } finally {
      setSelloBusy(false)
    }
  }, [API, contratoId, selloTarget, selloBusy, selloObs, onVersionesReload, authToken])

  const confirmarRechazo = useCallback(async () => {
    if (!rechazarTarget || rechazarBusy) return
    const obs = String(rechazarObs || '').trim()
    if (obs.length < 10) {
      setRechazarError('Indique el motivo del rechazo (mínimo 10 caracteres).')
      return
    }
    setRechazarBusy(true)
    setRechazarError(null)
    try {
      const res = await fetch(
        `${API}/presupuesto/${contratoId}/versiones/${rechazarTarget.id}/rechazar`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ observaciones: obs }),
        },
      )
      if (!res.ok) {
        const msg = await res.text().catch(() => '')
        throw new Error(msg || `Error ${res.status}`)
      }
      setRechazarTarget(null)
      setRechazarObs('')
      await onVersionesReload?.()
    } catch (e) {
      setRechazarError(e?.message || 'No se pudo rechazar la versión.')
    } finally {
      setRechazarBusy(false)
    }
  }, [API, contratoId, rechazarTarget, rechazarBusy, rechazarObs, onVersionesReload, authToken])

  const tituloCrear = esPrimeraVersion ? 'Crear versión inicial' : 'Nueva versión'

  return (
    <>
      {/* Modal crear versión */}
      {createOpen && (
        <div style={overlayStyle()} onClick={() => !creando && onCreateOpenChange(false)}>
          <div
            style={{
              width: '100%',
              maxWidth: 720,
              maxHeight: '92vh',
              overflow: 'auto',
              background: t.bgCard,
              borderRadius: 16,
              border: `1px solid ${t.border}`,
              boxShadow: '0 28px 90px rgba(0,0,0,0.55)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={headerDark(t)}>
              <div>
                <div style={{ fontSize: 'var(--cc-body)', fontWeight: 900, color: '#fff' }}>📸 {tituloCrear}</div>
                <div style={{ fontSize: 'var(--cc-sm)', color: '#94A3B8', marginTop: 2 }}>
                  Se guardará una foto del presupuesto de obra actual
                </div>
              </div>
              <button
                type="button"
                onClick={() => !creando && onCreateOpenChange(false)}
                style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 'var(--cc-title)' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 20 }}>
              <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 800, color: t.primary, marginBottom: 8 }}>
                Resumen de cantidades actuales
              </div>
              <div style={{ border: `1px solid ${t.border}`, borderRadius: 8, overflow: 'auto', maxHeight: 280 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)' }}>
                  <thead>
                    <tr style={{ background: `${t.primary}12` }}>
                      <th style={{ textAlign: 'left', padding: '8px 10px' }}>Capítulo</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', whiteSpace: 'nowrap' }}>Costo directo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingCapitulosModal ? (
                      <tr>
                        <td colSpan={2} style={{ padding: 16, color: t.textMuted }}>
                          Cargando capítulos…
                        </td>
                      </tr>
                    ) : !capitulosModal.length ? (
                      <tr>
                        <td colSpan={2} style={{ padding: 16, color: t.textMuted }}>
                          Sin capítulos en presupuesto de obra.
                        </td>
                      </tr>
                    ) : (
                      capitulosModal.map((c) => (
                        <tr key={c.capitulo} style={{ borderTop: `1px solid ${t.border}` }}>
                          <td style={{ padding: '6px 10px' }}>{c.capitulo}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right' }}>{formatCOP(c.costo_total)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div
                style={{
                  marginTop: 12,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 10,
                  padding: 12,
                  borderRadius: 8,
                  background: t.bg,
                  border: `1px solid ${t.border}`,
                }}
              >
                <div>
                  <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, fontWeight: 700 }}>Costo directo total</div>
                  <div style={{ fontSize: 'var(--cc-body)', fontWeight: 800, color: t.text }}>{formatCOP(costoDirectoTotal)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, fontWeight: 700, marginBottom: 4 }}>AIU (%)</div>
                  <div
                    style={{
                      padding: '6px 10px',
                      borderRadius: 5,
                      border: `1px solid ${t.border}`,
                      background: t.bg || t.bgCard,
                      color: t.text,
                      fontWeight: 700,
                      maxWidth: 120,
                    }}
                    title="Valor configurado en el contrato (panel administrativo)"
                  >
                    {loadingAiu ? '…' : `${aiuDisplayPct} %`}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, fontWeight: 700 }}>Directo + AIU</div>
                  <div style={{ fontSize: 'var(--cc-body)', fontWeight: 800, color: t.primary }}>{formatCOP(directoMasAiu)}</div>
                </div>
              </div>

              <div style={{ marginTop: 20, fontSize: 'var(--cc-sm)', fontWeight: 800, color: t.text, marginBottom: 10 }}>
                Metadatos de la versión
              </div>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <div style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>Etiqueta</div>
                <input
                  value={etiqueta}
                  onChange={(e) => setEtiqueta(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: `1px solid ${t.border}`,
                    background: t.inputBg || t.bgCard,
                    color: t.text,
                  }}
                />
              </label>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <div style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>
                  Justificación técnica{esPrimeraVersion ? ' (opcional)' : ' *'}
                </div>
                <textarea
                  value={justificacion}
                  onChange={(e) => setJustificacion(e.target.value)}
                  rows={3}
                  placeholder={esPrimeraVersion ? 'Opcional para la versión inicial' : 'Motivo del cambio de versión…'}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: `1px solid ${t.border}`,
                    background: t.inputBg || t.bgCard,
                    color: t.text,
                    resize: 'vertical',
                  }}
                />
              </label>

              {errorCrear && (
                <div style={{ color: '#DC2626', fontSize: 'var(--cc-sm)', marginBottom: 10 }}>{errorCrear}</div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => !creando && onCreateOpenChange(false)}
                  style={{
                    background: 'transparent',
                    border: `1px solid ${t.border}`,
                    borderRadius: 8,
                    padding: '8px 16px',
                    cursor: 'pointer',
                    color: t.textMuted,
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void confirmarCrear()}
                  disabled={creando}
                  style={{
                    background: creando ? '#94a3b8' : t.primary,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 18px',
                    fontWeight: 700,
                    cursor: creando ? 'wait' : 'pointer',
                  }}
                >
                  {creando ? '⏳ Creando…' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Drawer panel versiones */}
      {panelOpen && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.45)' }}
            onClick={() => onPanelOpenChange(false)}
          />
          <div
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: 'min(480px, 100vw)',
              zIndex: 9999,
              background: t.bgCard,
              borderLeft: `1px solid ${t.border}`,
              boxShadow: '-8px 0 32px rgba(0,0,0,0.25)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={headerDark(t)}>
              <div>
                <div style={{ fontSize: 'var(--cc-body)', fontWeight: 900, color: '#fff' }}>📚 Versiones de presupuesto</div>
                {versionVigente && (
                  <div style={{ fontSize: 'var(--cc-sm)', color: '#94A3B8', marginTop: 2 }}>
                    Vigente: {versionVigente.etiqueta}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => onPanelOpenChange(false)}
                style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 'var(--cc-title)' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {compareSel.length >= 2 && (
                <button
                  type="button"
                  onClick={() => void ejecutarComparar()}
                  disabled={compareSel.length < 2}
                  style={{
                    background: '#0D948818',
                    border: '1px solid #0D9488',
                    borderRadius: 6,
                    padding: '6px 12px',
                    color: '#0D9488',
                    fontWeight: 700,
                    fontSize: 'var(--cc-caption)',
                    cursor: compareSel.length < 2 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {`Comparar seleccionadas (${compareSel.length})`}
                </button>
              )}
              <span style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, alignSelf: 'center' }}>
                Seleccione hasta 3 versiones para comparar
              </span>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
              {!versionesPresupuesto.length ? (
                <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)', padding: 16 }}>
                  Aún no hay versiones. Use «Crear versión inicial» para el primer snapshot.
                </div>
              ) : (
                versionesPresupuesto.map((v) => {
                  const sel = compareSel.includes(String(v.id))
                  const esActivaBiblioteca = versionActiva && String(versionActiva.id) === String(v.id)
                  return (
                    <div
                      key={v.id}
                      style={{
                        border: `2px solid ${esActivaBiblioteca ? '#2563EB' : v.es_vigente ? t.primary : t.border}`,
                        borderRadius: 10,
                        padding: 12,
                        marginBottom: 10,
                        background: esActivaBiblioteca ? '#2563EB12' : v.es_vigente ? `${t.primary}0A` : t.bg,
                        boxShadow: esActivaBiblioteca ? '0 0 0 1px #2563EB44' : undefined,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={sel}
                          onChange={() => toggleCompareSel(v.id)}
                          title="Comparar"
                          style={{ marginTop: 4 }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 800, color: t.text }}>{v.etiqueta}</span>
                            {(() => {
                              const meta = estadoMeta(v)
                              return (
                                <span
                                  style={{
                                    fontSize: 'var(--cc-caption)',
                                    fontWeight: 700,
                                    color: meta.color,
                                    background: meta.bg,
                                    border: `1px solid ${meta.color}55`,
                                    borderRadius: 4,
                                    padding: '2px 8px',
                                  }}
                                >
                                  {meta.label}
                                </span>
                              )
                            })()}
                            {v.es_vigente_aprobada && (
                              <span
                                style={{
                                  fontSize: 'var(--cc-caption)',
                                  fontWeight: 800,
                                  color: '#fff',
                                  background: '#16A34A',
                                  borderRadius: 4,
                                  padding: '2px 8px',
                                }}
                                title="Versión vigente: alimenta dashboard y programación."
                              >
                                ★ Vigente (dashboard)
                              </span>
                            )}
                            {esActivaBiblioteca && (
                              <span
                                style={{
                                  fontSize: 'var(--cc-caption)',
                                  fontWeight: 800,
                                  color: '#fff',
                                  background: '#2563EB',
                                  borderRadius: 4,
                                  padding: '2px 8px',
                                }}
                              >
                                ✓ Viendo 👁️
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginTop: 4, lineHeight: 1.45 }}>
                            {fmtFecha(v.creada_en)} · {v.creada_por_nombre || `Usuario ${v.creada_por}`}
                          </div>
                          <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginTop: 2 }}>
                            {(v.conteo_items ?? 0).toLocaleString('es-CO')} ítems · {formatCOP(v.costo_directo_total)}
                          </div>
                        </div>
                      </div>
                      {(() => {
                        const estado = estadoMeta(v).key
                        const esBorradorActivo = !!v.es_vigente
                        const rev = revisionEstado
                        const btnBase = {
                          borderRadius: 6,
                          padding: '6px 12px',
                          fontSize: 'var(--cc-caption)',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }
                        return (
                          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {typeof onTrabajarEnVersion === 'function' && !v.es_vigente && (
                              <button
                                type="button"
                                onClick={() => onTrabajarEnVersion(v)}
                                disabled={esActivaBiblioteca}
                                style={{
                                  ...btnBase,
                                  background: esActivaBiblioteca ? '#2563EB22' : '#2563EB',
                                  color: esActivaBiblioteca ? '#2563EB' : '#fff',
                                  border: esActivaBiblioteca ? '1px solid #2563EB' : 'none',
                                }}
                              >
                                {esActivaBiblioteca ? '✓ Viendo 👁️' : 'Ver 👁️'}
                              </button>
                            )}
                            {v.observaciones && (
                              <div
                                style={{
                                  fontSize: 'var(--cc-caption)',
                                  color: t.textMuted,
                                  background: t.bgCard,
                                  border: `1px solid ${t.border}`,
                                  borderRadius: 6,
                                  padding: '6px 8px',
                                  lineHeight: 1.4,
                                }}
                              >
                                <strong>Observaciones:</strong> {v.observaciones}
                              </div>
                            )}

                            {esBorradorActivo && estado === 'borrador' && (
                              <>
                                {rev && rev.total > 0 && (
                                  <div
                                    style={{
                                      fontSize: 'var(--cc-caption)',
                                      fontWeight: 700,
                                      color: rev.completo ? '#15803D' : '#B45309',
                                    }}
                                  >
                                    Revisión interventoría: {rev.aprobados}/{rev.total} aprobados ({rev.porcentaje_aprobado}%)
                                  </div>
                                )}
                                {esContratista ? (
                                  <button
                                    type="button"
                                    onClick={() => void enviarInterventoria(v)}
                                    disabled={enviarBusyId === v.id}
                                    style={{ ...btnBase, background: '#0F766E', color: '#fff', border: 'none' }}
                                  >
                                    {enviarBusyId === v.id ? '⏳ Enviando…' : '📤 Enviar a interventoría'}
                                  </button>
                                ) : (
                                  <span style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>
                                    Borrador en edición por el contratista.
                                  </span>
                                )}
                              </>
                            )}

                            {esBorradorActivo && estado === 'enviado_interventoria' && (
                              <>
                                {rev && rev.total > 0 && (
                                  <div
                                    style={{
                                      fontSize: 'var(--cc-caption)',
                                      fontWeight: 700,
                                      color: rev.completo ? '#15803D' : '#B45309',
                                      background: rev.completo ? '#16A34A14' : '#F59E0B14',
                                      border: `1px solid ${rev.completo ? '#16A34A55' : '#F59E0B55'}`,
                                      borderRadius: 6,
                                      padding: '6px 8px',
                                    }}
                                  >
                                    {rev.completo
                                      ? '✓ 100% aprobado: puede sellar la versión.'
                                      : `Faltan ${rev.pendientes} registro(s) por aprobar (${rev.porcentaje_aprobado}%).`}
                                  </div>
                                )}
                                {esInterventoria ? (
                                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    <button
                                      type="button"
                                      onClick={() => void abrirSello(v)}
                                      style={{ ...btnBase, background: '#16A34A', color: '#fff', border: 'none' }}
                                    >
                                      ✅ Revisar y aprobar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setRechazarTarget(v)
                                        setRechazarObs('')
                                        setRechazarError(null)
                                      }}
                                      style={{ ...btnBase, background: '#FEE2E2', color: '#DC2626', border: '1px solid #DC2626' }}
                                    >
                                      ↩ Rechazar
                                    </button>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: 'var(--cc-caption)', color: '#B45309', fontWeight: 700 }}>
                                    📨 Enviada a interventoría · en revisión.
                                  </span>
                                )}
                              </>
                            )}

                            {!esBorradorActivo
                              && Number(v.numero_version) !== numeroInicial
                              && !v.es_vigente_aprobada && (
                              <div>
                                <button
                                  type="button"
                                  onClick={() => void iniciarEliminar(v)}
                                  disabled={deleteBusy && deleteTarget?.id === v.id}
                                  style={{ ...btnBase, background: '#FEE2E2', color: '#DC2626', border: '1px solid #DC2626' }}
                                >
                                  Eliminar
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </>
      )}

      <PptoVersionCompareModal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        versions={compareVersions}
        contratoId={contratoId}
        token={token}
        API={API}
        t={t}
        usuario={usuario}
      />

      {/* Eliminar — respaldo + confirmación */}
      {deleteTarget && (
        <div style={overlayStyle(10002)} onClick={() => !deleteBusy && setDeleteTarget(null)}>
          <div
            style={{ maxWidth: 460, width: '100%', background: t.bgCard, borderRadius: 12, padding: 20, border: `1px solid ${t.border}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 800, marginBottom: 8, color: '#DC2626' }}>Eliminar versión «{deleteTarget.etiqueta}»</div>
            {deleteStep === 'export' && deleteBusy && (
              <p style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>⏳ Generando y descargando respaldo Excel…</p>
            )}
            {deleteStep === 'confirm' && deleteExportOk && (
              <p style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, lineHeight: 1.45 }}>
                El respaldo Excel se descargó correctamente. Confirme para eliminar la versión de forma permanente.
              </p>
            )}
            {deleteError && <div style={{ color: '#DC2626', fontSize: 'var(--cc-sm)', marginTop: 8 }}>{deleteError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleteBusy} style={{ padding: '8px 14px', cursor: 'pointer' }}>
                Cancelar
              </button>
              {deleteStep === 'confirm' && deleteExportOk && (
                <button
                  type="button"
                  onClick={() => void confirmarEliminar()}
                  disabled={deleteBusy}
                  style={{
                    padding: '8px 14px',
                    background: '#DC2626',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    fontWeight: 700,
                    cursor: deleteBusy ? 'wait' : 'pointer',
                  }}
                >
                  {deleteBusy ? '⏳…' : 'Confirmar eliminación'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Resumen ejecutivo + aprobar y sellar (LLAVE 2 — interventoría) */}
      {selloTarget && (
        <div style={overlayStyle(10003)} onClick={() => !selloBusy && setSelloTarget(null)}>
          <div
            style={{
              width: '100%',
              maxWidth: 640,
              maxHeight: '92vh',
              overflow: 'auto',
              background: t.bgCard,
              borderRadius: 14,
              border: `1px solid ${t.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={headerDark(t)}>
              <div>
                <div style={{ fontSize: 'var(--cc-body)', fontWeight: 900, color: '#fff' }}>
                  ✅ Aprobar y sellar «{selloTarget.etiqueta}»
                </div>
                <div style={{ fontSize: 'var(--cc-sm)', color: '#94A3B8', marginTop: 2 }}>
                  Resumen ejecutivo · interventoría
                </div>
              </div>
              <button
                type="button"
                onClick={() => !selloBusy && setSelloTarget(null)}
                style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 'var(--cc-title)' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 20 }}>
              {selloLoading ? (
                <div style={{ color: t.textMuted, padding: 16 }}>Cargando resumen ejecutivo…</div>
              ) : selloError && !selloResumen ? (
                <div style={{ color: '#DC2626', padding: 12 }}>{selloError}</div>
              ) : selloResumen ? (
                <>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                      gap: 10,
                      marginBottom: 12,
                    }}
                  >
                    <div style={{ padding: 12, borderRadius: 8, background: t.bg, border: `1px solid ${t.border}` }}>
                      <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, fontWeight: 700 }}>Ítems</div>
                      <div style={{ fontSize: 'var(--cc-body)', fontWeight: 800, color: t.text }}>
                        {(selloResumen.conteo_items ?? 0).toLocaleString('es-CO')}
                      </div>
                    </div>
                    <div style={{ padding: 12, borderRadius: 8, background: t.bg, border: `1px solid ${t.border}` }}>
                      <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, fontWeight: 700 }}>Capítulos</div>
                      <div style={{ fontSize: 'var(--cc-body)', fontWeight: 800, color: t.text }}>{selloResumen.num_capitulos ?? 0}</div>
                    </div>
                    <div style={{ padding: 12, borderRadius: 8, background: t.bg, border: `1px solid ${t.border}` }}>
                      <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, fontWeight: 700 }}>Costo directo</div>
                      <div style={{ fontSize: 'var(--cc-body)', fontWeight: 800, color: t.primary }}>
                        {formatCOP(selloResumen.costo_directo_total)}
                      </div>
                    </div>
                  </div>

                  <div style={{ border: `1px solid ${t.border}`, borderRadius: 8, overflow: 'auto', maxHeight: 260 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)' }}>
                      <thead>
                        <tr style={{ background: `${t.primary}12` }}>
                          <th style={{ textAlign: 'left', padding: '8px 10px' }}>Capítulo</th>
                          <th style={{ textAlign: 'right', padding: '8px 10px', whiteSpace: 'nowrap' }}>Costo directo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selloResumen.capitulos || []).map((c) => (
                          <tr key={c.capitulo} style={{ borderTop: `1px solid ${t.border}` }}>
                            <td style={{ padding: '6px 10px' }}>{c.capitulo || 'Sin capítulo'}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right' }}>{formatCOP(c.costo_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {selloResumen.revision && !selloResumen.revision.completo && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: '8px 10px',
                        borderRadius: 6,
                        background: '#F59E0B14',
                        border: '1px solid #F59E0B55',
                        color: '#B45309',
                        fontSize: 'var(--cc-sm)',
                        fontWeight: 700,
                      }}
                    >
                      ⚠ No se puede sellar: faltan {selloResumen.revision.pendientes} registro(s) por aprobar
                      ({selloResumen.revision.porcentaje_aprobado}%). Apruebe el 100% en la grilla antes de sellar.
                    </div>
                  )}

                  <label style={{ display: 'block', marginTop: 14 }}>
                    <div style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>
                      Observaciones / consideraciones (opcional)
                    </div>
                    <textarea
                      value={selloObs}
                      onChange={(e) => setSelloObs(e.target.value)}
                      rows={3}
                      placeholder="Consideraciones de la interventoría para esta versión aprobada…"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: `1px solid ${t.border}`,
                        background: t.inputBg || t.bgCard,
                        color: t.text,
                        resize: 'vertical',
                      }}
                    />
                  </label>

                  <div
                    style={{
                      marginTop: 12,
                      fontSize: 'var(--cc-sm)',
                      fontWeight: 800,
                      color: t.text,
                    }}
                  >
                    ¿Es esta la versión final y aprobada por la interventoría?
                  </div>
                  <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginTop: 2, lineHeight: 1.4 }}>
                    Al confirmar, la versión queda <strong>sellada</strong> y se vuelve la <strong>vigente</strong>:
                    actualiza de forma permanente la dashboard y la programación.
                  </div>

                  {selloError && <div style={{ color: '#DC2626', fontSize: 'var(--cc-sm)', marginTop: 8 }}>{selloError}</div>}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                    <button
                      type="button"
                      onClick={() => setSelloTarget(null)}
                      disabled={selloBusy}
                      style={{ padding: '8px 16px', border: `1px solid ${t.border}`, borderRadius: 8, background: 'transparent', color: t.textMuted, cursor: 'pointer' }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void confirmarSello()}
                      disabled={selloBusy || (selloResumen.revision && !selloResumen.revision.completo)}
                      style={{
                        padding: '8px 18px',
                        background: selloBusy || (selloResumen.revision && !selloResumen.revision.completo) ? '#94a3b8' : '#16A34A',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        fontWeight: 800,
                        cursor: selloBusy ? 'wait' : 'pointer',
                      }}
                    >
                      {selloBusy ? '⏳ Sellando…' : 'Sí, aprobar y sellar'}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Rechazar / devolver al contratista */}
      {rechazarTarget && (
        <div style={overlayStyle(10003)} onClick={() => !rechazarBusy && setRechazarTarget(null)}>
          <div
            style={{ maxWidth: 460, width: '100%', background: t.bgCard, borderRadius: 12, padding: 20, border: `1px solid ${t.border}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 800, marginBottom: 8, color: '#B91C1C' }}>
              Rechazar «{rechazarTarget.etiqueta}»
            </div>
            <p style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, lineHeight: 1.45 }}>
              La versión vuelve a borrador editable para que el contratista la corrija. Indique el motivo.
            </p>
            <textarea
              value={rechazarObs}
              onChange={(e) => setRechazarObs(e.target.value)}
              rows={3}
              placeholder="Motivo del rechazo (mínimo 10 caracteres)…"
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 6,
                border: `1px solid ${t.border}`,
                background: t.inputBg || t.bgCard,
                color: t.text,
                resize: 'vertical',
                marginTop: 8,
              }}
            />
            {rechazarError && <div style={{ color: '#DC2626', fontSize: 'var(--cc-sm)', marginTop: 8 }}>{rechazarError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button type="button" onClick={() => setRechazarTarget(null)} disabled={rechazarBusy} style={{ padding: '8px 14px', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmarRechazo()}
                disabled={rechazarBusy}
                style={{ padding: '8px 14px', background: '#B91C1C', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}
              >
                {rechazarBusy ? '⏳…' : 'Rechazar y devolver'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

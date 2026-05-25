import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatCOP } from '../../utils/formatCOP'
import { downloadPresupuestoInformeExcel } from './presupuestoExportExcel'
import PptoVersionCompareModal from './PptoVersionCompareModal'

const PPTO_TIPO = 'Presupuesto de Obra'

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
}) {
  const esPrimeraVersion = versionesPresupuesto.length === 0
  const siguienteNumero = useMemo(() => {
    const max = versionesPresupuesto.reduce((m, v) => Math.max(m, Number(v.numero_version) || 0), 0)
    return max + 1
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

  const [restaurarTarget, setRestaurarTarget] = useState(null)
  const [restaurarBusy, setRestaurarBusy] = useState(false)

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
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        const raw = c?.aiu
        const n = parseFloat(String(raw ?? '').replace(',', '.'))
        setAiuFraccion(Number.isFinite(n) && n >= 0 ? n : 0)
      })
      .catch(() => setAiuFraccion(0))
      .finally(() => setLoadingAiu(false))
  }, [createOpen, contratoId, token, API])

  useEffect(() => {
    if (!createOpen || !contratoId) return
    setLoadingCapitulosModal(true)
    const p = new URLSearchParams({ tipo_ejecucion: PPTO_TIPO })
    fetch(`${API}/presupuesto/${contratoId}/capitulos-lista?${p}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setCapitulosModal(Array.isArray(list) ? list : []))
      .catch(() => setCapitulosModal([]))
      .finally(() => setLoadingCapitulosModal(false))
  }, [createOpen, contratoId, token, API])

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
          Authorization: `Bearer ${token}`,
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
    token,
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
          Authorization: `Bearer ${token}`,
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
        },
        contratoId,
        `presupuesto_version_${slug}_${contratoId}.xlsx`,
      )
    },
    [API, contratoId, token, usuario?.logo_contratista],
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
            headers: { Authorization: `Bearer ${token}` },
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
    [API, contratoId, exportarVersionExcel, token],
  )

  const confirmarEliminar = useCallback(async () => {
    if (!deleteTarget || deleteBusy) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      const res = await fetch(
        `${API}/presupuesto/${contratoId}/versiones/${deleteTarget.id}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
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
  }, [API, contratoId, deleteBusy, deleteTarget, onVersionesReload, token])

  const confirmarRestaurar = useCallback(async () => {
    if (!restaurarTarget || restaurarBusy) return
    setRestaurarBusy(true)
    try {
      const res = await fetch(
        `${API}/presupuesto/${contratoId}/versiones/${restaurarTarget.id}/restaurar`,
        { method: 'PUT', headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) {
        const msg = await res.text().catch(() => '')
        throw new Error(msg || `Error ${res.status}`)
      }
      setRestaurarTarget(null)
      await onVersionesReload?.()
    } catch (e) {
      window.alert(e?.message || 'No se pudo restaurar la versión.')
    } finally {
      setRestaurarBusy(false)
    }
  }, [API, contratoId, onVersionesReload, restaurarBusy, restaurarTarget, token])

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
                  return (
                    <div
                      key={v.id}
                      style={{
                        border: `1px solid ${v.es_vigente ? t.primary : t.border}`,
                        borderRadius: 10,
                        padding: 12,
                        marginBottom: 10,
                        background: v.es_vigente ? `${t.primary}0A` : t.bg,
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 800, color: t.text }}>{v.etiqueta}</span>
                            {v.es_vigente && (
                              <span
                                style={{
                                  fontSize: 'var(--cc-caption)',
                                  fontWeight: 700,
                                  color: '#fff',
                                  background: t.primary,
                                  borderRadius: 4,
                                  padding: '2px 8px',
                                }}
                              >
                                Vigente
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
                      {!v.es_vigente && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => setRestaurarTarget(v)}
                            style={{
                              background: `${t.primary}18`,
                              border: `1px solid ${t.primary}`,
                              borderRadius: 6,
                              padding: '4px 10px',
                              fontSize: 'var(--cc-caption)',
                              fontWeight: 700,
                              color: t.primary,
                              cursor: 'pointer',
                            }}
                          >
                            Restaurar
                          </button>
                          <button
                            type="button"
                            onClick={() => void iniciarEliminar(v)}
                            disabled={deleteBusy && deleteTarget?.id === v.id}
                            style={{
                              background: '#FEE2E2',
                              border: '1px solid #DC2626',
                              borderRadius: 6,
                              padding: '4px 10px',
                              fontSize: 'var(--cc-caption)',
                              fontWeight: 700,
                              color: '#DC2626',
                              cursor: 'pointer',
                            }}
                          >
                            Eliminar
                          </button>
                        </div>
                      )}
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
      />

      {/* Confirmar restaurar */}
      {restaurarTarget && (
        <div style={overlayStyle(10002)} onClick={() => !restaurarBusy && setRestaurarTarget(null)}>
          <div
            style={{ maxWidth: 420, width: '100%', background: t.bgCard, borderRadius: 12, padding: 20, border: `1px solid ${t.border}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Restaurar versión «{restaurarTarget.etiqueta}»</div>
            <p style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, lineHeight: 1.45 }}>
              Se marcará como vigente en el historial. El presupuesto operativo en pantalla no se modifica automáticamente.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button type="button" onClick={() => setRestaurarTarget(null)} disabled={restaurarBusy} style={{ padding: '8px 14px', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmarRestaurar()}
                disabled={restaurarBusy}
                style={{ padding: '8px 14px', background: t.primary, color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}
              >
                {restaurarBusy ? '⏳…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

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
    </>
  )
}

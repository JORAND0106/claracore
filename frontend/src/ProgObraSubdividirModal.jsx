/**
 * Subdivisión de PK en subsectores por abscisa.
 * Popup independiente: no se monta sobre otro.
 * Usa EsquemaEditorModal compartido (sin copiar la herramienta).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { SplitSquareHorizontal, X, Check, Trash2, Pencil } from 'lucide-react'
import CcModalBrandHeader from './components/CcModalBrandHeader'
import EsquemaEditorModal from './components/esquema/EsquemaEditorModal'
import {
  clipPkPolygonEntreAbscisas,
  displayLabelSubsector,
  findPkFeature,
  formatAbscisaLabel,
  parseAbscisaLabel,
  roundAbscisaDecenaM,
} from './progObraSubsectores'
import {
  createSubsector,
  deleteSubsector,
  fetchSubsectoresPk,
  previewSubsector,
  updateSubsector,
} from './progObraApi'

const Z = 210000

function detailMsg(err) {
  const d = err?.detail
  if (typeof d === 'string') return d
  if (d && typeof d === 'object' && d.message) return d.message
  return err?.message || 'Error'
}

export default function ProgObraSubdividirModal({
  open,
  onClose,
  onChanged,
  t,
  API,
  cid,
  token,
  versionId,
  pkId,
  versionPptoId = null,
  planoFc = null,
  puedeCrear = false,
  puedeEditar = false,
  puedeEliminar = false,
  showToast,
}) {
  const [phase, setPhase] = useState('lista') // lista | esquema | confirmar | cruzan
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [absIni, setAbsIni] = useState('')
  const [absFin, setAbsFin] = useState('')
  const [preview, setPreview] = useState(null)
  const [modo, setModo] = useState('automatico')
  const [manualQty, setManualQty] = useState({})
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  const pkFeat = useMemo(() => findPkFeature(planoFc, pkId), [planoFc, pkId])

  const reload = useCallback(async () => {
    if (!open || !cid || !token || !versionId || !pkId) return
    setBusy(true)
    setError('')
    try {
      const d = await fetchSubsectoresPk(API, cid, token, versionId, pkId, versionPptoId)
      setData(d)
      if (!d.puede_subdividir && (d.lineas_sin_abscisado || []).length) {
        const short = (d.lineas_sin_abscisado || [])
          .slice(0, 4)
          .map((l) => `${l.capitulo}/${l.item}`)
          .join(', ')
        setError(`Líneas sin abscisado: ${short}${(d.lineas_sin_abscisado || []).length > 4 ? '…' : ''}`)
      }
    } catch (e) {
      setError(detailMsg(e))
    } finally {
      setBusy(false)
    }
  }, [open, cid, token, API, versionId, pkId, versionPptoId])

  useEffect(() => {
    if (!open) return
    setPhase('lista')
    setEditingId(null)
    setPreview(null)
    setManualQty({})
    setConfirmDeleteId(null)
    void reload()
  }, [open, reload])

  const runPreview = useCallback(async (a0, a1, modoReparto = 'automatico', manual = null) => {
    setBusy(true)
    setError('')
    try {
      const body = {
        version_id: versionId,
        pk_id: pkId,
        abs_inicio: a0,
        abs_final: a1,
        modo: modoReparto,
        manual: manual || undefined,
        version_ppto_id: versionPptoId || undefined,
        exclude_id: editingId || undefined,
        plano_geojson: planoFc || undefined,
        pk_geojson: pkFeat?.geometry || undefined,
      }
      const p = await previewSubsector(API, cid, token, body)
      // Preview local del recorte si el backend no trajo geojson
      if (!p.geojson && pkFeat?.geometry) {
        const m0 = parseAbscisaLabel(p.abs_inicio_label || a0)
        const m1 = parseAbscisaLabel(p.abs_final_label || a1)
        p.geojson = await clipPkPolygonEntreAbscisas(pkFeat.geometry, planoFc, m0, m1)
      }
      setPreview(p)
      setAbsIni(p.abs_inicio_label)
      setAbsFin(p.abs_final_label)
      if ((p.cruzan || []).length && modoReparto === 'automatico') {
        // Automático ya repartió; si el usuario eligió decidir, se cambia de fase
      }
      setPhase('confirmar')
      return p
    } catch (e) {
      const msg = detailMsg(e)
      setError(msg)
      showToast?.(msg, 'error')
      return null
    } finally {
      setBusy(false)
    }
  }, [API, cid, token, versionId, pkId, versionPptoId, editingId, planoFc, pkFeat, showToast])

  const handleEsquemaSave = useCallback(async ({ objects, mapRef, pan, zoom } = {}) => {
    // El host recibe el trazo: preferimos abs desde mapPick / polilínea con metadatos
    // Si el caller no pasa proyección, pedimos al usuario digitar tras cerrar esquema.
    let a0 = absIni
    let a1 = absFin
    // Intentar leer abscisas de objetos sentidoEje
    const poly = (objects || []).find((o) => o?.type === 'polilinea' && o.sentidoEje)
    if (poly && (poly.absIni != null || poly.abs_ini != null)) {
      const raw0 = poly.absIni ?? poly.abs_ini
      const raw1 = poly.absFin ?? poly.abs_fin
      a0 = formatAbscisaLabel(raw0)
      a1 = formatAbscisaLabel(raw1)
    }
    setPhase('confirmar')
    if (a0 && a1) {
      await runPreview(a0, a1, 'automatico')
    } else {
      setAbsIni(a0 || data?.pk_abs_inicio_label || '')
      setAbsFin(a1 || '')
      setPreview(null)
    }
    // mapRef/pan/zoom reservados para proyección futura
    void mapRef
    void pan
    void zoom
  }, [absIni, absFin, runPreview, data])

  const handleConfirmAbs = async () => {
    const m0 = parseAbscisaLabel(absIni)
    const m1 = parseAbscisaLabel(absFin)
    if (m0 == null || m1 == null || m1 <= m0) {
      setError('Abscisas inválidas (múltiplos de 10; final > inicial).')
      return
    }
    const p = await runPreview(formatAbscisaLabel(m0), formatAbscisaLabel(m1), modo, modo === 'manual' ? manualQty : null)
    if (p && (p.cruzan || []).length && modo !== 'automatico' && Object.keys(manualQty).length === 0) {
      setPhase('cruzan')
    }
  }

  const handleSave = async () => {
    if (!puedeCrear && !editingId) return
    if (editingId && !puedeEditar) return
    const m0 = parseAbscisaLabel(absIni)
    const m1 = parseAbscisaLabel(absFin)
    if (m0 == null || m1 == null) {
      setError('Abscisas inválidas.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const payload = {
        abs_inicio: formatAbscisaLabel(m0),
        abs_final: formatAbscisaLabel(m1),
        modo,
        manual: modo === 'manual' ? manualQty : undefined,
        geojson: preview?.geojson || undefined,
        plano_geojson: planoFc || undefined,
        pk_geojson: pkFeat?.geometry || undefined,
        version_ppto_id: versionPptoId || undefined,
      }
      if (editingId) {
        await updateSubsector(API, cid, token, versionId, editingId, payload)
        showToast?.('Subsector actualizado.', 'ok')
      } else {
        await createSubsector(API, cid, token, {
          version_id: versionId,
          pk_id: pkId,
          ...payload,
        })
        showToast?.('Subsector creado.', 'ok')
      }
      setEditingId(null)
      setPreview(null)
      setPhase('lista')
      await reload()
      onChanged?.(pkId)
    } catch (e) {
      const msg = detailMsg(e)
      setError(msg)
      showToast?.(msg, 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (id) => {
    if (!puedeEliminar) return
    setBusy(true)
    setError('')
    try {
      await deleteSubsector(API, cid, token, versionId, id)
      showToast?.('Subsector eliminado. Cantidades vuelven al PK.', 'ok')
      setConfirmDeleteId(null)
      await reload()
      onChanged?.(pkId)
    } catch (e) {
      setError(detailMsg(e))
    } finally {
      setBusy(false)
    }
  }

  if (!open || typeof document === 'undefined') return null

  // Fase esquema: solo la herramienta compartida (sin otro popup debajo)
  if (phase === 'esquema') {
    return createPortal(
      <EsquemaEditorModal
        t={t}
        title={`Subdividir · PK ${pkId}`}
        contratoId={cid}
        autoActivateMap
        mapLocation={{
          pkId,
          absInicio: data?.pk_abs_inicio_m,
          absFinal: data?.pk_abs_final_m,
        }}
        draftModule="prog_obra_subsector"
        draftEntityId={`${versionId}:${pkId}:${editingId || 'new'}`}
        onSave={async (bundle) => {
          await handleEsquemaSave({
            objects: bundle?.objects || bundle?.sceneObjects || [],
          })
        }}
        onClose={() => setPhase(editingId || preview ? 'confirmar' : 'lista')}
      />,
      document.body,
    )
  }

  const sinAbs = data?.lineas_sin_abscisado || []
  const subs = data?.subsectores || []
  const pendiente = data?.pendiente || []

  return createPortal(
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: Z,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-label="Subdividir"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(960px, 96vw)',
          maxHeight: '92vh',
          overflow: 'auto',
          background: t.bgCard,
          borderRadius: 12,
          border: `1px solid ${t.border}`,
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
        }}
      >
        <CcModalBrandHeader theme={t} />
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: t.primary }}>
            <SplitSquareHorizontal size={16} />
            <span
              data-cc-tooltip="Divide el PK en subsectores por abscisa sin cambiar el PK_ID. Cada subsector se programa por aparte."
              data-cc-tooltip-variant="help"
            >
              Subdividir
            </span>
            <span style={{ fontWeight: 500, color: t.textMuted, fontSize: 'var(--cc-caption)' }}>
              PK {pkId}
            </span>
          </div>
          <button
            type="button"
            data-cc-tooltip="Cerrar"
            data-cc-tooltip-variant="short"
            aria-label="Cerrar"
            onClick={() => !busy && onClose?.()}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: t.textMuted }}
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div
            style={{
              margin: '0 16px 8px',
              padding: '8px 12px',
              borderRadius: 8,
              background: '#fef3c7',
              color: '#92400e',
              fontSize: 'var(--cc-caption)',
            }}
            data-cc-tooltip={sinAbs.map((l) => `${l.capitulo}/${l.item} · ${l.descripcion || ''}`).join('\n') || undefined}
            data-cc-tooltip-variant="help"
          >
            {error}
          </div>
        )}

        {phase === 'lista' && (
          <div style={{ padding: '8px 16px 16px' }}>
            {!data?.puede_subdividir ? (
              <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>
                No se puede subdividir este PK.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  {puedeCrear && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEditingId(null)
                        setPreview(null)
                        setAbsIni(data?.pk_abs_inicio_label || '')
                        setAbsFin('')
                        setPhase('esquema')
                      }}
                      data-cc-tooltip="Dibuja el subsector en el plano con la herramienta de esquema"
                      data-cc-tooltip-variant="help"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: `1px solid ${t.primary}`,
                        background: t.primary,
                        color: '#fff',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontSize: 'var(--cc-sm)',
                      }}
                    >
                      <SplitSquareHorizontal size={14} />
                      Dibujar
                    </button>
                  )}
                  {puedeCrear && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEditingId(null)
                        setAbsIni(data?.pk_abs_inicio_label || '')
                        setAbsFin('')
                        setPreview(null)
                        setPhase('confirmar')
                      }}
                      data-cc-tooltip="Define el subsector digitando abscisas (múltiplos de 10)"
                      data-cc-tooltip-variant="help"
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: `1px solid ${t.border}`,
                        background: t.bg,
                        color: t.text,
                        cursor: 'pointer',
                        fontSize: 'var(--cc-sm)',
                      }}
                    >
                      Abscisas
                    </button>
                  )}
                </div>

                {subs.length === 0 ? (
                  <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>
                    Aún no hay subsectores. El PK se programa completo como hoy.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {subs.map((s) => (
                      <div
                        key={s.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: `1px solid ${t.border}`,
                          background: t.bg,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: t.text }}>
                            {s.label || displayLabelSubsector(pkId, s.abs_inicio_m, s.abs_final_m)}
                          </div>
                          <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>
                            {(s.lineas || []).length} líneas · modo {s.modo_reparto || '—'}
                          </div>
                        </div>
                        {puedeEditar && (
                          <button
                            type="button"
                            data-cc-tooltip="Redibujar"
                            data-cc-tooltip-variant="short"
                            aria-label="Redibujar"
                            onClick={() => {
                              setEditingId(s.id)
                              setAbsIni(s.abs_inicio_label)
                              setAbsFin(s.abs_final_label)
                              setPhase('esquema')
                            }}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: t.primary }}
                          >
                            <Pencil size={16} />
                          </button>
                        )}
                        {puedeEliminar && (
                          <button
                            type="button"
                            data-cc-tooltip="Eliminar"
                            data-cc-tooltip-variant="short"
                            aria-label="Eliminar"
                            onClick={() => setConfirmDeleteId(s.id)}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#dc2626' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {pendiente.some((p) => Number(p.cantidad_pendiente) > 0.009) && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6, color: t.text }}>Pendiente</div>
                    <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, maxHeight: 160, overflow: 'auto' }}>
                      {pendiente
                        .filter((p) => Number(p.cantidad_pendiente) > 0.009)
                        .slice(0, 40)
                        .map((p) => (
                          <div key={p.linea_key}>
                            {p.capitulo}/{p.item}: {Number(p.cantidad_pendiente).toFixed(2)} {p.und || ''}
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {(phase === 'confirmar' || phase === 'cruzan') && (
          <div style={{ padding: '8px 16px 16px' }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--cc-caption)' }}>
                <span
                  data-cc-tooltip="Abscisa inicial (múltiplo de 10 m)"
                  data-cc-tooltip-variant="help"
                  style={{ color: t.textMuted }}
                >
                  Inicio
                </span>
                <input
                  value={absIni}
                  onChange={(e) => setAbsIni(e.target.value)}
                  onBlur={() => {
                    const m = parseAbscisaLabel(absIni)
                    if (m != null) setAbsIni(formatAbscisaLabel(m))
                  }}
                  disabled={busy}
                  style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.bgCard, minWidth: 120 }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--cc-caption)' }}>
                <span
                  data-cc-tooltip="Abscisa final (múltiplo de 10 m)"
                  data-cc-tooltip-variant="help"
                  style={{ color: t.textMuted }}
                >
                  Fin
                </span>
                <input
                  value={absFin}
                  onChange={(e) => setAbsFin(e.target.value)}
                  onBlur={() => {
                    const m = parseAbscisaLabel(absFin)
                    if (m != null) setAbsFin(formatAbscisaLabel(m))
                  }}
                  disabled={busy}
                  style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.bgCard, minWidth: 120 }}
                />
              </label>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleConfirmAbs()}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: `1px solid ${t.border}`,
                    background: t.bg,
                    cursor: 'pointer',
                    fontSize: 'var(--cc-sm)',
                  }}
                >
                  Vista previa
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPhase('esquema')}
                  data-cc-tooltip="Abrir herramienta de esquema"
                  data-cc-tooltip-variant="help"
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: `1px solid ${t.border}`,
                    background: t.bg,
                    cursor: 'pointer',
                    fontSize: 'var(--cc-sm)',
                  }}
                >
                  Esquema
                </button>
              </div>
            </div>

            {preview && (
              <>
                <div style={{ fontWeight: 600, marginBottom: 8, color: t.text }}>
                  {preview.label || displayLabelSubsector(pkId, preview.abs_inicio_m, preview.abs_final_m)}
                  {preview.geojson ? (
                    <span style={{ marginLeft: 8, fontWeight: 400, color: t.textMuted, fontSize: 'var(--cc-caption)' }}>
                      Recorte listo
                    </span>
                  ) : null}
                </div>

                {(preview.cruzan || []).length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }} data-cc-tooltip="Líneas que cruzan el límite del subsector" data-cc-tooltip-variant="help">
                      Cruce
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      {['automatico', 'manual'].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setModo(m)
                            if (m === 'manual') setPhase('cruzan')
                            else void runPreview(absIni, absFin, 'automatico')
                          }}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 6,
                            border: `1px solid ${modo === m ? t.primary : t.border}`,
                            background: modo === m ? `${t.primary}22` : t.bg,
                            color: modo === m ? t.primary : t.text,
                            fontWeight: modo === m ? 700 : 500,
                            cursor: 'pointer',
                            fontSize: 'var(--cc-sm)',
                          }}
                          data-cc-tooltip={
                            m === 'automatico'
                              ? 'Reparte en proporción a la longitud dentro del subsector'
                              : 'Digita la cantidad de cada línea sin pasar del saldo'
                          }
                          data-cc-tooltip-variant="help"
                        >
                          {m === 'automatico' ? 'Automático' : 'Manual'}
                        </button>
                      ))}
                    </div>
                    {modo === 'manual' && (
                      <div style={{ maxHeight: 220, overflow: 'auto', border: `1px solid ${t.border}`, borderRadius: 8 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-caption)' }}>
                          <thead>
                            <tr style={{ background: t.bg }}>
                              <th style={{ textAlign: 'left', padding: 6 }}>Ítem</th>
                              <th style={{ textAlign: 'right', padding: 6 }}>Total</th>
                              <th style={{ textAlign: 'right', padding: 6 }}>Sugerido</th>
                              <th style={{ textAlign: 'right', padding: 6 }}>Cantidad</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(preview.cruzan || []).map((c) => (
                              <tr key={c.linea_key} style={{ borderTop: `1px solid ${t.border}` }}>
                                <td style={{ padding: 6 }} title={c.descripcion}>
                                  {c.capitulo}/{c.item}
                                </td>
                                <td style={{ padding: 6, textAlign: 'right' }}>{Number(c.cantidad_total_linea).toFixed(2)}</td>
                                <td style={{ padding: 6, textAlign: 'right' }}>{Number(c.cantidad_sugerida).toFixed(2)}</td>
                                <td style={{ padding: 6, textAlign: 'right' }}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max={c.cantidad_total_linea}
                                    value={manualQty[c.linea_key] ?? c.cantidad_sugerida}
                                    onChange={(e) =>
                                      setManualQty((prev) => ({
                                        ...prev,
                                        [c.linea_key]: e.target.value,
                                      }))
                                    }
                                    style={{ width: 88, padding: 4, borderRadius: 4, border: `1px solid ${t.border}` }}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ maxHeight: 180, overflow: 'auto', fontSize: 'var(--cc-caption)', color: t.textMuted, marginBottom: 12 }}>
                  {(preview.asignaciones || []).slice(0, 50).map((a) => (
                    <div key={`${a.linea_key}-${a.modo}`}>
                      {a.capitulo}/{a.item}: {Number(a.cantidad).toFixed(2)} ({a.modo})
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setPhase('lista')
                  setPreview(null)
                  setEditingId(null)
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1px solid ${t.border}`,
                  background: t.bg,
                  cursor: 'pointer',
                }}
              >
                Volver
              </button>
              <button
                type="button"
                disabled={busy || (!puedeCrear && !editingId) || (editingId && !puedeEditar)}
                onClick={() => void handleSave()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: t.primary,
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Check size={14} />
                Guardar
              </button>
            </div>
          </div>
        )}

        {confirmDeleteId && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: Z + 1,
              background: 'rgba(15,23,42,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
          >
            {/* Confirmación reemplaza la vista: el modal de lista queda detrás atenuado;
                se cierra al confirmar/cancelar — no es un flujo paralelo. */}
            <div
              style={{
                width: 'min(420px, 94vw)',
                background: t.bgCard,
                borderRadius: 12,
                border: `1px solid ${t.border}`,
                padding: 16,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 8 }}>¿Eliminar subsector?</div>
              <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginBottom: 16 }}>
                Sus cantidades vuelven al PK y su programación se retira.
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setConfirmDeleteId(null)} style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDelete(confirmDeleteId)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** Icono de toolbar para abrir Subdividir (solo icono + tooltip institucional). */
export function ProgObraSubdividirIconBtn({ onClick, disabled, t, visible = true }) {
  if (!visible) return null
  return (
    <button
      type="button"
      data-cc-tooltip="Subdividir el PK en subsectores por abscisa"
      data-cc-tooltip-variant="help"
      aria-label="Subdividir"
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        padding: 0,
        borderRadius: 8,
        border: `1px solid ${t?.border || 'transparent'}`,
        background: 'transparent',
        color: t?.primary || 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        flexShrink: 0,
      }}
    >
      <SplitSquareHorizontal size={16} />
    </button>
  )
}

export function snapAbsInput(raw) {
  const m = roundAbscisaDecenaM(parseAbscisaLabel(raw) ?? raw)
  return m == null ? '' : formatAbscisaLabel(m)
}

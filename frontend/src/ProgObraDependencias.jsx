/**
 * ProgObraDependencias — pestaña de gestión de dependencias CPM.
 * Se renderiza dentro de ProgObraProgramacionModal como una tab separada.
 *
 * Props:
 *   cid            — contrato_id
 *   token          — JWT
 *   API            — base URL
 *   t              — tema (colores)
 *   activePk       — PK activo (origen fijo)
 *   versionId      — ID de la versión borrador
 *   capitulosOrigen — capítulos del PK activo (array de strings)
 *   allPkIds       — todos los PK IDs del contrato (para selector destino)
 *   editable       — bool
 *   showToast      — fn(msg, type)
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Trash2, Plus, AlertCircle, GitFork, Info } from 'lucide-react'

// ─── Constantes ──────────────────────────────────────────────────────────────

const TIPOS = [
  { value: 'FS', label: 'FS', desc: 'Finish-Start: el destino empieza cuando el origen termina' },
  { value: 'SS', label: 'SS', desc: 'Start-Start: el destino empieza cuando el origen empieza' },
  { value: 'FF', label: 'FF', desc: 'Finish-Finish: el destino termina cuando el origen termina' },
  { value: 'SF', label: 'SF', desc: 'Start-Finish: el destino termina cuando el origen empieza' },
]

const inputStyle = (t) => ({
  padding: '5px 8px',
  fontSize: 'var(--cc-sm)',
  border: `1px solid ${t.border}`,
  borderRadius: 6,
  background: t.bgCard,
  color: t.text,
  outline: 'none',
})

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ProgObraDependencias({
  cid,
  token,
  API,
  t,
  activePk,
  versionId,
  capitulosOrigen,
  allPkIds,
  editable,
  showToast,
  onCpmCalculated,
}) {
  const [deps, setDeps] = useState([])
  const [loading, setLoading] = useState(false)
  const [cpmDirty, setCpmDirty] = useState(false)
  const [cpmCalculando, setCpmCalculando] = useState(false)
  const [cpmResultados, setCpmResultados] = useState([])

  // Formulario de nueva dependencia
  const [formCapOrigen, setFormCapOrigen] = useState('')
  const [formPkDest, setFormPkDest] = useState('')
  const [formCapDest, setFormCapDest] = useState('')
  const [formTipo, setFormTipo] = useState('FS')
  const [formLag, setFormLag] = useState('0')
  const [capsDest, setCapsDest] = useState([])
  const [loadingCapsDest, setLoadingCapsDest] = useState(false)
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const hdrs = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  // ── Inicializar capítulo origen al primer capítulo disponible
  useEffect(() => {
    if (capitulosOrigen.length > 0 && !formCapOrigen) {
      setFormCapOrigen(capitulosOrigen[0])
    }
  }, [capitulosOrigen, formCapOrigen])

  // ── Cargar dependencias y resultados CPM
  const cargarDependencias = useCallback(async () => {
    if (!versionId) return
    setLoading(true)
    try {
      const [resDeps, resCpm] = await Promise.all([
        fetch(`${API}/prog-obra/${cid}/versiones/${versionId}/dependencias`, { headers: hdrs }),
        fetch(`${API}/prog-obra/${cid}/versiones/${versionId}/cpm-resultados`, { headers: hdrs }),
      ])
      if (resDeps.ok) setDeps(await resDeps.json())
      if (resCpm.ok) {
        const cpmData = await resCpm.json()
        const resultados = cpmData.resultados || []
        setCpmDirty(!!cpmData.cpm_dirty)
        setCpmResultados(resultados)
        onCpmCalculated?.(resultados)
      }
    } catch {
      // silencioso
    } finally {
      setLoading(false)
    }
  }, [versionId, cid, API, token])

  useEffect(() => {
    cargarDependencias()
  }, [cargarDependencias])

  // ── Cargar capítulos del PK destino cuando cambia la selección
  useEffect(() => {
    if (!formPkDest || !versionId) {
      setCapsDest([])
      setFormCapDest('')
      return
    }
    setLoadingCapsDest(true)
    fetch(
      `${API}/prog-obra/${cid}/versiones/${versionId}/capitulos-pk?pk_id=${encodeURIComponent(formPkDest)}`,
      { headers: hdrs },
    )
      .then((r) => (r.ok ? r.json() : { capitulos: [] }))
      .then((d) => {
        const caps = d.capitulos || []
        setCapsDest(caps)
        setFormCapDest(caps[0] || '')
      })
      .catch(() => setCapsDest([]))
      .finally(() => setLoadingCapsDest(false))
  }, [formPkDest, versionId, cid, API, token])

  // ── Agregar dependencia
  const handleAgregar = async () => {
    setFormError(null)
    if (!formCapOrigen || !formPkDest || !formCapDest) {
      setFormError('Completa todos los campos del origen y destino.')
      return
    }
    // Validar auto-dependencia en cliente
    if (activePk === formPkDest && formCapOrigen === formCapDest) {
      setFormError('Un capítulo no puede depender de sí mismo.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(
        `${API}/prog-obra/${cid}/versiones/${versionId}/dependencias`,
        {
          method: 'POST',
          headers: hdrs,
          body: JSON.stringify({
            pk_id_origen: activePk,
            capitulo_origen: formCapOrigen,
            pk_id_destino: formPkDest,
            capitulo_destino: formCapDest,
            tipo: formTipo,
            lag_dias: parseInt(formLag, 10) || 0,
          }),
        },
      )
      const data = await res.json()
      if (!res.ok) {
        setFormError(data?.detail || 'Error al agregar dependencia.')
        return
      }
      setDeps((prev) => [...prev, data])
      setCpmDirty(true)
      // Resetear solo destino, mantener tipo y lag para agilizar carga masiva
      setFormPkDest('')
      setFormCapDest('')
      setCapsDest([])
      showToast?.('Dependencia agregada.', 'ok')
    } catch {
      setFormError('Error de red al agregar dependencia.')
    } finally {
      setSaving(false)
    }
  }

  // ── Eliminar dependencia
  const handleEliminar = async (depId) => {
    if (!window.confirm('¿Eliminar esta dependencia?')) return
    setDeletingId(depId)
    try {
      const res = await fetch(
        `${API}/prog-obra/${cid}/versiones/${versionId}/dependencias/${depId}`,
        { method: 'DELETE', headers: hdrs },
      )
      if (!res.ok) {
        showToast?.('Error al eliminar dependencia.', 'err')
        return
      }
      setDeps((prev) => prev.filter((d) => d.id !== depId))
      setCpmDirty(true)
      showToast?.('Dependencia eliminada.', 'ok')
    } catch {
      showToast?.('Error de red al eliminar.', 'err')
    } finally {
      setDeletingId(null)
    }
  }

  // ── Calcular CPM
  const handleCalcularCpm = async () => {
    setCpmCalculando(true)
    try {
      const res = await fetch(
        `${API}/prog-obra/${cid}/versiones/${versionId}/calcular-cpm`,
        { method: 'POST', headers: hdrs },
      )
      const data = await res.json()
      if (!res.ok) {
        showToast?.(data?.detail || 'Error en CPM.', 'err')
        return
      }
      setCpmDirty(false)
      showToast?.(
        `CPM calculado: ${data.ruta_critica?.length || 0} capítulos en ruta crítica. ${data.tiempo_ms} ms`,
        'ok',
      )
      // Recargar resultados
      await cargarDependencias()
      if (data.cascada_afectados?.length > 0) {
        const names = data.cascada_afectados.map((n) => `${n.pk_id}/${n.capitulo}`).join(', ')
        showToast?.(`Cascada: fechas actualizadas en ${names}`, 'info')
      }
    } catch {
      showToast?.('Error de red al calcular CPM.', 'err')
    } finally {
      setCpmCalculando(false)
    }
  }

  // ── Filtrar deps del PK activo (origen o destino)
  const depsDelPk = deps.filter(
    (d) => d.pk_id_origen === activePk || d.pk_id_destino === activePk,
  )

  // ── Ruta crítica del PK activo
  const criticosPk = cpmResultados
    .filter((r) => r.pk_id === activePk && r.es_ruta_critica)
    .map((r) => r.capitulo)

  const pkDestinoOptions = (allPkIds || []).filter(
    (pk) => !(pk === activePk && formCapOrigen === formCapDest),
  )

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Cabecera con botón CPM ────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <GitFork size={16} color={t.primary} />
          <span style={{ fontWeight: 700, fontSize: 'var(--cc-sm)', color: t.text }}>
            Dependencias CPM — PK {activePk}
          </span>
          {cpmDirty && (
            <span style={{
              fontSize: 'var(--cc-caption)', background: '#FEF3C7', color: '#92400E',
              border: '1px solid #FDE68A', borderRadius: 4, padding: '2px 6px',
            }}>
              CPM desactualizado
            </span>
          )}
          {!cpmDirty && criticosPk.length > 0 && (
            <span style={{
              fontSize: 'var(--cc-caption)', background: '#FEE2E2', color: '#991B1B',
              border: '1px solid #FECACA', borderRadius: 4, padding: '2px 6px',
            }}>
              ⚠ Ruta crítica: {criticosPk.join(', ')}
            </span>
          )}
        </div>
        <button
          type="button"
          disabled={cpmCalculando || !versionId}
          onClick={handleCalcularCpm}
          style={{
            padding: '6px 14px',
            fontSize: 'var(--cc-caption)',
            fontWeight: 600,
            borderRadius: 6,
            border: `1px solid ${t.primary}`,
            background: t.bgCard,
            color: t.primary,
            cursor: cpmCalculando ? 'wait' : 'pointer',
            opacity: cpmCalculando ? 0.7 : 1,
          }}
        >
          {cpmCalculando ? 'Calculando…' : '▷ Calcular CPM'}
        </button>
      </div>

      {/* ── Tabla de dependencias ──────────────────────────────────────────── */}
      <div>
        <div style={{ fontWeight: 600, fontSize: 'var(--cc-caption)', color: t.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Dependencias definidas
        </div>
        {loading ? (
          <div style={{ color: t.textMuted, fontSize: 'var(--cc-caption)', padding: '8px 0' }}>Cargando…</div>
        ) : depsDelPk.length === 0 ? (
          <div style={{ color: t.textMuted, fontSize: 'var(--cc-caption)', padding: '10px 0', fontStyle: 'italic' }}>
            Sin dependencias definidas para este PK.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 'var(--cc-caption)' }}>
              <thead>
                <tr style={{ background: t.bg, borderBottom: `1px solid ${t.border}` }}>
                  {['PK Origen', 'Capítulo Origen', 'Tipo', 'Lag (días h.)', 'PK Destino', 'Capítulo Destino', ''].map((h) => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: t.textMuted, whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {depsDelPk.map((dep) => {
                  const esOrigen = dep.pk_id_origen === activePk
                  return (
                    <tr
                      key={dep.id}
                      style={{ borderBottom: `1px solid ${t.border}22`, background: esOrigen ? `${t.primary}08` : 'transparent' }}
                    >
                      <td style={{ padding: '6px 10px', color: t.text, fontWeight: esOrigen ? 600 : 400 }}>
                        {dep.pk_id_origen}
                      </td>
                      <td style={{ padding: '6px 10px', color: t.text }}>{dep.capitulo_origen}</td>
                      <td style={{ padding: '6px 10px' }}>
                        <TipoBadge tipo={dep.tipo} t={t} />
                      </td>
                      <td style={{ padding: '6px 10px', color: t.text, textAlign: 'center' }}>
                        {dep.lag_dias ?? 0}
                      </td>
                      <td style={{ padding: '6px 10px', color: t.text, fontWeight: !esOrigen ? 600 : 400 }}>
                        {dep.pk_id_destino}
                      </td>
                      <td style={{ padding: '6px 10px', color: t.text }}>{dep.capitulo_destino}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                        {editable && (
                          <button
                            type="button"
                            disabled={deletingId === dep.id}
                            onClick={() => handleEliminar(dep.id)}
                            title="Eliminar dependencia"
                            style={{
                              border: 'none', background: 'transparent', cursor: 'pointer',
                              color: '#ef4444', opacity: deletingId === dep.id ? 0.5 : 1, padding: 4,
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Formulario nueva dependencia ──────────────────────────────────── */}
      {editable && (
        <div style={{
          border: `1px solid ${t.border}`,
          borderRadius: 8,
          padding: '14px 16px',
          background: t.bg,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          <div style={{ fontWeight: 600, fontSize: 'var(--cc-caption)', color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={13} /> Nueva dependencia
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
            {/* Origen: PK fijo */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>PK Origen</label>
              <div style={{ ...inputStyle(t), opacity: 0.7, cursor: 'default' }}>{activePk}</div>
            </div>

            {/* Origen: Capítulo */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>Capítulo Origen</label>
              <select
                value={formCapOrigen}
                onChange={(e) => setFormCapOrigen(e.target.value)}
                style={inputStyle(t)}
              >
                {capitulosOrigen.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Tipo con tooltip */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
                Tipo
                <TipoInfoTooltip t={t} />
              </label>
              <select
                value={formTipo}
                onChange={(e) => setFormTipo(e.target.value)}
                style={inputStyle(t)}
              >
                {TIPOS.map((tp) => (
                  <option key={tp.value} value={tp.value} title={tp.desc}>{tp.label}</option>
                ))}
              </select>
            </div>

            {/* Lag */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>Lag (días h.)</label>
              <input
                type="number"
                value={formLag}
                onChange={(e) => setFormLag(e.target.value)}
                style={{ ...inputStyle(t), width: '100%' }}
                placeholder="0"
              />
            </div>

            {/* Destino: PK */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>PK Destino</label>
              <select
                value={formPkDest}
                onChange={(e) => { setFormPkDest(e.target.value); setFormCapDest('') }}
                style={inputStyle(t)}
              >
                <option value="">— Seleccionar —</option>
                {pkDestinoOptions.map((pk) => (
                  <option key={pk} value={pk}>{pk}</option>
                ))}
              </select>
            </div>

            {/* Destino: Capítulo */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>Capítulo Destino</label>
              <select
                value={formCapDest}
                onChange={(e) => setFormCapDest(e.target.value)}
                disabled={!formPkDest || loadingCapsDest}
                style={{ ...inputStyle(t), opacity: !formPkDest ? 0.5 : 1 }}
              >
                {loadingCapsDest ? (
                  <option>Cargando…</option>
                ) : capsDest.length === 0 ? (
                  <option value="">— Seleccionar PK —</option>
                ) : (
                  capsDest.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))
                )}
              </select>
            </div>

            {/* Botón agregar */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 4 }}>
              <label style={{ fontSize: 'var(--cc-caption)', visibility: 'hidden' }}>_</label>
              <button
                type="button"
                disabled={saving || !formPkDest || !formCapDest || !formCapOrigen}
                onClick={handleAgregar}
                style={{
                  padding: '6px 14px',
                  fontSize: 'var(--cc-sm)',
                  fontWeight: 600,
                  borderRadius: 6,
                  border: `1px solid ${t.primary}`,
                  background: t.primary,
                  color: '#fff',
                  cursor: saving || !formPkDest || !formCapDest ? 'not-allowed' : 'pointer',
                  opacity: saving || !formPkDest || !formCapDest ? 0.6 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {saving ? 'Guardando…' : '+ Agregar'}
              </button>
            </div>
          </div>

          {/* Error de ciclo u otro */}
          {formError && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              background: '#FEF2F2', border: '1px solid #FECACA',
              borderRadius: 6, padding: '10px 12px',
              color: '#991B1B', fontSize: 'var(--cc-caption)',
            }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ whiteSpace: 'pre-wrap' }}>{formError}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Resultados CPM (solo si hay datos) ───────────────────────────── */}
      {cpmResultados.length > 0 && (
        <CpmResumenTabla resultados={cpmResultados} activePk={activePk} t={t} />
      )}
    </div>
  )
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function TipoBadge({ tipo, t }) {
  const colors = {
    FS: { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
    SS: { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0' },
    FF: { bg: '#FFF7ED', text: '#9A3412', border: '#FED7AA' },
    SF: { bg: '#FDF4FF', text: '#6B21A8', border: '#E9D5FF' },
  }
  const c = colors[tipo] || { bg: t.bg, text: t.text, border: t.border }
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 7px',
      borderRadius: 4,
      fontSize: 'var(--cc-caption)',
      fontWeight: 700,
      background: c.bg,
      color: c.text,
      border: `1px solid ${c.border}`,
    }}>
      {tipo}
    </span>
  )
}

function TipoInfoTooltip({ t }) {
  const [show, setShow] = useState(false)
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', cursor: 'help' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <Info size={11} color={t.textMuted} />
      {show && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 100,
          background: t.bgCard, border: `1px solid ${t.border}`,
          borderRadius: 6, padding: '8px 10px', width: 240,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          fontSize: 'var(--cc-caption)', color: t.text, marginTop: 4,
        }}>
          {TIPOS.map((tp) => (
            <div key={tp.value} style={{ marginBottom: 5 }}>
              <strong style={{ color: t.primary }}>{tp.label}</strong> — {tp.desc}
            </div>
          ))}
        </div>
      )}
    </span>
  )
}

function CpmResumenTabla({ resultados, activePk, t }) {
  const del_pk = resultados.filter((r) => r.pk_id === activePk)
  if (del_pk.length === 0) return null

  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 'var(--cc-caption)', color: t.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Resultados CPM — PK {activePk}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 'var(--cc-caption)' }}>
          <thead>
            <tr style={{ background: t.bg, borderBottom: `1px solid ${t.border}` }}>
              {['Capítulo', 'Inicio temprano', 'Fin temprano', 'Inicio tardío', 'Fin tardío', 'Holgura total', 'Ruta crítica'].map((h) => (
                <th key={h} style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 600, color: t.textMuted, whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {del_pk.map((r) => (
              <tr
                key={r.capitulo}
                style={{
                  borderBottom: `1px solid ${t.border}22`,
                  background: r.es_ruta_critica ? '#FEF2F2' : 'transparent',
                }}
              >
                <td style={{ padding: '5px 8px', fontWeight: 600, color: t.text }}>{r.capitulo}</td>
                <td style={{ padding: '5px 8px', color: t.text }}>{r.fecha_inicio_temprana || '—'}</td>
                <td style={{ padding: '5px 8px', color: t.text }}>{r.fecha_fin_temprana || '—'}</td>
                <td style={{ padding: '5px 8px', color: t.textMuted }}>{r.fecha_inicio_tardia || '—'}</td>
                <td style={{ padding: '5px 8px', color: t.textMuted }}>{r.fecha_fin_tardia || '—'}</td>
                <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                  <span style={{
                    fontWeight: 700,
                    color: r.holgura_total === 0 ? '#ef4444' : r.holgura_total <= 5 ? '#f59e0b' : '#16a34a',
                  }}>
                    {r.holgura_total}
                  </span>
                </td>
                <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                  {r.es_ruta_critica ? (
                    <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 11 }}>⚠ CRÍTICO</span>
                  ) : (
                    <span style={{ color: '#16a34a' }}>✓</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

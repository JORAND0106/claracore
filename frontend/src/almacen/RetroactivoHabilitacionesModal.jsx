import { useCallback, useEffect, useState } from 'react'
import CcModalBrandHeader from '../components/CcModalBrandHeader'
import { nowDatetimeLocalColombia } from './almacenShared'

function plusDaysLocal(days) {
  const base = nowDatetimeLocalColombia() // YYYY-MM-DDTHH:mm
  const d = new Date(`${base}:00`)
  if (Number.isNaN(d.getTime())) {
    const n = new Date()
    n.setDate(n.getDate() + days)
    return n.toISOString().slice(0, 16)
  }
  d.setDate(d.getDate() + days)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function RetroactivoHabilitacionesModal({ api, onClose, theme }) {
  const [lista, setLista] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [candidatos, setCandidatos] = useState([])
  const [seleccion, setSeleccion] = useState([])
  const [desde, setDesde] = useState(() => nowDatetimeLocalColombia())
  const [hasta, setHasta] = useState(() => plusDaysLocal(7))
  const [motivo, setMotivo] = useState('')
  const [ampliarId, setAmpliarId] = useState(null)
  const [ampliarHasta, setAmpliarHasta] = useState('')

  const reload = useCallback(() => {
    setError('')
    return api.listHabilitacionesRetroactivo()
      .then(setLista)
      .catch((e) => setError(e.message))
  }, [api])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      api.searchUsuariosReceptorObra(q || '')
        .then((rows) => { if (!cancelled) setCandidatos(Array.isArray(rows) ? rows : []) })
        .catch(() => { if (!cancelled) setCandidatos([]) })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [api, q])

  const toggleUser = (id) => {
    setSeleccion((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const crear = async () => {
    if (!seleccion.length) {
      setError('Seleccione al menos un usuario.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.crearHabilitacionRetroactivo({
        usuario_ids: seleccion,
        desde: new Date(`${desde}:00`).toISOString(),
        hasta: new Date(`${hasta}:00`).toISOString(),
        motivo: motivo || null,
      })
      setSeleccion([])
      setMotivo('')
      await reload()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const revocar = async (id) => {
    setBusy(true)
    setError('')
    try {
      await api.revocarHabilitacionRetroactivo(id)
      await reload()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const ampliar = async () => {
    if (!ampliarId || !ampliarHasta) return
    setBusy(true)
    setError('')
    try {
      await api.ampliarHabilitacionRetroactivo(ampliarId, {
        hasta: new Date(`${ampliarHasta}:00`).toISOString(),
      })
      setAmpliarId(null)
      setAmpliarHasta('')
      await reload()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: 16, overflow: 'auto',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(720px, 100%)',
          background: '#fff',
          borderRadius: 14,
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
          marginTop: 24,
        }}
        onClick={(e) => e.stopPropagation()}
        data-testid="retroactivo-hab-modal"
      >
        <CcModalBrandHeader
          title="Habilitar modo Retroactivo"
          subtitle="Ventana temporal para actualizar el almacén con fechas del hecho"
          onClose={onClose}
          theme={theme}
        />
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div style={{ background: '#fef2f2', color: '#b91c1c', padding: 10, borderRadius: 8 }}>{error}</div>
          )}

          <div style={{ display: 'grid', gap: 8 }}>
            <strong>Nueva habilitación</strong>
            <input
              placeholder="Buscar usuario…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: '1px solid #cbd5e1' }}
            />
            <div style={{ maxHeight: 140, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              {candidatos.map((u) => {
                const id = Number(u.id || u.usuario_id)
                const selected = seleccion.includes(id)
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleUser(id)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '8px 10px', border: 'none', cursor: 'pointer',
                      background: selected ? '#ffedd5' : '#fff',
                      fontWeight: selected ? 700 : 500,
                    }}
                  >
                    {u.nombre || u.nombre_completo || `Usuario #${id}`}
                  </button>
                )
              })}
              {!candidatos.length && (
                <div style={{ padding: 10, color: '#64748b' }}>Sin coincidencias</div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                Desde
                <input type="datetime-local" value={desde} onChange={(e) => setDesde(e.target.value)} />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                Hasta
                <input type="datetime-local" value={hasta} onChange={(e) => setHasta(e.target.value)} />
              </label>
            </div>
            <input
              placeholder="Motivo (opcional)"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: '1px solid #cbd5e1' }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={crear}
              style={{
                background: '#c2410c', color: '#fff', border: 'none', borderRadius: 10,
                padding: '12px 14px', fontWeight: 800, cursor: 'pointer',
              }}
            >
              {busy ? 'Guardando…' : `Habilitar (${seleccion.length})`}
            </button>
          </div>

          <div>
            <strong>Habilitaciones</strong>
            <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
              {(lista || []).map((h) => (
                <div
                  key={h.id}
                  style={{
                    border: '1px solid #e2e8f0', borderRadius: 10, padding: 10,
                    background: h.vigente ? '#fff7ed' : '#f8fafc',
                  }}
                >
                  <div style={{ fontWeight: 700 }}>Usuario #{h.usuario_id}</div>
                  <div style={{ fontSize: 13, color: '#475569' }}>
                    {String(h.desde || '').slice(0, 16)} → {String(h.hasta || '').slice(0, 16)}
                    {h.vigente ? ' · vigente' : h.revocado_at ? ' · revocada' : ' · vencida'}
                  </div>
                  {h.motivo && <div style={{ fontSize: 13 }}>{h.motivo}</div>}
                  {h.vigente && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                      <button type="button" disabled={busy} onClick={() => {
                        setAmpliarId(h.id)
                        setAmpliarHasta(plusDaysLocal(7))
                      }}
                      >
                        Ampliar
                      </button>
                      <button type="button" disabled={busy} onClick={() => revocar(h.id)}>
                        Revocar
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {!lista?.length && <div style={{ color: '#64748b' }}>No hay habilitaciones.</div>}
            </div>
          </div>

          {ampliarId != null && (
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, display: 'grid', gap: 8 }}>
              <strong>Ampliar habilitación #{ampliarId}</strong>
              <input type="datetime-local" value={ampliarHasta} onChange={(e) => setAmpliarHasta(e.target.value)} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={ampliar} disabled={busy}>Confirmar ampliación</button>
                <button type="button" onClick={() => setAmpliarId(null)}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Herramienta exclusiva Desarrollador: mover registros entre actas RPO.
 * Flujo: selección origen/destino → preview con checks → resultado.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'

const CONFIRM_SELLADOS = 'INCLUIR-SELLADOS'

function labelActa(a) {
  if (!a) return '—'
  if (a.label) return a.label
  if (a.numero_rpo != null) return `Acta RPO ${a.numero_rpo}`
  return `Acta #${a.id}`
}

export default function SicoeMoverRegistrosActasModal({
  t,
  API_URL,
  token,
  contratoId,
  contratoLabel,
  onClose,
  onDone,
}) {
  const hdrs = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token],
  )

  const [paso, setPaso] = useState('seleccion') // seleccion | preview | resultado
  const [actas, setActas] = useState([])
  const [origenId, setOrigenId] = useState('')
  const [destinoId, setDestinoId] = useState('')
  const [cargandoActas, setCargandoActas] = useState(true)
  const [cargandoPreview, setCargandoPreview] = useState(false)
  const [ejecutando, setEjecutando] = useState(false)
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(null)
  const [seleccion, setSeleccion] = useState(() => new Set())
  const [confirmarSellados, setConfirmarSellados] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [resultado, setResultado] = useState(null)

  useEffect(() => {
    if (!contratoId) return
    let cancel = false
    setCargandoActas(true)
    setError(null)
    fetch(`${API_URL}/sicoe-obra/${contratoId}/actas-rpo`, { headers: hdrs })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(typeof j?.detail === 'string' ? j.detail : `Error ${r.status}`)
        return j
      })
      .then((j) => {
        if (cancel) return
        setActas(Array.isArray(j.actas) ? j.actas : [])
      })
      .catch((e) => {
        if (!cancel) setError(e?.message || String(e))
      })
      .finally(() => {
        if (!cancel) setCargandoActas(false)
      })
    return () => { cancel = true }
  }, [API_URL, contratoId, hdrs])

  const idsSeleccionados = useMemo(() => [...seleccion], [seleccion])
  const regsPreview = preview?.registros || []
  const selladosSel = useMemo(
    () => regsPreview.filter((r) => seleccion.has(r.id) && r.sellado),
    [regsPreview, seleccion],
  )
  const nSel = seleccion.size
  const nSelSellados = selladosSel.length

  const cargarPreview = useCallback(async () => {
    setError(null)
    if (!origenId || !destinoId) {
      setError('Seleccione acta de origen y de destino.')
      return
    }
    if (String(origenId) === String(destinoId)) {
      setError('Origen y destino deben ser distintas.')
      return
    }
    setCargandoPreview(true)
    try {
      const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/registros/mover-entre-actas/preview`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({
          acta_origen_id: Number(origenId),
          acta_destino_id: Number(destinoId),
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        const d = j?.detail
        throw new Error(typeof d === 'string' ? d : `Error ${res.status}`)
      }
      setPreview(j)
      const inicial = new Set(
        (j.registros || [])
          .filter((r) => r.seleccionable_por_defecto)
          .map((r) => r.id),
      )
      setSeleccion(inicial)
      setConfirmarSellados(false)
      setPaso('preview')
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setCargandoPreview(false)
    }
  }, [API_URL, contratoId, destinoId, hdrs, origenId])

  const toggleUno = (id, sellado) => {
    setSeleccion((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else {
        if (sellado && !confirmarSellados) return prev
        next.add(id)
      }
      return next
    })
  }

  const marcarTodosNoSellados = () => {
    setSeleccion(new Set(regsPreview.filter((r) => !r.sellado).map((r) => r.id)))
  }

  const desmarcarTodos = () => setSeleccion(new Set())

  const ejecutar = async () => {
    setError(null)
    if (nSel < 1) {
      setError('Seleccione al menos un registro.')
      return
    }
    if (nSelSellados > 0 && !confirmarSellados) {
      setError('Hay registros sellados seleccionados: confirme su inclusión con la casilla dedicada.')
      return
    }
    setEjecutando(true)
    try {
      const body = {
        acta_origen_id: Number(origenId),
        acta_destino_id: Number(destinoId),
        registro_ids: idsSeleccionados,
        incluir_sellados: nSelSellados > 0,
        motivo: (motivo || '').trim() || null,
      }
      if (nSelSellados > 0) {
        body.confirmacion_sellados = CONFIRM_SELLADOS
      }
      const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/registros/mover-entre-actas`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        const d = j?.detail
        throw new Error(typeof d === 'string' ? d : `Error ${res.status}`)
      }
      setResultado(j)
      setPaso('resultado')
      onDone?.(j)
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setEjecutando(false)
    }
  }

  const overlay = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    zIndex: 10080,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  }
  const card = {
    background: t.bgCard,
    color: t.text,
    border: `1px solid ${t.border}`,
    borderRadius: 14,
    width: 'min(920px, 100%)',
    maxHeight: '92vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: t.shadow || '0 12px 40px rgba(0,0,0,0.35)',
  }
  const btnPrimary = {
    background: t.primary,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 16px',
    fontWeight: 800,
    fontSize: 'var(--cc-sm)',
    cursor: 'pointer',
  }
  const btnGhost = {
    background: 'transparent',
    color: t.textMuted,
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: '10px 16px',
    fontWeight: 700,
    fontSize: 'var(--cc-sm)',
    cursor: 'pointer',
  }
  const selectSt = {
    width: '100%',
    background: t.bg,
    color: t.text,
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 'var(--cc-sm)',
  }

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-labelledby="sicoe-mover-actas-title">
      <div style={card}>
        <div style={{
          padding: '14px 18px',
          borderBottom: `1px solid ${t.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <div>
            <div id="sicoe-mover-actas-title" style={{ fontWeight: 900, fontSize: 'var(--cc-h1)', color: t.text }}>
              Mover registros entre actas
            </div>
            <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginTop: 2 }}>
              Solo Desarrollador · {contratoLabel || `Contrato #${contratoId}`}
            </div>
          </div>
          <button type="button" onClick={onClose} style={btnGhost} aria-label="Cerrar">✕</button>
        </div>

        <div style={{ padding: 18, overflow: 'auto', flex: 1 }}>
          {error && (
            <div style={{
              marginBottom: 12,
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(220,38,38,0.12)',
              border: '1px solid rgba(220,38,38,0.4)',
              color: '#b91c1c',
              fontSize: 'var(--cc-sm)',
              fontWeight: 700,
            }}>
              {error}
            </div>
          )}

          {paso === 'seleccion' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ margin: 0, color: t.textMuted, fontSize: 'var(--cc-sm)', lineHeight: 1.45 }}>
                Elija el acta RPO de origen y la de destino. Luego verá la lista de registros para confirmar el movimiento.
                El acta original de cada registro se conserva en el respaldo existente (<code>acta_rpo_id_backup_swap</code>).
              </p>
              {cargandoActas ? (
                <div style={{ color: t.textMuted }}>Cargando actas…</div>
              ) : (
                <>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 'var(--cc-label)', fontWeight: 800, color: t.textMuted }}>Acta de origen</span>
                    <select value={origenId} onChange={(e) => setOrigenId(e.target.value)} style={selectSt}>
                      <option value="">— Seleccionar —</option>
                      {actas.map((a) => (
                        <option key={a.id} value={a.id}>{labelActa(a)}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 'var(--cc-label)', fontWeight: 800, color: t.textMuted }}>Acta de destino</span>
                    <select value={destinoId} onChange={(e) => setDestinoId(e.target.value)} style={selectSt}>
                      <option value="">— Seleccionar —</option>
                      {actas.map((a) => (
                        <option key={a.id} value={a.id} disabled={String(a.id) === String(origenId)}>
                          {labelActa(a)}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          )}

          {paso === 'preview' && preview && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 10,
                padding: 12,
                borderRadius: 10,
                background: t.bg,
                border: `1px solid ${t.border}`,
              }}>
                <div>
                  <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, fontWeight: 700 }}>Origen</div>
                  <div style={{ fontWeight: 800 }}>{labelActa(preview.acta_origen)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, fontWeight: 700 }}>Destino</div>
                  <div style={{ fontWeight: 800 }}>{labelActa(preview.acta_destino)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, fontWeight: 700 }}>Seleccionados</div>
                  <div style={{ fontWeight: 800 }}>{nSel} / {preview.totales?.total ?? 0}</div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, fontWeight: 700 }}>Sellados en selección</div>
                  <div style={{ fontWeight: 800, color: nSelSellados ? '#b45309' : t.text }}>{nSelSellados}</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button type="button" onClick={marcarTodosNoSellados} style={btnGhost}>Marcar no sellados</button>
                <button type="button" onClick={desmarcarTodos} style={btnGhost}>Desmarcar todos</button>
              </div>

              {preview.totales?.sellados > 0 && (
                <label style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  padding: 12,
                  borderRadius: 10,
                  background: 'rgba(234,179,8,0.12)',
                  border: '1px solid rgba(234,179,8,0.45)',
                  fontSize: 'var(--cc-sm)',
                  lineHeight: 1.45,
                }}>
                  <input
                    type="checkbox"
                    checked={confirmarSellados}
                    onChange={(e) => {
                      const on = e.target.checked
                      setConfirmarSellados(on)
                      if (!on) {
                        setSeleccion((prev) => {
                          const next = new Set(prev)
                          regsPreview.filter((r) => r.sellado).forEach((r) => next.delete(r.id))
                          return next
                        })
                      }
                    }}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <strong>Confirmo incluir registros ya aprobados (sellados/bloqueados).</strong>
                    {' '}Por defecto no se mueven. Debe marcar esta casilla y luego seleccionarlos en la lista.
                    Confirmación técnica: <code>{CONFIRM_SELLADOS}</code>.
                  </span>
                </label>
              )}

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 'var(--cc-label)', fontWeight: 800, color: t.textMuted }}>Motivo (opcional, auditoría)</span>
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej. Acta vencida — traslado a RPO vigente"
                  style={{ ...selectSt, boxSizing: 'border-box' }}
                />
              </label>

              <div style={{
                border: `1px solid ${t.border}`,
                borderRadius: 10,
                maxHeight: 360,
                overflow: 'auto',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)' }}>
                  <thead>
                    <tr style={{ position: 'sticky', top: 0, background: t.bgCard, zIndex: 1 }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: `1px solid ${t.border}` }} />
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: `1px solid ${t.border}`, color: t.textMuted }}>Reg.</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: `1px solid ${t.border}`, color: t.textMuted }}>Ítem</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: `1px solid ${t.border}`, color: t.textMuted }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regsPreview.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ padding: 16, color: t.textMuted, textAlign: 'center' }}>
                          No hay registros en el acta de origen.
                        </td>
                      </tr>
                    ) : regsPreview.map((r) => {
                      const disabledSellado = r.sellado && !confirmarSellados
                      return (
                        <tr
                          key={r.id}
                          style={{
                            background: r.sellado ? 'rgba(234,179,8,0.08)' : 'transparent',
                            opacity: disabledSellado ? 0.65 : 1,
                          }}
                        >
                          <td style={{ padding: '8px 10px', borderBottom: `1px solid ${t.border}` }}>
                            <input
                              type="checkbox"
                              checked={seleccion.has(r.id)}
                              disabled={disabledSellado}
                              onChange={() => toggleUno(r.id, r.sellado)}
                              title={disabledSellado ? 'Confirme inclusión de sellados primero' : undefined}
                            />
                          </td>
                          <td style={{ padding: '8px 10px', borderBottom: `1px solid ${t.border}`, fontWeight: 700 }}>
                            #{r.numero_registro ?? r.id}
                          </td>
                          <td style={{ padding: '8px 10px', borderBottom: `1px solid ${t.border}` }}>
                            <div style={{ fontWeight: 600 }}>{r.item_numero || '—'}</div>
                            <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420 }}>
                              {r.item_descripcion || r.capitulo || ''}
                            </div>
                          </td>
                          <td style={{ padding: '8px 10px', borderBottom: `1px solid ${t.border}` }}>
                            {r.sellado ? (
                              <span style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: 999,
                                background: 'rgba(234,179,8,0.2)',
                                color: '#92400e',
                                fontWeight: 800,
                                fontSize: 'var(--cc-caption)',
                              }}>
                                🔒 Sellado{r.bloqueado ? ' / bloqueado' : ''}
                              </span>
                            ) : (
                              <span style={{ color: t.textMuted, fontSize: 'var(--cc-caption)' }}>Editable</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {preview.truncado && (
                <div style={{ fontSize: 'var(--cc-caption)', color: '#b45309', fontWeight: 700 }}>
                  Vista limitada a {preview.tope_registros} registros. Reduzca el acta o mueva por lotes.
                </div>
              )}
            </div>
          )}

          {paso === 'resultado' && resultado && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{
                padding: 14,
                borderRadius: 10,
                background: 'rgba(22,163,74,0.1)',
                border: '1px solid rgba(22,163,74,0.35)',
              }}>
                <div style={{ fontWeight: 900, fontSize: 'var(--cc-md)', color: '#15803d' }}>
                  Movimiento completado
                </div>
                <div style={{ marginTop: 6, fontSize: 'var(--cc-sm)', color: t.text, lineHeight: 1.5 }}>
                  {resultado.totales?.movidos ?? 0} registro(s) de{' '}
                  <strong>{labelActa(resultado.acta_origen)}</strong>
                  {' → '}
                  <strong>{labelActa(resultado.acta_destino)}</strong>
                  {(resultado.totales?.no_movidos || 0) > 0 && (
                    <> · {resultado.totales.no_movidos} sin mover</>
                  )}
                </div>
              </div>
              <div style={{
                border: `1px solid ${t.border}`,
                borderRadius: 10,
                maxHeight: 320,
                overflow: 'auto',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)' }}>
                  <thead>
                    <tr style={{ position: 'sticky', top: 0, background: t.bgCard }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: `1px solid ${t.border}`, color: t.textMuted }}>Reg.</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: `1px solid ${t.border}`, color: t.textMuted }}>De</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: `1px solid ${t.border}`, color: t.textMuted }}>A</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: `1px solid ${t.border}`, color: t.textMuted }}>Nota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(resultado.movidos || []).map((r) => (
                      <tr key={`m-${r.id}`}>
                        <td style={{ padding: '8px 10px', borderBottom: `1px solid ${t.border}`, fontWeight: 700 }}>#{r.numero_registro ?? r.id}</td>
                        <td style={{ padding: '8px 10px', borderBottom: `1px solid ${t.border}` }}>{labelActa(resultado.acta_origen)}</td>
                        <td style={{ padding: '8px 10px', borderBottom: `1px solid ${t.border}` }}>{labelActa(resultado.acta_destino)}</td>
                        <td style={{ padding: '8px 10px', borderBottom: `1px solid ${t.border}`, color: t.textMuted }}>
                          {r.sellado ? 'Sellado incluido' : 'OK'}
                        </td>
                      </tr>
                    ))}
                    {(resultado.no_movidos || []).map((r) => (
                      <tr key={`n-${r.id}`}>
                        <td style={{ padding: '8px 10px', borderBottom: `1px solid ${t.border}`, fontWeight: 700 }}>#{r.numero_registro ?? r.id}</td>
                        <td style={{ padding: '8px 10px', borderBottom: `1px solid ${t.border}` }} colSpan={2}>—</td>
                        <td style={{ padding: '8px 10px', borderBottom: `1px solid ${t.border}`, color: '#b91c1c' }}>Sin mover</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div style={{
          padding: '12px 18px',
          borderTop: `1px solid ${t.border}`,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 10,
          flexWrap: 'wrap',
        }}>
          {paso === 'seleccion' && (
            <>
              <button type="button" onClick={onClose} style={btnGhost}>Cancelar</button>
              <button
                type="button"
                onClick={() => void cargarPreview()}
                disabled={cargandoPreview || cargandoActas || !origenId || !destinoId}
                style={{ ...btnPrimary, opacity: (cargandoPreview || !origenId || !destinoId) ? 0.55 : 1 }}
              >
                {cargandoPreview ? 'Cargando…' : 'Vista previa'}
              </button>
            </>
          )}
          {paso === 'preview' && (
            <>
              <button type="button" onClick={() => { setPaso('seleccion'); setError(null) }} style={btnGhost} disabled={ejecutando}>
                Atrás
              </button>
              <button
                type="button"
                onClick={() => void ejecutar()}
                disabled={ejecutando || nSel < 1}
                style={{ ...btnPrimary, opacity: (ejecutando || nSel < 1) ? 0.55 : 1 }}
              >
                {ejecutando ? 'Moviendo…' : `Confirmar movimiento (${nSel})`}
              </button>
            </>
          )}
          {paso === 'resultado' && (
            <button type="button" onClick={onClose} style={btnPrimary}>Cerrar</button>
          )}
        </div>
      </div>
    </div>
  )
}

import { useMemo, useState } from 'react'

const inp = (t) => ({
  background: t.inputBg,
  border: `1px solid ${t.border}`,
  borderRadius: 6,
  padding: '6px 10px',
  color: t.text,
  fontSize: 'var(--cc-sm)',
  width: '100%',
  boxSizing: 'border-box',
})

const radioBtn = (activo, t) => ({
  fontSize: 'var(--cc-caption)',
  fontWeight: 700,
  padding: '4px 10px',
  borderRadius: 6,
  cursor: 'pointer',
  border: `1px solid ${activo ? t.primary : t.border}`,
  background: activo ? `${t.primary}18` : t.bg,
  color: activo ? t.primary : t.textMuted,
  whiteSpace: 'nowrap',
})

/**
 * Bloque Fechas + Usuario (creó / editó / validó) para el modal SicoeObra.
 */
export default function SicoeFiltroFechasUsuario({
  t,
  f,
  onChange,
  usuarios = [],
}) {
  const [busqUsuario, setBusqUsuario] = useState('')
  const [listaUsuariosOpen, setListaUsuariosOpen] = useState(false)

  const usuarioSel = useMemo(() => {
    const id = String(f.usuario_id || '').trim()
    if (!id) return null
    return (usuarios || []).find((u) => String(u.id) === id) || null
  }, [f.usuario_id, usuarios])

  const usuariosFiltrados = useMemo(() => {
    const q = String(busqUsuario || '').trim().toLowerCase()
    const base = (usuarios || []).filter((u) => u.activo !== false)
    if (!q) return base.slice(0, 40)
    return base
      .filter((u) => {
        const nom = `${u.nombre || ''} ${u.apellidos || ''} ${u.email || ''}`.toLowerCase()
        return nom.includes(q)
      })
      .slice(0, 40)
  }, [usuarios, busqUsuario])

  const patch = (p) => onChange({ ...p })

  const labelUsuario = usuarioSel
    ? `${usuarioSel.nombre || ''} ${usuarioSel.apellidos || ''}`.trim() || `Usuario ${usuarioSel.id}`
    : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted }}>Ámbito:</span>
        {[
          ['reporte', 'Reporte'],
          ['registro', 'Registro'],
        ].map(([val, lab]) => (
          <button key={val} type="button" onClick={() => patch({ ambitoFecha: val })} style={radioBtn(f.ambitoFecha === val, t)}>
            {lab}
          </button>
        ))}
        <span style={{ width: 1, height: 20, background: t.border, margin: '0 4px' }} />
        <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted }}>Tipo:</span>
        {[
          ['creacion', 'Creación'],
          ['modificacion', 'Modificación'],
        ].map(([val, lab]) => (
          <button key={val} type="button" onClick={() => patch({ tipoFecha: val })} style={radioBtn(f.tipoFecha === val, t)}>
            {lab}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted, display: 'block', marginBottom: 4 }}>Desde</label>
          <input type="date" value={f.fechaDesde || ''} onChange={(e) => patch({ fechaDesde: e.target.value })} style={inp(t)} />
        </div>
        <div>
          <label style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted, display: 'block', marginBottom: 4 }}>Hasta</label>
          <input type="date" value={f.fechaHasta || ''} onChange={(e) => patch({ fechaHasta: e.target.value })} style={inp(t)} />
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 12 }}>
        <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color: t.text, marginBottom: 8 }}>Usuario del contrato</div>
        <div style={{ position: 'relative' }}>
          <input
            placeholder="Buscar usuario…"
            value={usuarioSel ? labelUsuario : busqUsuario}
            onChange={(e) => {
              setBusqUsuario(e.target.value)
              patch({ usuario_id: '', usuarioLabel: '' })
              setListaUsuariosOpen(true)
            }}
            onFocus={() => setListaUsuariosOpen(true)}
            onBlur={() => setTimeout(() => setListaUsuariosOpen(false), 180)}
            style={inp(t)}
          />
          {f.usuario_id ? (
            <button
              type="button"
              onClick={() => {
                patch({ usuario_id: '', usuarioLabel: '' })
                setBusqUsuario('')
              }}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: t.textMuted,
                cursor: 'pointer',
                fontSize: 16,
              }}
            >
              ×
            </button>
          ) : null}
          {listaUsuariosOpen && usuariosFiltrados.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 60,
                background: t.bgCard,
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                maxHeight: 200,
                overflowY: 'auto',
                marginTop: 4,
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              }}
            >
              {usuariosFiltrados.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onMouseDown={() => {
                    const nom = `${u.nombre || ''} ${u.apellidos || ''}`.trim()
                    patch({ usuario_id: String(u.id), usuarioLabel: nom })
                    setBusqUsuario('')
                    setListaUsuariosOpen(false)
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 12px',
                    border: 'none',
                    borderBottom: `1px solid ${t.border}22`,
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: 'var(--cc-sm)',
                    color: t.text,
                  }}
                >
                  {`${u.nombre || ''} ${u.apellidos || ''}`.trim()}
                  {u.email ? <span style={{ color: t.textMuted, marginLeft: 6, fontSize: 'var(--cc-caption)' }}>{u.email}</span> : null}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted }}>Acción:</span>
          {[
            ['creo', 'Creó'],
            ['edito', 'Editó'],
            ['valido', 'Validó'],
          ].map(([val, lab]) => (
            <button
              key={val}
              type="button"
              disabled={!f.usuario_id}
              onClick={() => patch({ usuarioAccion: val })}
              style={{
                ...radioBtn(f.usuarioAccion === val, t),
                opacity: f.usuario_id ? 1 : 0.45,
                cursor: f.usuario_id ? 'pointer' : 'not-allowed',
              }}
            >
              {lab}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

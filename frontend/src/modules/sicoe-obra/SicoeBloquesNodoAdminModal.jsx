/**
 * Modal admin de biblioteca de bloques de nodo (CRUD sin programación).
 */
import { useEffect, useState } from 'react'
import { BLOQUE_FORMAS } from './sicoeBloquesNodo'
import {
  listarBloquesNodo,
  crearBloqueNodo,
  actualizarBloqueNodo,
  desactivarBloqueNodo,
} from './sicoeBloquesNodoApi'

const vacio = () => ({
  nombre: '',
  forma: 'circulo',
  ancho_m: '1.2',
  alto_m: '1.2',
  global_sistema: false,
})

export default function SicoeBloquesNodoAdminModal({
  t,
  API_URL,
  token,
  contratoId,
  esDesarrollador = false,
  onClose,
  onChanged,
}) {
  const [bloques, setBloques] = useState([])
  const [draft, setDraft] = useState(vacio())
  const [editId, setEditId] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [migracion, setMigracion] = useState(false)

  const cargar = async () => {
    setError('')
    try {
      const data = await listarBloquesNodo({
        API_URL,
        contratoId,
        token,
        incluirInactivos: false,
      })
      setMigracion(!!data?.migracion_pendiente)
      setBloques(Array.isArray(data?.bloques) ? data.bloques : [])
    } catch (e) {
      setError(e?.message || 'No se pudo cargar la biblioteca')
    }
  }

  useEffect(() => { void cargar() }, [API_URL, contratoId, token]) // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = async () => {
    setBusy(true)
    setError('')
    try {
      const body = {
        nombre: draft.nombre.trim(),
        forma: draft.forma,
        ancho_m: Number(draft.ancho_m),
        alto_m: Number(draft.alto_m),
        global_sistema: !!draft.global_sistema && esDesarrollador,
      }
      if (!body.nombre) throw new Error('Indique el nombre del bloque.')
      if (!(body.ancho_m > 0) || !(body.alto_m > 0)) throw new Error('Las medidas deben ser mayores que cero.')
      if (editId) {
        await actualizarBloqueNodo({ API_URL, contratoId, token, bloqueId: editId, body })
      } else {
        await crearBloqueNodo({ API_URL, contratoId, token, body })
      }
      setDraft(vacio())
      setEditId(null)
      await cargar()
      onChanged?.()
    } catch (e) {
      setError(e?.message || 'No se pudo guardar')
    } finally {
      setBusy(false)
    }
  }

  const editar = (b) => {
    setEditId(b.id)
    setDraft({
      nombre: b.nombre || '',
      forma: b.forma || 'circulo',
      ancho_m: String(b.ancho_m ?? 1),
      alto_m: String(b.alto_m ?? 1),
      global_sistema: b.contrato_id == null,
    })
  }

  const retirar = async (b) => {
    if (!window.confirm(`¿Retirar el bloque «${b.nombre}» de la biblioteca?`)) return
    setBusy(true)
    try {
      await desactivarBloqueNodo({ API_URL, contratoId, token, bloqueId: b.id })
      await cargar()
      onChanged?.()
    } catch (e) {
      setError(e?.message || 'No se pudo retirar')
    } finally {
      setBusy(false)
    }
  }

  const inp = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 8,
    border: `1px solid ${t.border}`,
    background: t.bg,
    color: t.text,
    fontSize: 'var(--cc-sm)',
    boxSizing: 'border-box',
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 15000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(640px, 96vw)',
          maxHeight: '90vh',
          overflow: 'auto',
          background: t.bgCard || '#fff',
          color: t.text,
          borderRadius: 14,
          border: `1px solid ${t.border}`,
          padding: 16,
          boxShadow: '0 16px 48px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)', flex: 1 }}>
            Biblioteca de bloques de nodo
          </div>
          <button type="button" onClick={onClose} style={{
            border: `1px solid ${t.border}`, background: t.bg, color: t.text,
            borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 700,
          }}>Cerrar</button>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 'var(--cc-sm)', color: t.textMuted, lineHeight: 1.45 }}>
          Cada bloque tiene nombre, forma y medidas reales (metros). Al dibujar un nodo se coloca
          centrado en la coordenada, a escala real.
        </p>
        {migracion && (
          <div style={{
            marginBottom: 12, padding: '10px 12px', borderRadius: 8,
            background: '#f59e0b22', border: '1px solid #f59e0b66', color: '#b45309', fontSize: 'var(--cc-sm)',
          }}>
            Ejecute en Supabase el script <code>so_bloques_nodo.sql</code> para habilitar la biblioteca.
          </div>
        )}
        {error && (
          <div style={{
            marginBottom: 12, padding: '10px 12px', borderRadius: 8,
            background: '#dc262622', border: '1px solid #dc262655', color: '#b91c1c', fontSize: 'var(--cc-sm)',
          }}>{error}</div>
        )}

        <div style={{
          display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.7fr 0.7fr', gap: 8, marginBottom: 8,
        }}>
          <input style={inp} placeholder="Nombre" value={draft.nombre}
            onChange={(e) => setDraft((d) => ({ ...d, nombre: e.target.value }))} />
          <select style={inp} value={draft.forma}
            onChange={(e) => setDraft((d) => ({ ...d, forma: e.target.value }))}>
            {BLOQUE_FORMAS.filter((f) => f.id !== 'personalizado').map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
          <input style={inp} type="number" step="0.01" min="0.01" placeholder="Ancho m"
            value={draft.ancho_m}
            onChange={(e) => setDraft((d) => ({ ...d, ancho_m: e.target.value }))} />
          <input style={inp} type="number" step="0.01" min="0.01" placeholder="Alto m"
            value={draft.alto_m}
            onChange={(e) => setDraft((d) => ({ ...d, alto_m: e.target.value }))} />
        </div>
        {esDesarrollador && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--cc-sm)', marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={!!draft.global_sistema}
              onChange={(e) => setDraft((d) => ({ ...d, global_sistema: e.target.checked }))}
            />
            Bloque global del sistema
          </label>
        )}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button type="button" disabled={busy} onClick={guardar} style={{
            background: t.primary, color: '#fff', border: 'none', borderRadius: 8,
            padding: '8px 14px', fontWeight: 800, cursor: 'pointer', opacity: busy ? 0.6 : 1,
          }}>{editId ? 'Guardar cambios' : 'Agregar bloque'}</button>
          {editId && (
            <button type="button" onClick={() => { setEditId(null); setDraft(vacio()) }} style={{
              background: t.bg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 8,
              padding: '8px 14px', fontWeight: 700, cursor: 'pointer',
            }}>Cancelar edición</button>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {bloques.length === 0 && !migracion && (
            <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>No hay bloques aún.</div>
          )}
          {bloques.map((b) => (
            <div key={b.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 'var(--cc-sm)' }}>{b.nombre}</div>
                <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>
                  {b.forma} · {b.ancho_m} × {b.alto_m} m
                  {b.contrato_id == null ? ' · global' : ''}
                </div>
              </div>
              <button type="button" onClick={() => editar(b)} style={{
                border: `1px solid ${t.border}`, background: t.bgCard, color: t.text,
                borderRadius: 6, padding: '4px 10px', fontWeight: 700, cursor: 'pointer', fontSize: 'var(--cc-caption)',
              }}>Editar</button>
              <button type="button" onClick={() => retirar(b)} style={{
                border: '1px solid #dc262655', background: '#dc262618', color: '#b91c1c',
                borderRadius: 6, padding: '4px 10px', fontWeight: 700, cursor: 'pointer', fontSize: 'var(--cc-caption)',
              }}>Retirar</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

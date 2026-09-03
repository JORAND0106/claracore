import { useEffect, useState } from 'react'
import CcModalBrandHeader from '../CcModalBrandHeader'
import { API_BASE } from '../../apiBase'
import { ETIQUETAS_VALIDACION_TOPO, useTopoTheme } from './topografiaShared'

/**
 * Comentario obligatorio para validación Pendiente/Rechazado (estilo SICOE simplificado).
 */
export default function PoligonalValidacionComentarioModal({
  open,
  estado,
  nivel,
  contratoId,
  token,
  onConfirm,
  onCancel,
}) {
  const ui = useTopoTheme()
  const [usuarios, setUsuarios] = useState([])
  const [destinatarios, setDestinatarios] = useState([])
  const [etiqueta, setEtiqueta] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')

  const esObligatorio = estado === 'Pendiente' || estado === 'Rechazado'
  const colorEstado = estado === 'Aprobado' ? '#166534' : estado === 'Rechazado' ? '#991b1b' : '#92400e'

  useEffect(() => {
    if (!open || !contratoId) return
    const hdr = { Authorization: `Bearer ${token}` }
    fetch(`${API_BASE}/actas/${contratoId}/usuarios-contrato`, { headers: hdr })
      .then((r) => r.json())
      .then((d) => setUsuarios(Array.isArray(d) ? d : []))
      .catch(() => setUsuarios([]))
  }, [open, contratoId, token])

  useEffect(() => {
    if (!open) {
      setDestinatarios([])
      setEtiqueta('')
      setMensaje('')
      setError('')
    }
  }, [open])

  if (!open) return null

  const toggleDest = (u) => {
    setDestinatarios((prev) =>
      prev.find((d) => d.id === u.id) ? prev.filter((d) => d.id !== u.id) : [...prev, u],
    )
  }

  const confirmar = () => {
    if (esObligatorio) {
      if (!destinatarios.length) {
        setError('Indique al menos un destinatario.')
        return
      }
      if (!etiqueta) {
        setError('Seleccione una etiqueta.')
        return
      }
      if (!mensaje.trim()) {
        setError('El mensaje es obligatorio.')
        return
      }
    }
    onConfirm(
      esObligatorio
        ? {
            destinatarios: destinatarios.map((d) => ({ id: d.id, nombre: d.nombre, apellidos: d.apellidos })),
            etiqueta,
            mensaje: mensaje.trim(),
          }
        : null,
    )
  }

  const inp = { ...ui.inputStyle, fontSize: 'var(--cc-sm)' }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: ui.overlay,
        zIndex: 10050,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          ...ui.card,
          width: 480,
          maxWidth: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <CcModalBrandHeader theme={ui.t} />
        <div style={{ fontWeight: 700, fontSize: 'var(--cc-md)', marginBottom: 4 }}>
          Validación nivel {nivel} — <span style={{ color: colorEstado }}>{estado}</span>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
          {esObligatorio
            ? 'Pendiente y Rechazado requieren comentario con destinatario, etiqueta y mensaje.'
            : 'El comentario es opcional para Aprobado.'}
        </p>

        {error && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 10px', borderRadius: 8, fontSize: 'var(--cc-xs)', marginBottom: 10 }}>
            {error}
          </div>
        )}

        {esObligatorio && (
          <>
            <label style={{ fontSize: 'var(--cc-xs)', fontWeight: 600, color: ui.textMuted }}>Destinatarios</label>
            <div style={{ maxHeight: 100, overflowY: 'auto', border: `1px solid ${ui.t?.border || '#e2e8f0'}`, borderRadius: 8, padding: 8, marginBottom: 10 }}>
              {usuarios.map((u) => (
                <label key={u.id} style={{ display: 'flex', gap: 6, fontSize: 'var(--cc-xs)', marginBottom: 4, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!destinatarios.find((d) => d.id === u.id)} onChange={() => toggleDest(u)} />
                  {[u.nombre, u.apellidos].filter(Boolean).join(' ')}
                </label>
              ))}
              {!usuarios.length && <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>Sin usuarios del contrato.</span>}
            </div>

            <label style={{ fontSize: 'var(--cc-xs)', fontWeight: 600, color: ui.textMuted }}>Etiqueta</label>
            <select value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} style={{ ...inp, marginBottom: 10 }}>
              <option value="">— Seleccione —</option>
              {ETIQUETAS_VALIDACION_TOPO.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>

            <label style={{ fontSize: 'var(--cc-xs)', fontWeight: 600, color: ui.textMuted }}>Mensaje</label>
            <textarea
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              rows={4}
              style={{ ...inp, marginBottom: 12, resize: 'vertical' }}
              placeholder="Explique el motivo de la observación o el rechazo…"
            />
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" style={ui.btnSecondary} onClick={onCancel}>Cancelar</button>
          {!esObligatorio && (
            <button type="button" style={ui.btnSecondary} onClick={() => onConfirm(null)}>Aprobar sin comentario</button>
          )}
          <button type="button" style={ui.btnPrimary} onClick={confirmar}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

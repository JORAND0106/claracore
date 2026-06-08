import { useCallback, useEffect, useState } from 'react'
import { API_BASE } from '../../apiBase'
import { useTopoTheme } from './topografiaShared'

/**
 * Firma desde imagen del perfil del usuario (no lienzo local).
 */
export default function FirmaPerfilTopo({ api, poligonalId, token, onFirmado }) {
  const ui = useTopoTheme()
  const [perfil, setPerfil] = useState(null)
  const [registrada, setRegistrada] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const cargarPerfil = useCallback(async () => {
    setError(null)
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch(`${API_BASE}/usuarios/me`, { headers })
      if (res.ok) setPerfil(await res.json())
    } catch {
      setPerfil(null)
    }
  }, [token])

  useEffect(() => {
    cargarPerfil()
  }, [cargarPerfil])

  const registrar = async () => {
    if (!poligonalId) return
    setBusy(true)
    setError(null)
    try {
      await api(`/poligonales/${poligonalId}/firma-perfil`, { method: 'POST' })
      setRegistrada(true)
      onFirmado?.()
    } catch (e) {
      setError(e?.message || 'No se pudo registrar la firma')
    } finally {
      setBusy(false)
    }
  }

  const firmaUrl = perfil?.firma_imagen_url

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#f8fafc' }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Firma digital (perfil de usuario)</div>
      <p style={{ margin: '0 0 10px', fontSize: 'var(--cc-xs)', color: '#64748b' }}>
        Se usa la imagen de firma de su cuenta. Configúrela en Perfil de usuario si aún no la tiene.
      </p>
      {firmaUrl ? (
        <img
          src={firmaUrl}
          alt="Firma del perfil"
          style={{ maxWidth: 280, maxHeight: 80, border: '1px solid #cbd5e1', background: '#fff', marginBottom: 10 }}
        />
      ) : (
        <p style={{ color: '#b45309', fontSize: 'var(--cc-sm)' }}>Sin firma en el perfil.</p>
      )}
      {registrada && (
        <p style={{ fontSize: 'var(--cc-xs)', color: '#047857', margin: '0 0 8px' }}>
          Firma registrada en esta poligonal (aparecerá en el PDF).
        </p>
      )}
      {error && <p style={{ color: '#dc2626', fontSize: 'var(--cc-xs)' }}>{error}</p>}
      <button type="button" style={ui.btnPrimary} onClick={registrar} disabled={busy || !firmaUrl || !poligonalId}>
        {busy ? 'Registrando…' : registrada ? 'Actualizar firma en poligonal' : 'Registrar firma en poligonal'}
      </button>
    </div>
  )
}

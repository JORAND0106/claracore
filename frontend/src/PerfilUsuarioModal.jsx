import { useState, useEffect } from 'react'
import CcModalBrandHeader from './components/CcModalBrandHeader'
import { prepararImagenParaUpload } from './comprimirImagen'

/**
 * Modal para editar nombre, cumpleaños, foto de perfil e imagen de firma (API /usuarios/me).
 */
export default function PerfilUsuarioModal({ t, apiBase, token, usuario, onClose, onSaved }) {
  const [nombre, setNombre] = useState(usuario?.nombre || '')
  const [apellidos, setApellidos] = useState(usuario?.apellidos || '')
  const [fechaNac, setFechaNac] = useState(
    usuario?.fecha_nacimiento ? String(usuario.fecha_nacimiento).slice(0, 10) : ''
  )
  const [fotoUrl, setFotoUrl] = useState(usuario?.foto_perfil_url || '')
  const [firmaUrl, setFirmaUrl] = useState(usuario?.firma_imagen_url || '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    setNombre(usuario?.nombre || '')
    setApellidos(usuario?.apellidos || '')
    setFechaNac(usuario?.fecha_nacimiento ? String(usuario.fecha_nacimiento).slice(0, 10) : '')
    setFotoUrl(usuario?.foto_perfil_url || '')
    setFirmaUrl(usuario?.firma_imagen_url || '')
  }, [usuario])

  const hdr = { Authorization: `Bearer ${token}` }

  async function guardarTexto() {
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch(`${apiBase}/usuarios/me`, {
        method: 'PUT',
        headers: { ...hdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombre.trim(),
          apellidos: apellidos.trim(),
          fecha_nacimiento: fechaNac || '',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(data.detail || 'No se pudo guardar.')
        return
      }
      onSaved(data)
    } catch (e) {
      setErr(String(e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  async function subirArchivo(ruta, file, setUrl, campo) {
    setUploading(ruta)
    setErr(null)
    try {
      const prepared = await prepararImagenParaUpload(file)
      const fd = new FormData()
      fd.append('file', prepared)
      const res = await fetch(`${apiBase}${ruta}`, { method: 'POST', headers: hdr, body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail || data) || 'Error al subir.')
        return
      }
      setUrl(data.url)
      onSaved({ ...usuario, [campo]: data.url })
    } catch (e) {
      setErr(String(e?.message || e))
    } finally {
      setUploading(null)
    }
  }

  async function quitar(ruta, campoUrl) {
    setUploading(ruta)
    setErr(null)
    try {
      const res = await fetch(`${apiBase}${ruta}`, { method: 'DELETE', headers: hdr })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErr(data.detail || 'No se pudo quitar la imagen.')
        return
      }
      if (campoUrl === 'foto') setFotoUrl('')
      else setFirmaUrl('')
      onSaved({ ...usuario, [campoUrl === 'foto' ? 'foto_perfil_url' : 'firma_imagen_url']: null })
    } catch (e) {
      setErr(String(e?.message || e))
    } finally {
      setUploading(null)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: t.overlay,
        zIndex: 10002,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: '20px',
          padding: '28px 32px',
          width: '480px',
          maxWidth: '100%',
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
        }}
        onClick={(e) => e.stopPropagation()}
      >        <CcModalBrandHeader theme={t} />

        <div style={{ fontSize: '20px', fontWeight: '800', color: t.primary, marginBottom: '4px' }}>Tu perfil</div>
        <div style={{ fontSize: '13px', color: t.textMuted, marginBottom: '20px', lineHeight: 1.45 }}>
          Nombre, cumpleaños, foto e imagen de firma se guardan en tu cuenta.
        </div>

        {err && (
          <div
            style={{
              background: '#fee2e2',
              border: '1px solid #fca5a5',
              borderRadius: '10px',
              padding: '10px 12px',
              color: '#b91c1c',
              fontSize: '13px',
              marginBottom: '14px',
            }}
          >
            {err}
          </div>
        )}

        <label style={{ fontSize: '11px', fontWeight: '700', color: t.textMuted, display: 'block', marginBottom: '6px' }}>Nombre</label>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: t.inputBg,
            border: `1.5px solid ${t.inputBorder}`,
            borderRadius: '10px',
            padding: '11px 14px',
            color: t.text,
            fontSize: '14px',
            marginBottom: '14px',
          }}
        />

        <label style={{ fontSize: '11px', fontWeight: '700', color: t.textMuted, display: 'block', marginBottom: '6px' }}>Apellidos</label>
        <input
          value={apellidos}
          onChange={(e) => setApellidos(e.target.value)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: t.inputBg,
            border: `1.5px solid ${t.inputBorder}`,
            borderRadius: '10px',
            padding: '11px 14px',
            color: t.text,
            fontSize: '14px',
            marginBottom: '14px',
          }}
        />

        <label style={{ fontSize: '11px', fontWeight: '700', color: t.textMuted, display: 'block', marginBottom: '6px' }}>
          Fecha de cumpleaños
        </label>
        <input
          type="date"
          value={fechaNac}
          onChange={(e) => setFechaNac(e.target.value)}
          style={{
            width: '100%',
            maxWidth: '280px',
            boxSizing: 'border-box',
            background: t.inputBg,
            border: `1.5px solid ${t.inputBorder}`,
            borderRadius: '10px',
            padding: '10px 14px',
            color: t.text,
            fontSize: '14px',
            marginBottom: '6px',
          }}
        />
        <div style={{ fontSize: '11px', color: t.textMuted, marginBottom: '18px', lineHeight: 1.4 }}>
          Si la configuras, ClaraCore te mostrará un mensaje especial el día de tu cumpleaños.
        </div>

        <div style={{ fontSize: '12px', fontWeight: '700', color: t.text, marginBottom: '8px' }}>Foto de perfil</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px', flexWrap: 'wrap' }}>
          <div
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              overflow: 'hidden',
              border: `2px solid ${t.border}`,
              background: t.inputBg,
              flexShrink: 0,
            }}
          >
            {fotoUrl ? (
              <img src={fotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' }}>
                👤
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label
              style={{
                display: 'inline-block',
                padding: '8px 14px',
                borderRadius: '8px',
                border: `1px solid ${t.border}`,
                background: t.bg,
                color: t.primary,
                fontSize: '12px',
                fontWeight: '700',
                cursor: uploading ? 'wait' : 'pointer',
                opacity: uploading ? 0.6 : 1,
              }}
            >
              {uploading === '/usuarios/me/foto-perfil' ? 'Subiendo…' : 'Elegir imagen'}
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                disabled={!!uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) subirArchivo('/usuarios/me/foto-perfil', f, setFotoUrl, 'foto_perfil_url')
                }}
              />
            </label>
            {fotoUrl && (
              <button
                type="button"
                disabled={!!uploading}
                onClick={() => quitar('/usuarios/me/foto-perfil', 'foto')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: t.textMuted,
                  fontSize: '12px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                Quitar foto
              </button>
            )}
          </div>
        </div>

        <div style={{ fontSize: '12px', fontWeight: '700', color: t.text, marginBottom: '8px' }}>Imagen de firma</div>
        <div
          style={{
            border: `1px dashed ${t.border}`,
            borderRadius: '12px',
            padding: '12px',
            marginBottom: '18px',
            background: t.inputBg,
          }}
        >
          {firmaUrl ? (
            <img src={firmaUrl} alt="Firma" style={{ maxWidth: '100%', maxHeight: '120px', objectFit: 'contain', display: 'block' }} />
          ) : (
            <div style={{ fontSize: '12px', color: t.textMuted }}>Sin imagen. Sube un PNG con fondo transparente si es posible.</div>
          )}
          <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
            <label
              style={{
                display: 'inline-block',
                padding: '8px 14px',
                borderRadius: '8px',
                border: `1px solid ${t.border}`,
                background: t.bg,
                color: t.primary,
                fontSize: '12px',
                fontWeight: '700',
                cursor: uploading ? 'wait' : 'pointer',
              }}
            >
              {uploading === '/usuarios/me/firma-imagen' ? 'Subiendo…' : 'Subir firma'}
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                disabled={!!uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) subirArchivo('/usuarios/me/firma-imagen', f, setFirmaUrl, 'firma_imagen_url')
                }}
              />
            </label>
            {firmaUrl && (
              <button
                type="button"
                disabled={!!uploading}
                onClick={() => quitar('/usuarios/me/firma-imagen', 'firma')}
                style={{
                  background: 'transparent',
                  border: `1px solid ${t.border}`,
                  borderRadius: '8px',
                  padding: '8px 14px',
                  color: t.textMuted,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Quitar firma
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: `1px solid ${t.border}`,
              borderRadius: '10px',
              padding: '10px 20px',
              color: t.textMuted,
              fontSize: '14px',
              cursor: 'pointer',
              fontWeight: '600',
            }}
          >
            Cerrar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={guardarTexto}
            style={{
              background: t.primary,
              border: 'none',
              borderRadius: '10px',
              padding: '10px 22px',
              color: '#fff',
              fontSize: '14px',
              cursor: saving ? 'wait' : 'pointer',
              fontWeight: '700',
            }}
          >
            {saving ? 'Guardando…' : 'Guardar datos'}
          </button>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'

/**
 * Bloqueo de sesión hasta aceptar políticas de confidencialidad y tratamiento de datos.
 */
export default function PoliticasConfidencialidadModal({ t, apiBase, token, version, onAccepted, onReject }) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const ver = version || '1.0'

  async function aceptar() {
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch(`${apiBase}/usuarios/me/politicas-aceptar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(typeof data.detail === 'string' ? data.detail : 'No se pudo registrar la aceptación.')
        return
      }
      onAccepted(data)
    } catch {
      setErr('No se pudo conectar con el servidor.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200000,
        background: 'rgba(10, 24, 42, 0.72)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        fontFamily: 'inherit',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: 'min(92vh, 720px)',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 18,
          overflow: 'hidden',
          boxShadow: '0 28px 90px rgba(0,0,0,0.45)',
          border: `1.5px solid ${t.border || 'rgba(0,175,197,0.35)'}`,
          background: t.bgCard || t.bg || '#0f2942',
        }}
      >
        <div
          style={{
            padding: '20px 22px 14px',
            borderBottom: `1px solid ${t.border || 'rgba(255,255,255,0.08)'}`,
            background: `linear-gradient(135deg, ${t.primary || '#0077B6'}22, transparent)`,
          }}
        >
          <div style={{ fontSize: 28, lineHeight: 1, marginBottom: 8 }} aria-hidden>
            📋
          </div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: t.text || '#e8f4f8', letterSpacing: '0.02em' }}>
            Políticas de confidencialidad y datos
          </h2>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: t.textMuted || '#94a3b8' }}>
            Versión {ver} — Debes leer y aceptar para continuar usando ClaraCore.
          </p>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '18px 22px',
            fontSize: 13,
            lineHeight: 1.65,
            color: t.textSecondary || '#cbd5e1',
          }}
        >
          <p style={{ marginTop: 0 }}>
            <strong style={{ color: t.text || '#e8f4f8' }}>Confidencialidad.</strong> La información a la que accedas en esta
            plataforma (documentos, cantidades, ubicaciones, datos de terceros, etc.) es{' '}
            <strong>estrictamente confidencial</strong>. No debes divulgarla, copiarla para fines ajenos al contrato ni usarla en
            perjuicio de la obra o de las personas involucradas.
          </p>
          <p>
            <strong style={{ color: t.text || '#e8f4f8' }}>Uso autorizado.</strong> ClaraCore está destinada{' '}
            <strong>exclusivamente a las actividades relacionadas con la obra y el contrato</strong> asignado. Queda prohibido
            emplear la plataforma para fines personales, comerciales ajenos, difusión pública o cualquier uso distinto al
            autorizado por la organización responsable.
          </p>
          <p>
            <strong style={{ color: t.text || '#e8f4f8' }}>Protección de datos personales.</strong> El tratamiento de datos
            personales se rige por la normativa aplicable en Colombia, incluida la Ley 1581 de 2012 (Habeas Data) y el Decreto
            1074 de 2015 (Sector Comercio), en lo que corresponda. Los datos se tratan de forma lícita, con finalidades
            legítimas vinculadas a la gestión del contrato y la seguridad de la información.
          </p>
          <p style={{ marginBottom: 0 }}>
            <strong style={{ color: t.text || '#e8f4f8' }}>Seguridad y responsabilidad.</strong> Debes custodiar tu usuario y
            contraseña, cerrar sesión en equipos compartidos y reportar accesos indebidos. El incumplimiento puede conllevar
            medidas disciplinarias y las acciones legales pertinentes.
          </p>
        </div>

        {err && (
          <div
            style={{
              margin: '0 22px 10px',
              padding: '10px 12px',
              borderRadius: 10,
              background: 'rgba(220,38,38,0.15)',
              color: '#fecaca',
              fontSize: 13,
            }}
          >
            {err}
          </div>
        )}

        <div
          style={{
            padding: '16px 22px 20px',
            borderTop: `1px solid ${t.border || 'rgba(255,255,255,0.08)'}`,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            disabled={loading}
            onClick={onReject}
            style={{
              padding: '12px 18px',
              borderRadius: 10,
              border: `1px solid ${t.border || 'rgba(255,255,255,0.2)'}`,
              background: 'transparent',
              color: t.textMuted || '#94a3b8',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            No acepto — Cerrar sesión
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={aceptar}
            style={{
              padding: '12px 22px',
              borderRadius: 10,
              border: 'none',
              background: t.primary || '#0077B6',
              color: '#fff',
              fontSize: 14,
              fontWeight: 800,
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.75 : 1,
            }}
          >
            {loading ? 'Registrando…' : 'He leído y acepto'}
          </button>
        </div>
      </div>
    </div>
  )
}

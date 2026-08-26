/**
 * Popup de edición completa de un registro de Cartera de cálculo.
 */
import { useEffect, useState } from 'react'
import TopoAngularInput from './TopoAngularInput'
import { fmtNum, validarGms } from '../../utils/topografia_angular'

function parseMetrosInput(v) {
  if (v === '' || v == null) return null
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export default function PoligonalPuntoEditModal({
  theme,
  punto,
  armada = null,
  busy = false,
  onSave,
  onClose,
  onError,
}) {
  const t = theme || {}
  const [form, setForm] = useState({
    tipo_punto: 'auxiliar',
    nombre_punto: '',
    angulo_gms: '',
    angulo_vertical_gms: '',
    distancia: '',
    altura_objetivo: '',
  })

  useEffect(() => {
    if (!punto) return
    setForm({
      tipo_punto: punto.tipo_punto || 'auxiliar',
      nombre_punto: punto.nombre_punto || '',
      angulo_gms: punto.angulo_observado_gms ?? '',
      angulo_vertical_gms: punto.angulo_vertical_gms ?? '',
      distancia: punto.distancia ?? '',
      altura_objetivo: punto.altura_objetivo ?? '',
    })
  }, [punto])

  if (!punto) return null

  const inp = {
    width: '100%',
    boxSizing: 'border-box',
    border: `1px solid ${t.border || '#CBD5E1'}`,
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 'var(--cc-sm)',
    fontFamily: 'inherit',
    color: t.text || '#0F172A',
    background: '#fff',
  }
  const label = {
    display: 'block',
    fontSize: 'var(--cc-xs)',
    fontWeight: 700,
    color: t.textMuted || '#64748B',
    marginBottom: 4,
  }
  const readonlyBox = {
    padding: '8px 10px',
    borderRadius: 8,
    background: t.bgMuted || '#F8FAFC',
    border: `1px solid ${t.border || '#E2E8F0'}`,
    fontSize: 'var(--cc-sm)',
    color: t.text || '#0F172A',
  }

  const handleSave = () => {
    if (!form.nombre_punto.trim()) {
      onError?.({ titulo: 'Nombre del punto', mensaje: 'Escriba el nombre del punto observado.' })
      return
    }
    if (form.angulo_gms === '' || form.angulo_gms == null) {
      onError?.({ titulo: 'Ángulo requerido', mensaje: 'Ingrese el ángulo horizontal observado (GG.MMSS).' })
      return
    }
    const angGms = Number(form.angulo_gms)
    if (!Number.isFinite(angGms) || !validarGms(angGms)) {
      onError?.({ titulo: 'Ángulo inválido', mensaje: 'Use formato GG.MMSS (minutos y segundos menores a 60).' })
      return
    }
    const dist = parseMetrosInput(form.distancia)
    if (form.distancia !== '' && form.distancia != null && dist == null) {
      onError?.({ titulo: 'Distancia inválida', mensaje: 'Ingrese la distancia en metros (use punto o coma decimal).' })
      return
    }
    if (dist != null && dist < 0) {
      onError?.({ titulo: 'Distancia inválida', mensaje: 'La distancia horizontal no puede ser negativa (metros).' })
      return
    }
    const av =
      form.angulo_vertical_gms === '' || form.angulo_vertical_gms == null
        ? null
        : Number(form.angulo_vertical_gms)
    onSave?.({
      tipo_punto: form.tipo_punto,
      nombre_punto: form.nombre_punto.trim(),
      angulo_gms: angGms,
      angulo_vertical_gms: av != null && Number.isFinite(av) ? av : null,
      distancia: dist,
      altura_objetivo: parseMetrosInput(form.altura_objetivo) ?? 0,
    })
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100050,
        background: t.overlay || 'rgba(15, 23, 42, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={busy ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="topo-punto-edit-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: '90vh',
          overflow: 'auto',
          background: t.bgCard || '#fff',
          border: `1px solid ${t.border || '#E2E8F0'}`,
          borderRadius: 14,
          boxShadow: t.shadow || '0 24px 64px rgba(0,0,0,0.28)',
        }}
      >
        <div
          style={{
            padding: '14px 18px',
            background: '#E6F4F5',
            borderBottom: '1px solid #BCE3E6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div id="topo-punto-edit-title" style={{ fontSize: 'var(--cc-body)', fontWeight: 800, color: '#0E7C86' }}>
            Editar punto — {punto.nombre_punto || `#${punto.orden}`}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: '#64748B' }}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={readonlyBox}>
              <span style={{ color: t.textMuted, fontSize: 'var(--cc-xs)' }}>Armada / orden</span>
              <div>
                Armada {punto.armada_orden ?? armada?.orden ?? '—'} · Punto #{punto.orden}
                {armada?.estacion_nombre ? ` · Est. ${armada.estacion_nombre}` : ''}
              </div>
            </div>
          </div>

          <div>
            <label style={label} htmlFor="pt-nombre">Punto</label>
            <input
              id="pt-nombre"
              value={form.nombre_punto}
              onChange={(e) => setForm({ ...form, nombre_punto: e.target.value })}
              style={inp}
              disabled={busy}
            />
          </div>
          <div>
            <label style={label} htmlFor="pt-tipo">Tipo</label>
            <select
              id="pt-tipo"
              value={form.tipo_punto}
              onChange={(e) => setForm({ ...form, tipo_punto: e.target.value })}
              style={inp}
              disabled={busy}
            >
              <option value="auxiliar">Auxiliar</option>
              <option value="estacion">Estación</option>
            </select>
          </div>

          <div>
            <label style={label}>Ángulo observado</label>
            <TopoAngularInput
              value={form.angulo_gms}
              onChange={(_, v) => setForm({ ...form, angulo_gms: v })}
              disabled={busy}
            />
          </div>
          <div>
            <label style={label}>Ángulo vertical</label>
            <TopoAngularInput
              value={form.angulo_vertical_gms}
              onChange={(_, v) => setForm({ ...form, angulo_vertical_gms: v == null || v === '' ? '' : v })}
              disabled={busy}
            />
          </div>

          <div>
            <label style={label} htmlFor="pt-dist">Distancia (m)</label>
            <input
              id="pt-dist"
              value={form.distancia}
              onChange={(e) => setForm({ ...form, distancia: e.target.value })}
              style={inp}
              disabled={busy}
              placeholder="metros"
            />
          </div>
          <div>
            <label style={label} htmlFor="pt-ht">HT — altura objetivo (m)</label>
            <input
              id="pt-ht"
              value={form.altura_objetivo}
              onChange={(e) => setForm({ ...form, altura_objetivo: e.target.value })}
              style={inp}
              disabled={busy}
              placeholder="0.000"
            />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ ...readonlyBox, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
              <div>
                <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted }}>HI (armada)</div>
                <div style={{ fontWeight: 700, color: '#0E7C86' }}>
                  {armada?.altura_instrumento != null ? fmtNum(armada.altura_instrumento, 3) : '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted }}>Azimut</div>
                <div style={{ fontWeight: 700, color: '#0E7C86' }}>{punto.azimut_texto ?? '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted }}>Norte</div>
                <div>{punto.norte != null ? fmtNum(punto.norte, 4) : '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted }}>Este</div>
                <div>{punto.este != null ? fmtNum(punto.este, 4) : '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted }}>Cota</div>
                <div>{punto.cota != null ? fmtNum(punto.cota, 4) : '—'}</div>
              </div>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 'var(--cc-xs)', color: t.textMuted }}>
              Azimut y coordenadas se recalculan al guardar.
            </p>
          </div>
        </div>

        <div
          className="cc-topo-actions-bar"
          style={{ padding: '4px 18px 16px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}
        >
          <button
            type="button"
            className="cc-topo-touch-btn"
            onClick={onClose}
            disabled={busy}
            style={{
              background: '#fff',
              color: t.text || '#334155',
              border: `1px solid ${t.border || '#CBD5E1'}`,
              borderRadius: 8,
              padding: '9px 18px',
              fontSize: 'var(--cc-sm)',
              fontWeight: 700,
              cursor: busy ? 'default' : 'pointer',
              minHeight: 44,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="cc-topo-touch-btn"
            onClick={handleSave}
            disabled={busy}
            style={{
              background: '#0E7C86',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '9px 18px',
              fontSize: 'var(--cc-sm)',
              fontWeight: 700,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.7 : 1,
              minHeight: 44,
            }}
          >
            {busy ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

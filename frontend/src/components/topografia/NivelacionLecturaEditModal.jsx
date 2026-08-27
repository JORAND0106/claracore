/**
 * Popup de edición integral de una lectura de la Cartera de Nivelación
 * (mismo patrón visual que PoligonalPuntoEditModal).
 */
import { useEffect, useState } from 'react'
import {
  ABSCISA_NUMERICA_MSG,
  bloqueVacio,
  diagnosticoHilosIncongruentes,
  distanciaTaquimetrica,
  hilosIncongruentes,
} from '../../utils/topografia_nivelacion'
import {
  AlertaHilos,
  HilosInputs,
  LecturaInput,
  TIPOS_PUNTO_NIV,
  fmtN,
  styleInputCartera,
} from './nivelacionUiShared'

function BloqueEdit({ bk, label, form, setForm, esAutomatico, ui, bloques, busy, conDistancia, soloLectura }) {
  const bloque = form[bk] || bloqueVacio()
  const diag = esAutomatico ? diagnosticoHilosIncongruentes(bloque, 'automatico') : null
  const alerta = Boolean(diag)
  const distKey = bk === 'vplus' ? 'dist_vplus_m' : 'dist_vminus_m'
  const distCalc = conDistancia && esAutomatico ? distanciaTaquimetrica(bloque.hS, bloque.hI) : null

  const onBloque = (b) => setForm((f) => ({ ...f, [bk]: b }))

  return (
    <div
      style={{
        gridColumn: '1 / -1',
        padding: 10,
        borderRadius: 8,
        border: `1px solid ${bloques[bk]?.border || '#CBD5E1'}`,
        background: bloques[bk]?.bg || '#F8FAFC',
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 'var(--cc-sm)', color: bloques[bk]?.accent || '#0E7C86', marginBottom: 8 }}>
        {label}
      </div>
      {soloLectura ? (
        <div style={{ fontSize: 'var(--cc-sm)' }}>
          {esAutomatico
            ? `${fmtN(bloque.hS, 3)} / ${fmtN(bloque.hM, 3)} / ${fmtN(bloque.hI, 3)}`
            : fmtN(bloque.lectura)}
          {conDistancia && esAutomatico ? ` · Dist ${fmtN(distCalc, 2)} m` : ''}
        </div>
      ) : esAutomatico ? (
        <HilosInputs
          bloque={bloque}
          onChange={onBloque}
          disabled={busy}
          ui={ui}
          alerta={alerta}
          bloques={bloques}
          bk={bk}
          diagMsg={diag?.msg}
        />
      ) : (
        <LecturaInput
          bloque={bloque}
          onChange={onBloque}
          disabled={busy}
          ui={ui}
          alerta={false}
          bloques={bloques}
          bk={bk}
        />
      )}
      {conDistancia && !esAutomatico && !soloLectura && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 'var(--cc-xs)', fontWeight: 700, color: ui.textMuted }}>Distancia (m)</label>
          <input
            value={form[distKey] ?? ''}
            disabled={busy}
            onChange={(e) => setForm((f) => ({ ...f, [distKey]: e.target.value }))}
            style={styleInputCartera(ui, bloques, bk, { width: 100, textAlign: 'center' })}
          />
        </div>
      )}
      {alerta && <AlertaHilos title={diag.msg} compact />}
    </div>
  )
}

export default function NivelacionLecturaEditModal({
  theme,
  ui,
  bloques,
  fila,
  idx,
  esAutomatico,
  bmInicialNombre = '',
  busy = false,
  onSave,
  onClose,
  onError,
  onElegirPk,
  vistaRow = null,
}) {
  const t = theme || ui?.t || {}
  const [form, setForm] = useState(null)

  useEffect(() => {
    if (!fila) {
      setForm(null)
      return
    }
    setForm({
      nombre_punto: fila.nombre_punto || '',
      tipo_punto: fila.tipo_punto || (idx === 0 ? 'BM' : ''),
      descripcion_punto: fila.descripcion_punto || '',
      abscisa: fila.abscisa || '',
      dist_vplus_m: fila.dist_vplus_m ?? '',
      dist_vminus_m: fila.dist_vminus_m ?? '',
      vplus: { ...bloqueVacio(), ...(fila.vplus || {}) },
      vi: { ...bloqueVacio(), ...(fila.vi || {}) },
      vminus: { ...bloqueVacio(), ...(fila.vminus || {}) },
      es_fila_cierre: Boolean(fila.es_fila_cierre),
      punto_biblioteca_id: fila.punto_biblioteca_id || null,
      ubicacion_pk_id: fila.ubicacion_pk_id || null,
      ubicacion_pk: fila.ubicacion_pk || '',
      ubicacion_tramo: fila.ubicacion_tramo || '',
      ubicacion_costado: fila.ubicacion_costado || '',
      ubicacion_infraestructura: fila.ubicacion_infraestructura || '',
      ubicacion_lat: fila.ubicacion_lat ?? null,
      ubicacion_lng: fila.ubicacion_lng ?? null,
    })
  }, [fila, idx])

  if (!fila || !form) return null

  const esPrimera = idx === 0
  const esCierre = Boolean(form.es_fila_cierre)
  const nombreLocked = esPrimera && Boolean(bmInicialNombre)
  const tipoLocked = esPrimera || esCierre

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
    const nombre = nombreLocked
      ? bmInicialNombre
      : String(form.nombre_punto || '').trim()
    if (!nombre) {
      onError?.({ titulo: 'Punto', mensaje: 'Escriba el nombre del punto.' })
      return
    }
    if (!esPrimera && !esCierre && !String(form.tipo_punto || '').trim()) {
      onError?.({ titulo: 'Tipo', mensaje: 'Seleccione el tipo de punto.' })
      return
    }
    if (!String(form.descripcion_punto || '').trim()) {
      onError?.({ titulo: 'Descripción', mensaje: 'Complete la descripción del punto.' })
      return
    }
    if (!form.ubicacion_pk_id && !String(form.abscisa || '').trim()) {
      onError?.({ titulo: 'Abscisa', mensaje: ABSCISA_NUMERICA_MSG })
      return
    }
    const avisos = []
    if (esAutomatico) {
      for (const [bk, lab] of [['vplus', 'V+'], ['vi', 'Vi'], ['vminus', 'V−']]) {
        if (hilosIncongruentes(form[bk], 'automatico')) {
          const d = diagnosticoHilosIncongruentes(form[bk], 'automatico')
          if (d?.msg) avisos.push(`${lab}: ${d.msg}`)
        }
      }
    }
    onSave?.({
      ...form,
      nombre_punto: nombre,
      tipo_punto: esPrimera ? 'BM' : (form.tipo_punto || ''),
      avisosHilos: avisos,
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
        aria-labelledby="topo-niv-edit-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 640,
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
          <div id="topo-niv-edit-title" style={{ fontSize: 'var(--cc-body)', fontWeight: 800, color: '#0E7C86' }}>
            Editar lectura — {form.nombre_punto || `#${idx + 1}`}
            {esCierre ? ' (cierre)' : ''}
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
              <span style={{ color: t.textMuted, fontSize: 'var(--cc-xs)' }}>Fila en cartera</span>
              <div>
                #{idx + 1}
                {vistaRow?.altura_instrumento != null ? ` · H.ins. ${fmtN(vistaRow.altura_instrumento)}` : ''}
                {vistaRow?.cota != null ? ` · Cota ${fmtN(vistaRow.cota)}` : ''}
              </div>
            </div>
          </div>

          <div>
            <label style={label} htmlFor="niv-nombre">Punto</label>
            {nombreLocked ? (
              <div style={readonlyBox}>{bmInicialNombre}</div>
            ) : (
              <input
                id="niv-nombre"
                value={form.nombre_punto}
                onChange={(e) => setForm({ ...form, nombre_punto: e.target.value })}
                style={inp}
                disabled={busy || esCierre}
              />
            )}
          </div>
          <div>
            <label style={label} htmlFor="niv-tipo">Tipo</label>
            {tipoLocked ? (
              <div style={readonlyBox}>{esPrimera ? 'BM' : (form.tipo_punto || '—')}</div>
            ) : (
              <select
                id="niv-tipo"
                value={form.tipo_punto}
                onChange={(e) => setForm({ ...form, tipo_punto: e.target.value })}
                style={inp}
                disabled={busy}
              >
                <option value="">—</option>
                {TIPOS_PUNTO_NIV.map(({ v, l }) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label style={label}>Abscisa / PK</label>
            <button
              type="button"
              disabled={busy}
              onClick={onElegirPk}
              style={{ ...inp, textAlign: 'left', cursor: 'pointer', background: t.bgMuted || '#F8FAFC' }}
              title={ABSCISA_NUMERICA_MSG}
            >
              {form.ubicacion_pk || form.abscisa || '📍 Elegir PK'}
            </button>
          </div>
          <div>
            <label style={label} htmlFor="niv-desc">Descripción</label>
            <input
              id="niv-desc"
              value={form.descripcion_punto}
              onChange={(e) => setForm({ ...form, descripcion_punto: e.target.value })}
              style={inp}
              disabled={busy}
            />
          </div>

          {!esCierre && (
            <BloqueEdit
              bk="vplus"
              label="V+ (vista atrás)"
              form={form}
              setForm={setForm}
              esAutomatico={esAutomatico}
              ui={ui}
              bloques={bloques}
              busy={busy}
              conDistancia
            />
          )}
          {!esCierre && (
            <BloqueEdit
              bk="vi"
              label="Vi (intermedia)"
              form={form}
              setForm={setForm}
              esAutomatico={esAutomatico}
              ui={ui}
              bloques={bloques}
              busy={busy}
              conDistancia={false}
            />
          )}
          <BloqueEdit
            bk="vminus"
            label="V− (vista adelante)"
            form={form}
            setForm={setForm}
            esAutomatico={esAutomatico}
            ui={ui}
            bloques={bloques}
            busy={busy}
            conDistancia
          />
        </div>

        <div
          style={{
            padding: '12px 18px 16px',
            borderTop: `1px solid ${t.border || '#E2E8F0'}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button type="button" onClick={onClose} disabled={busy} style={ui?.btnSecondary || inp}>
            Cancelar
          </button>
          <button type="button" onClick={handleSave} disabled={busy} style={ui?.btnPrimary || { ...inp, background: '#0E7C86', color: '#fff' }}>
            {busy ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

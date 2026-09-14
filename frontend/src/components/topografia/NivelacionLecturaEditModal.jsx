/**
 * Popup de edición integral de una lectura de la Cartera de Nivelación.
 * Formato tabular tipo Excel: fila de metadatos + fila de lecturas V+/Vi/V−.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import CcModalBrandHeader from '../CcModalBrandHeader'
import {
  ABSCISA_NUMERICA_MSG,
  bloqueVacio,
  diagnosticoHilosIncongruentes,
  distanciaTaquimetrica,
  esFilaSoloVi,
  hilosIncongruentes,
  parseAbscisa,
  previewAbscisadoCaptura,
} from '../../utils/topografia_nivelacion'
import {
  AlertaHilos,
  HilosInputs,
  LecturaInput,
  PreviewAbscisadoVminus,
  TIPOS_PUNTO_NIV,
  fmtN,
  handleEnterAsTab,
  styleInputCartera,
} from './nivelacionUiShared'
import { useTopoViewport } from './topografiaShared'

function CeldaLectura({
  bk,
  label,
  form,
  setForm,
  esAutomatico,
  ui,
  bloques,
  busy,
  conDistancia,
  soloLectura,
  previewAbscisado = null,
}) {
  const bloque = form[bk] || bloqueVacio()
  const diag = esAutomatico ? diagnosticoHilosIncongruentes(bloque, 'automatico') : null
  const alerta = Boolean(diag)
  const distKey = bk === 'vplus' ? 'dist_vplus_m' : 'dist_vminus_m'
  const distCalc = conDistancia && esAutomatico ? distanciaTaquimetrica(bloque.hS, bloque.hI) : null
  const accent = bloques[bk]?.accent || '#0E7C86'
  const onBloque = (b) => setForm((f) => ({ ...f, [bk]: b }))

  return (
    <td
      style={{
        padding: 8,
        verticalAlign: 'top',
        border: `1px solid ${bloques[bk]?.border || '#CBD5E1'}`,
        background: bloques[bk]?.bg || '#F8FAFC',
        minWidth: 0,
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 'var(--cc-xxs)', color: accent, marginBottom: 6, letterSpacing: '0.02em' }}>
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
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 'var(--cc-xxs)', fontWeight: 700, color: ui.textMuted }}>Dist</label>
          <input
            value={form[distKey] ?? ''}
            disabled={busy}
            onChange={(e) => setForm((f) => ({ ...f, [distKey]: e.target.value }))}
            style={styleInputCartera(ui, bloques, bk, { width: 72, textAlign: 'center' })}
          />
        </div>
      )}
      {conDistancia && esAutomatico && !soloLectura && (
        <div style={{ marginTop: 4, fontSize: 'var(--cc-xxs)', color: ui.textMuted }}>
          Dist {fmtN(distCalc, 2)} m
        </div>
      )}
      {bk === 'vminus' && previewAbscisado ? (
        <PreviewAbscisadoVminus preview={previewAbscisado} ui={ui} />
      ) : null}
      {alerta && <AlertaHilos title={diag.msg} compact />}
    </td>
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
  filas = [],
  tipoNivel = 'electronico',
  cotasBiblioteca = {},
}) {
  const t = theme || ui?.t || {}
  const { isCompact } = useTopoViewport()
  const rootRef = useRef(null)
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
      abscisa_inicial: fila.abscisa_inicial ?? '',
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

  const tipoNivelEfectivo = tipoNivel || (esAutomatico ? 'automatico' : 'electronico')
  const previewAbscisado = useMemo(() => {
    if (!form) return null
    return previewAbscisadoCaptura(filas, form, tipoNivelEfectivo, cotasBiblioteca, {
      replaceIdx: idx,
    })
  }, [filas, form, tipoNivelEfectivo, cotasBiblioteca, idx])

  if (!fila || !form) return null

  const esPrimera = idx === 0
  const esCierre = Boolean(form.es_fila_cierre)
  const tipoNivelForm = tipoNivelEfectivo
  const soloVi = !esCierre && esFilaSoloVi(form, tipoNivelForm)
  const nombreLocked = esPrimera && Boolean(bmInicialNombre)
  const tipoLocked = esPrimera || esCierre

  const inp = {
    width: '100%',
    boxSizing: 'border-box',
    border: `1px solid ${t.border || '#CBD5E1'}`,
    borderRadius: 6,
    padding: isCompact ? '8px 10px' : '6px 8px',
    fontSize: 'var(--cc-sm)',
    fontFamily: 'inherit',
    color: t.text || '#0F172A',
    background: '#fff',
  }
  const readonlyBox = {
    padding: isCompact ? '8px 10px' : '6px 8px',
    borderRadius: 6,
    background: t.bgMuted || '#F8FAFC',
    border: `1px solid ${t.border || '#E2E8F0'}`,
    fontSize: 'var(--cc-sm)',
    color: t.text || '#0F172A',
  }
  const thMeta = {
    padding: '6px 8px',
    fontSize: 'var(--cc-xxs)',
    fontWeight: 800,
    color: t.textMuted || '#64748B',
    textAlign: 'left',
    background: t.bgMuted || '#F1F5F9',
    border: `1px solid ${t.border || '#E2E8F0'}`,
    whiteSpace: 'nowrap',
  }
  const tdMeta = {
    padding: 6,
    border: `1px solid ${t.border || '#E2E8F0'}`,
    background: t.bgCard || '#fff',
    verticalAlign: 'middle',
  }

  const mostrarVplus = !esCierre && !soloVi
  const mostrarVi = !esCierre
  const mostrarVminus = !soloVi
  const colLecturas = [mostrarVplus, mostrarVi, mostrarVminus].filter(Boolean).length || 1

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
    if (!form.ubicacion_pk_id && !String(form.abscisa || '').trim() && parseAbscisa(form.abscisa_inicial) == null) {
      onError?.({ titulo: 'Abscisa', mensaje: ABSCISA_NUMERICA_MSG })
      return
    }
    if (esPrimera && parseAbscisa(form.abscisa_inicial) == null) {
      onError?.({ titulo: 'Abscisa inicial', mensaje: 'Indique la abscisa inicial del circuito (m).' })
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
        padding: isCompact ? 10 : 16,
      }}
      onClick={busy ? undefined : onClose}
    >
      <div
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="topo-niv-edit-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => handleEnterAsTab(e, rootRef.current)}
        style={{
          width: '100%',
          maxWidth: isCompact ? 560 : 920,
          maxHeight: '92vh',
          overflow: 'auto',
          background: t.bgCard || '#fff',
          border: `1px solid ${t.border || '#E2E8F0'}`,
          borderRadius: 14,
          boxShadow: t.shadow || '0 24px 64px rgba(0,0,0,0.28)',
        }}
      >
        <CcModalBrandHeader theme={theme} />
        <div
          style={{
            padding: '12px 16px',
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
            {esCierre ? ' (cierre)' : soloVi ? ' (Vi)' : ''}
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

        <div style={{ padding: isCompact ? '12px' : '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={readonlyBox}>
            <span style={{ color: t.textMuted, fontSize: 'var(--cc-xxs)', fontWeight: 700 }}>Fila en cartera</span>
            <div style={{ fontSize: 'var(--cc-sm)' }}>
              #{idx + 1}
              {vistaRow?.altura_instrumento != null ? ` · H.ins. ${fmtN(vistaRow.altura_instrumento)}` : ''}
              {vistaRow?.cota != null ? ` · Cota ${fmtN(vistaRow.cota)}` : ''}
              {vistaRow?.distancia_acumulada != null ? ` · Dist.acum. ${fmtN(vistaRow.distancia_acumulada, 2)}` : ''}
              {vistaRow?.abscisa_circuito != null ? ` · Abs.circuito ${fmtN(vistaRow.abscisa_circuito, 2)}` : ''}
            </div>
          </div>

          {/* Fila superior: Punto | Tipo | Abscisa/PK | Descripción */}
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                tableLayout: isCompact ? 'auto' : 'fixed',
                minWidth: isCompact ? undefined : 640,
              }}
            >
              <thead>
                <tr>
                  <th style={thMeta}>Punto</th>
                  <th style={thMeta}>Tipo</th>
                  <th style={thMeta}>Abscisa / PK</th>
                  <th style={thMeta}>Descripción</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdMeta}>
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
                  </td>
                  <td style={tdMeta}>
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
                  </td>
                  <td style={tdMeta}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={onElegirPk}
                      style={{ ...inp, textAlign: 'left', cursor: 'pointer', background: t.bgMuted || '#F8FAFC' }}
                      title={ABSCISA_NUMERICA_MSG}
                    >
                      {form.ubicacion_pk || form.abscisa || '📍 Elegir PK'}
                    </button>
                  </td>
                  <td style={tdMeta}>
                    <input
                      id="niv-desc"
                      value={form.descripcion_punto}
                      onChange={(e) => setForm({ ...form, descripcion_punto: e.target.value })}
                      style={inp}
                      disabled={busy}
                    />
                  </td>
                </tr>
                {esPrimera ? (
                  <tr>
                    <td style={{ ...tdMeta, ...thMeta }} colSpan={2}>Abscisa inicial (m)</td>
                    <td style={tdMeta} colSpan={2}>
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={form.abscisa_inicial ?? ''}
                        onChange={(e) => setForm({ ...form, abscisa_inicial: e.target.value })}
                        style={inp}
                        disabled={busy}
                        placeholder="Punto de partida del circuito"
                        title="Abscisa de campo del BM. Dist. acum. del perfil parte de 0 desde aquí."
                      />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {/* Fila de lecturas: V+ | Vi | V− */}
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'separate',
                borderSpacing: isCompact ? '0 8px' : 8,
                tableLayout: isCompact && colLecturas > 1 ? 'auto' : 'fixed',
                minWidth: isCompact ? undefined : Math.min(860, colLecturas * 220),
              }}
            >
              <tbody>
                <tr style={isCompact ? { display: 'flex', flexDirection: 'column', gap: 8 } : undefined}>
                  {mostrarVplus && (
                    <CeldaLectura
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
                  {mostrarVi && (
                    <CeldaLectura
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
                  {mostrarVminus && (
                    <CeldaLectura
                      bk="vminus"
                      label="V− (vista adelante)"
                      form={form}
                      setForm={setForm}
                      esAutomatico={esAutomatico}
                      ui={ui}
                      bloques={bloques}
                      busy={busy}
                      conDistancia
                      previewAbscisado={previewAbscisado}
                    />
                  )}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div
          style={{
            padding: '12px 16px 16px',
            borderTop: `1px solid ${t.border || '#E2E8F0'}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            flexWrap: 'wrap',
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

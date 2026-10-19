import { useEffect, useRef } from 'react'
import CcModalBrandHeader from '../components/CcModalBrandHeader'
import { claveFoEo04, fmtCantidadFoEo04 } from './foEo04Seleccion'

/**
 * Grilla tipo Excel para elegir qué formatos FO-EO-04 entran a la vista previa y al PDF.
 * Al abrir, el padre deja todas las filas marcadas.
 */
export default function FoEo04SeleccionModal({
  abierta,
  t,
  filas,
  cargando,
  error,
  seleccion,
  onToggle,
  onToggleTodas,
  onCerrar,
  onContinuar,
}) {
  const todasRef = useRef(null)
  const total = filas.length
  const nSel = filas.reduce((n, fila) => n + (seleccion.has(claveFoEo04(fila)) ? 1 : 0), 0)
  const todas = total > 0 && nSel === total
  const algunas = nSel > 0 && nSel < total

  useEffect(() => {
    if (todasRef.current) todasRef.current.indeterminate = algunas
  }, [algunas, todas, abierta])

  if (!abierta) return null

  const borde = `1px solid ${t.border}`
  const cab = t.headerBg || t.bg

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="fo-eo-04-seleccion-titulo"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100002,
        background: t.overlay || 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px',
        boxSizing: 'border-box',
      }}
      onClick={onCerrar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '920px',
          height: 'min(92vh, 780px)',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: t.bgCard,
          color: t.text,
          borderRadius: '12px',
          border: borde,
          boxShadow: t.shadow || '0 25px 50px -12px rgba(0,0,0,0.35)',
          overflow: 'hidden',
        }}
      >
        <CcModalBrandHeader theme={t} />
        <div style={{ padding: '12px 14px 8px', flexShrink: 0 }}>
          <div id="fo-eo-04-seleccion-titulo" style={{ fontWeight: 800, fontSize: '16px', lineHeight: 1.3 }}>
            Formatos a generar
          </div>
          <div style={{ marginTop: '4px', color: t.textMuted, fontSize: '13px', lineHeight: 1.4 }}>
            {cargando
              ? 'Cargando ítems del acta…'
              : error
                ? error
                : `${nSel} de ${total} ítem${total === 1 ? '' : 's'} seleccionado${nSel === 1 ? '' : 's'}`}
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 10px 8px' }}>
          <table
            style={{
              width: '100%',
              minWidth: '560px',
              borderCollapse: 'collapse',
              tableLayout: 'fixed',
              fontSize: '13px',
            }}
          >
            <colgroup>
              <col style={{ width: '44px' }} />
              <col style={{ width: '18%' }} />
              <col />
              <col style={{ width: '72px' }} />
              <col style={{ width: '120px' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={thStyle(cab, borde, t)}>
                  <input
                    ref={todasRef}
                    type="checkbox"
                    checked={todas}
                    disabled={cargando || total === 0}
                    onChange={(e) => onToggleTodas(e.target.checked)}
                    aria-label="Seleccionar todos"
                    style={{ accentColor: t.primary, width: '16px', height: '16px' }}
                  />
                </th>
                {['Ítem', 'Descripción', 'Und', 'Cantidad'].map((col) => (
                  <th key={col} style={{ ...thStyle(cab, borde, t), textAlign: col === 'Cantidad' ? 'right' : 'left' }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!cargando && filas.map((fila, idx) => {
                const clave = claveFoEo04(fila)
                const on = seleccion.has(clave)
                return (
                  <tr
                    key={clave || idx}
                    style={{ background: on ? t.bgCard : t.bg }}
                    onClick={() => onToggle(clave)}
                  >
                    <td style={tdStyle(borde, t, 'center')} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => onToggle(clave)}
                        aria-label={`Incluir ${fila.item_numero}`}
                        style={{ accentColor: t.primary, width: '16px', height: '16px' }}
                      />
                    </td>
                    <td style={tdStyle(borde, t, 'left')}>
                      <div style={{ fontWeight: 700 }}>{fila.item_numero}</div>
                      {fila.capitulo ? (
                        <div style={{ color: t.textMuted, fontSize: '11px', lineHeight: 1.3, marginTop: '2px' }}>
                          {fila.capitulo}
                        </div>
                      ) : null}
                    </td>
                    <td style={tdStyle(borde, t, 'left')}>{fila.descripcion || '—'}</td>
                    <td style={tdStyle(borde, t, 'center')}>{fila.unidad || '—'}</td>
                    <td style={{ ...tdStyle(borde, t, 'right'), fontVariantNumeric: 'tabular-nums' }}>
                      {fmtCantidadFoEo04(fila.cantidad)}
                    </td>
                  </tr>
                )
              })}
              {!cargando && total === 0 && !error ? (
                <tr>
                  <td colSpan={5} style={{ ...tdStyle(borde, t, 'left'), color: t.textMuted, padding: '16px 8px' }}>
                    No hay ítems con formato para el acta y los parámetros elegidos.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            gap: '8px',
            padding: '10px 14px 12px',
            borderTop: borde,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={onCerrar}
            style={btnSec(t, borde)}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onContinuar}
            disabled={cargando || !!error || nSel === 0}
            style={{
              ...btnPri(t),
              opacity: cargando || error || nSel === 0 ? 0.45 : 1,
              cursor: cargando || error || nSel === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  )
}

function thStyle(cab, borde, t) {
  return {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    background: cab,
    color: t.text,
    border: borde,
    padding: '6px 8px',
    fontSize: '12px',
    fontWeight: 800,
    textAlign: 'center',
  }
}

function tdStyle(borde, t, align) {
  return {
    border: borde,
    color: t.text,
    padding: '6px 8px',
    textAlign: align,
    verticalAlign: 'top',
    lineHeight: 1.35,
    wordBreak: 'break-word',
  }
}

function btnSec(t, borde) {
  return {
    padding: '8px 14px',
    borderRadius: '8px',
    border: borde,
    background: t.bg,
    color: t.text,
    fontWeight: 700,
    cursor: 'pointer',
  }
}

function btnPri(t) {
  return {
    padding: '8px 16px',
    borderRadius: '8px',
    border: `1px solid ${t.primary}`,
    background: t.primary,
    color: '#ffffff',
    fontWeight: 700,
  }
}

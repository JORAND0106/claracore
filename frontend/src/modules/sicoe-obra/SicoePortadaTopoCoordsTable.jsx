/**
 * Tabla de coordenadas topográficas tipo Excel (portada / wizard SicoeObra).
 * Conserva agregar punto e importar CSV; añade pegado masivo desde Excel.
 */
import { useCallback, useMemo, useState } from 'react'
import { topoSheetStyles } from '../../components/topografia/topoSheetStyles'
import {
  SICOE_PORTADA_TOPO_CAMPOS,
  SICOE_PORTADA_TOPO_CAMPOS_NUMERICOS,
  SICOE_PORTADA_TOPO_LABELS,
  aplicarPasteGridTopo,
  claveCeldaTopo,
  esPasteMasivoTopo,
  parseClipboardGridTopo,
  puntoTopoVacio,
} from './sicoePortadaTopoPaste'

export default function SicoePortadaTopoCoordsTable({
  t,
  puntos = [],
  onChange,
  /** Si false, oculta botones (modo solo lectura no usa este componente). */
  editable = true,
  showCsvImport = true,
  helpText = 'Registra las coordenadas levantadas en campo. Puede digitar, agregar puntos, importar CSV o pegar un bloque desde Excel (Ctrl+V / Cmd+V) a partir de la celda activa.',
}) {
  const sheet = useMemo(() => topoSheetStyles(t), [t])
  const [invalidKeys, setInvalidKeys] = useState(() => new Set())
  const [pasteMsg, setPasteMsg] = useState('')

  const filas = Array.isArray(puntos) && puntos.length ? puntos : [puntoTopoVacio()]

  const setFilas = useCallback((next) => {
    onChange?.(Array.isArray(next) ? next : [])
  }, [onChange])

  const updateCell = (rowIdx, campo, value) => {
    const next = filas.map((r, i) => (i === rowIdx ? { ...r, [campo]: value } : r))
    setFilas(next)
    setInvalidKeys((prev) => {
      if (!prev.has(claveCeldaTopo(rowIdx, campo))) return prev
      const n = new Set(prev)
      n.delete(claveCeldaTopo(rowIdx, campo))
      return n
    })
  }

  const onPaste = (rowIdx, campo, e) => {
    if (!editable) return
    const text = e.clipboardData?.getData?.('text/plain')
    if (!esPasteMasivoTopo(text)) {
      // Un solo valor: si es numérico y viene con coma, normalizar vía grid 1x1
      if (SICOE_PORTADA_TOPO_CAMPOS_NUMERICOS.includes(campo) && text != null && String(text).includes(',')) {
        e.preventDefault()
        const grid = parseClipboardGridTopo(text)
        const { filas: next, invalidas, mensaje } = aplicarPasteGridTopo(filas, rowIdx, campo, grid)
        setFilas(next)
        setInvalidKeys(new Set(invalidas.map((x) => claveCeldaTopo(x.row, x.campo))))
        setPasteMsg(mensaje || '')
      }
      return
    }
    e.preventDefault()
    const grid = parseClipboardGridTopo(text)
    const { filas: next, invalidas, mensaje } = aplicarPasteGridTopo(filas, rowIdx, campo, grid)
    setFilas(next)
    setInvalidKeys(new Set(invalidas.map((x) => claveCeldaTopo(x.row, x.campo))))
    setPasteMsg(mensaje || '')
  }

  const agregarPunto = () => setFilas([...filas, puntoTopoVacio()])

  const eliminarPunto = (idx) => {
    const next = filas.filter((_, i) => i !== idx)
    setFilas(next.length ? next : [puntoTopoVacio()])
    setInvalidKeys((prev) => {
      const n = new Set()
      for (const k of prev) {
        const [r, c] = String(k).split(':')
        const ri = Number(r)
        if (!Number.isFinite(ri)) continue
        if (ri < idx) n.add(k)
        else if (ri > idx) n.add(claveCeldaTopo(ri - 1, c))
      }
      return n
    })
  }

  const importarCsv = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const lines = String(ev.target?.result || '').split(/\r?\n/).filter((l) => l.trim())
      if (lines.length < 2) return
      const rows = lines.slice(1).map((l) => {
        const cols = l.includes('\t') ? l.split('\t') : l.split(',')
        return {
          punto: cols[0] || '',
          norte: cols[1] || '',
          este: cols[2] || '',
          cota: cols[3] || '',
          descripcion: cols[4] || '',
        }
      })
      if (rows.length) {
        setFilas(rows)
        setInvalidKeys(new Set())
        setPasteMsg('')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {helpText ? (
        <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>{helpText}</div>
      ) : null}

      <div
        className="cc-topo-table-scroll"
        style={{
          ...sheet.sheetWrap,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <table style={{ ...sheet.sheetTable, minWidth: 520 }}>
          <thead>
            <tr>
              {SICOE_PORTADA_TOPO_CAMPOS.map((campo) => (
                <th
                  key={campo}
                  style={{
                    ...sheet.th,
                    width: campo === 'punto' ? 72 : (campo === 'descripcion' ? '28%' : '16%'),
                  }}
                >
                  {SICOE_PORTADA_TOPO_LABELS[campo]}
                </th>
              ))}
              {editable ? (
                <th style={{ ...sheet.th, width: 36, textAlign: 'center' }} aria-label="Acciones" />
              ) : null}
            </tr>
          </thead>
          <tbody>
            {filas.map((p, idx) => (
              <tr key={`topo-row-${idx}`}>
                {SICOE_PORTADA_TOPO_CAMPOS.map((campo) => {
                  const bad = invalidKeys.has(claveCeldaTopo(idx, campo))
                  const num = SICOE_PORTADA_TOPO_CAMPOS_NUMERICOS.includes(campo)
                  return (
                    <td
                      key={campo}
                      style={{
                        ...sheet.td,
                        background: bad ? 'rgba(239, 68, 68, 0.12)' : sheet.td.background,
                        boxShadow: bad ? 'inset 0 0 0 1.5px #ef4444' : undefined,
                      }}
                    >
                      <input
                        value={p?.[campo] ?? ''}
                        onChange={(e) => updateCell(idx, campo, e.target.value)}
                        onPaste={(e) => onPaste(idx, campo, e)}
                        type="text"
                        inputMode={num ? 'decimal' : 'text'}
                        placeholder={SICOE_PORTADA_TOPO_LABELS[campo]}
                        disabled={!editable}
                        aria-invalid={bad || undefined}
                        title={bad ? 'Valor no numérico — corríjalo antes de guardar' : undefined}
                        style={{
                          ...sheet.cellInp,
                          fontVariantNumeric: num ? 'tabular-nums' : undefined,
                        }}
                      />
                    </td>
                  )
                })}
                {editable ? (
                  <td style={{ ...sheet.td, textAlign: 'center', width: 36 }}>
                    <button
                      type="button"
                      title="Eliminar punto"
                      aria-label="Eliminar punto"
                      onClick={() => eliminarPunto(idx)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#EF4444',
                        cursor: 'pointer',
                        fontSize: 'var(--cc-lg)',
                        padding: 0,
                        lineHeight: 1,
                      }}
                    >
                      ✕
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pasteMsg ? (
        <div
          role="alert"
          style={{
            fontSize: 'var(--cc-sm)',
            color: '#b91c1c',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: 8,
            padding: '8px 10px',
            fontWeight: 600,
          }}
        >
          {pasteMsg}
        </div>
      ) : null}

      {editable ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={agregarPunto}
            style={{
              background: 'transparent',
              border: `1px dashed ${t.border}`,
              color: t.textMuted,
              borderRadius: 8,
              padding: '7px 16px',
              fontSize: 'var(--cc-sm)',
              cursor: 'pointer',
            }}
          >
            + Agregar punto
          </button>
          {showCsvImport ? (
            <label
              style={{
                background: 'transparent',
                border: `1px dashed ${t.border}`,
                color: t.textMuted,
                borderRadius: 8,
                padding: '7px 16px',
                fontSize: 'var(--cc-sm)',
                cursor: 'pointer',
              }}
            >
              📂 Importar CSV
              <input
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  importarCsv(file)
                  e.target.value = ''
                }}
              />
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

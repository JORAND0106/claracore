/**
 * Popup de carga de cartera de entrega: pegar Excel, CSV o Excel con hoja.
 * Soporta modo lecturas (Vi) o cotas directas.
 */
import { useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import CcModalBrandHeader from '../CcModalBrandHeader'
import DisenoExcelHojaModal from './DisenoExcelHojaModal'
import { listDisenoExcelSheetNames } from '../../utils/disenoGeometricoParse'
import { useTopoTheme } from './topografiaShared'

function parseNum(v) {
  if (v == null || v === '') return null
  const n = Number(String(v).trim().replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function normHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

/**
 * Interpreta matriz AOA → filas { abscisa, valores: { ordenadaKey|izq|eje|der: number } }
 * No inventa valores: solo celdas numéricas presentes.
 */
export function parseCarteraMatriz(rows, { modo = 'cotas', ordenadasCols = [] } = {}) {
  if (!rows?.length) throw new Error('No hay datos para cargar.')
  let headerIdx = 0
  let mapped = null
  for (let i = 0; i < Math.min(rows.length, 15); i += 1) {
    const headers = (rows[i] || []).map((c) => normHeader(c))
    const absI = headers.findIndex((h) => ['abscisa', 'pk', 'progresiva', 'estacion'].includes(h))
    if (absI < 0) continue
    mapped = { abs: absI, cols: {} }
    headers.forEach((h, j) => {
      if (j === absI) return
      if (['izq', 'izquierda', 'left'].includes(h)) mapped.cols.izq = j
      else if (['eje', 'centro', 'center'].includes(h)) mapped.cols.eje = j
      else if (['der', 'derecha', 'right'].includes(h)) mapped.cols.der = j
      else {
        const n = parseNum(h.replace('o', '').replace('m', ''))
        // encabezado numérico de ordenada: -4.5, +4.50, etc.
        const raw = String(rows[i][j] ?? '').trim()
        const o = parseNum(raw)
        if (o != null) mapped.cols[`o:${o}`] = j
      }
    })
    headerIdx = i
    break
  }
  if (!mapped) throw new Error('No se encontró columna ABSCISA. Use encabezados Abscisa | Izq | Eje | Der (u ordenadas).')

  const refOrd = {
    izq: ordenadasCols.find((c) => c.lado === 'izq')?.ordenada
      ?? ordenadasCols[0]?.ordenada,
    eje: ordenadasCols.find((c) => Math.abs(Number(c.ordenada)) < 1e-9)?.ordenada ?? 0,
    der: ordenadasCols.find((c) => c.lado === 'der')?.ordenada
      ?? ordenadasCols[ordenadasCols.length - 1]?.ordenada,
  }

  const filas = []
  let cotas = 0
  for (const row of rows.slice(headerIdx + 1)) {
    if (!row?.some?.((c) => String(c).trim())) continue
    const abscisa = parseNum(row[mapped.abs])
    if (abscisa == null) continue
    const lecturas = []
    const push = (ordenada, raw) => {
      const v = parseNum(raw)
      if (v == null || ordenada == null) return
      cotas += 1
      if (modo === 'lecturas') lecturas.push({ ordenada, vi: v })
      else lecturas.push({ ordenada, cota: v })
    }
    if (mapped.cols.izq != null) push(refOrd.izq, row[mapped.cols.izq])
    if (mapped.cols.eje != null) push(refOrd.eje, row[mapped.cols.eje])
    if (mapped.cols.der != null) push(refOrd.der, row[mapped.cols.der])
    Object.entries(mapped.cols).forEach(([k, j]) => {
      if (k.startsWith('o:')) push(Number(k.slice(2)), row[j])
    })
    if (lecturas.length) filas.push({ abscisa, lecturas })
  }
  if (!filas.length) {
    throw new Error(
      modo === 'lecturas'
        ? 'No se leyeron lecturas (Vi) numéricas.'
        : 'No se leyeron cotas numéricas.',
    )
  }
  return { filas, abscisas: filas.length, cotas, modo }
}

export function parseCarteraClipboard(text, opts) {
  const rows = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => l.split('\t'))
  return parseCarteraMatriz(rows, opts)
}

export default function EntregaCarteraCargaModal({
  open,
  modo = 'cotas',
  ordenadasCols = [],
  zIndex = 100100,
  onApply,
  onClose,
}) {
  const ui = useTopoTheme()
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [paste, setPaste] = useState('')
  const [excelBuf, setExcelBuf] = useState(null)
  const [excelName, setExcelName] = useState('')
  const [hojas, setHojas] = useState([])
  const [hojaSel, setHojaSel] = useState('')
  const [modalHoja, setModalHoja] = useState(false)

  const tituloModo = modo === 'lecturas' ? 'lecturas (Vi)' : 'cotas directas'

  const reset = () => {
    setBusy(false)
    setAviso(null)
    setPaste('')
    setExcelBuf(null)
    setExcelName('')
    setHojas([])
    setHojaSel('')
    setModalHoja(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const aplicar = async (parsed) => {
    setBusy(true)
    setAviso(null)
    try {
      await onApply?.(parsed)
      setAviso({
        tipo: 'ok',
        texto: `Carga lista: ${parsed.abscisas} abscisa(s) y ${parsed.cotas} valor(es) de ${tituloModo}.`,
      })
    } catch (e) {
      setAviso({ tipo: 'error', texto: e?.message || 'No se pudo aplicar la carga.' })
    } finally {
      setBusy(false)
    }
  }

  const onPegar = async () => {
    try {
      const parsed = parseCarteraClipboard(paste, { modo, ordenadasCols })
      await aplicar(parsed)
    } catch (e) {
      setAviso({ tipo: 'error', texto: e?.message || 'Pegado inválido.' })
    }
  }

  const onFile = async (file) => {
    if (!file) return
    setBusy(true)
    setAviso(null)
    try {
      const name = file.name.toLowerCase()
      if (name.endsWith('.csv') || name.endsWith('.txt')) {
        const text = await file.text()
        const delim = text.includes(';') && !text.includes('\t') ? ';' : (text.includes('\t') ? '\t' : ',')
        const rows = text.replace(/\r\n/g, '\n').split('\n').map((l) => l.split(delim))
        const parsed = parseCarteraMatriz(rows, { modo, ordenadasCols })
        await aplicar(parsed)
      } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const buf = await file.arrayBuffer()
        const names = listDisenoExcelSheetNames(buf)
        setExcelBuf(buf)
        setExcelName(file.name)
        setHojas(names)
        setHojaSel(names[0] || '')
        if (names.length <= 1) {
          await cargarHoja(buf, names[0])
        } else {
          setModalHoja(true)
          setBusy(false)
        }
      } else {
        throw new Error('Use CSV o Excel (.xlsx).')
      }
    } catch (e) {
      setAviso({ tipo: 'error', texto: e?.message || 'No se pudo leer el archivo.' })
      setBusy(false)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const cargarHoja = async (buf, hoja) => {
    setBusy(true)
    try {
      const wb = XLSX.read(buf || excelBuf, { type: 'array' })
      const ws = wb.Sheets[hoja]
      if (!ws) throw new Error(`Hoja «${hoja}» no encontrada.`)
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      const parsed = parseCarteraMatriz(rows, { modo, ordenadasCols })
      setModalHoja(false)
      await aplicar(parsed)
    } catch (e) {
      setAviso({ tipo: 'error', texto: e?.message || 'Error al leer la hoja.' })
      setBusy(false)
    }
  }

  const help = useMemo(() => (
    modo === 'lecturas'
      ? 'Columnas: Abscisa, Izquierda, Eje, Derecha (valores = lecturas de mira Vi).'
      : 'Columnas: Abscisa, Izquierda, Eje, Derecha (valores = cotas de campo).'
  ), [modo])

  if (!open) return null

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed', inset: 0, zIndex,
          background: 'rgba(15,23,42,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}
        onClick={() => { if (!busy) { reset(); onClose?.() } }}
      >
        <div
          style={{ ...ui.card, width: 'min(560px, 96vw)', maxHeight: '90vh', overflow: 'auto', padding: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <CcModalBrandHeader theme={ui.t} />
          <div style={{ padding: '14px 18px 18px' }}>
            <h3 style={{ margin: '0 0 4px', color: ui.text }}>Cargar cartera ({tituloModo})</h3>
            <p style={{ margin: '0 0 12px', fontSize: 'var(--cc-xs)', color: ui.textMuted, lineHeight: 1.45 }}>
              {help} No se inventan valores vacíos.
            </p>

            <label style={{ display: 'block', fontSize: 'var(--cc-xs)', color: ui.textMuted, marginBottom: 4 }}>
              Pegar desde Excel
            </label>
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={6}
              disabled={busy}
              placeholder={'Abscisa\tIzquierda\tEje\tDerecha\n11170\t1.234\t1.200\t1.210'}
              style={{
                ...ui.inputStyle,
                width: '100%',
                fontFamily: 'ui-monospace, monospace',
                fontSize: 'var(--cc-xs)',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button type="button" style={ui.btnSecondary} disabled={busy || !paste.trim()} onClick={() => { void onPegar() }}>
                Aplicar pegado
              </button>
              <button
                type="button"
                style={ui.btnSecondary}
                disabled={busy}
                title="Cargar CSV o Excel"
                onClick={() => fileRef.current?.click()}
              >
                {busy ? 'Procesando…' : 'Archivo CSV / Excel'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt,.xlsx,.xls"
                style={{ display: 'none' }}
                onChange={(e) => { void onFile(e.target.files?.[0]) }}
              />
              <div style={{ flex: 1 }} />
              <button type="button" style={ui.btnSecondary} disabled={busy} onClick={() => { reset(); onClose?.() }}>
                Cerrar
              </button>
            </div>

            {aviso && (
              <div
                role="alert"
                style={{
                  marginTop: 12,
                  padding: '8px 10px',
                  borderRadius: 8,
                  fontSize: 'var(--cc-xs)',
                  border: `1px solid ${aviso.tipo === 'ok' ? '#86efac' : '#fca5a5'}`,
                  background: aviso.tipo === 'ok' ? '#f0fdf4' : '#fef2f2',
                  color: aviso.tipo === 'ok' ? '#166534' : '#991b1b',
                }}
              >
                {aviso.texto}
              </div>
            )}
            {busy && (
              <p role="status" style={{ margin: '10px 0 0', fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
                Procesando carga…
              </p>
            )}
          </div>
        </div>
      </div>

      <DisenoExcelHojaModal
        open={modalHoja}
        nombreArchivo={excelName}
        hojas={hojas}
        selected={hojaSel}
        zIndex={zIndex + 10}
        onSelect={setHojaSel}
        onConfirm={(h) => { void cargarHoja(excelBuf, h) }}
        onClose={() => { if (!busy) setModalHoja(false) }}
      />
    </>
  )
}

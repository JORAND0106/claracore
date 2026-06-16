import { useEffect, useMemo, useState } from 'react'

import { useTopoTheme } from './topografiaShared'



const TIPOS = {

  A: {

    titulo: 'Opción A — Simétrica centrada',

    detalle: (w) => `Izquierda (−${(w / 2).toFixed(2)}) · Eje (0.00) · Derecha (+${(w / 2).toFixed(2)})`,

    ejemploIntermedias: (w, p) => {

      const h = (w / 2).toFixed(2)

      const m = Number(p).toFixed(2)

      return `−${h} · −${m} · 0.00 · +${m} · +${h}`

    },

  },

  B: {

    titulo: 'Opción B — Eje a la derecha',

    detalle: (w) => `Borde izq (−${w.toFixed(2)}) · Media izq (−${(w / 2).toFixed(2)}) · Eje (0.00)`,

    ejemploIntermedias: (w, p) => {

      const m = Number(p).toFixed(2)

      return `−${w.toFixed(2)} · … · −${m} · 0.00`

    },

  },

  C: {

    titulo: 'Opción C — Eje a la izquierda',

    detalle: (w) => `Eje (0.00) · Media der (+${(w / 2).toFixed(2)}) · Borde der (+${w.toFixed(2)})`,

    ejemploIntermedias: (w, p) => {

      const h = (w / 2).toFixed(2)

      const m = Number(p).toFixed(2)

      return `0.00 · ${m} · ${h} · … · ${Number(w).toFixed(2)}`

    },

  },

}



export default function DisenoImportConfigModal({ open, nombreArchivo, onConfirm, onClose }) {

  const ui = useTopoTheme()

  const [tipo, setTipo] = useState('A')

  const [ancho, setAncho] = useState('9.00')

  const [intermedias, setIntermedias] = useState(false)

  const [paso, setPaso] = useState('2.00')

  const [error, setError] = useState('')



  useEffect(() => {

    if (!open) return

    setError('')

    setTipo('A')

    setAncho('9.00')

    setIntermedias(false)

    setPaso('2.00')

  }, [open])



  const anchoNum = parseFloat(String(ancho).replace(',', '.'))

  const pasoNum = parseFloat(String(paso).replace(',', '.'))

  const preview = useMemo(() => {

    if (!Number.isFinite(anchoNum) || anchoNum <= 0) return ''

    return TIPOS[tipo]?.detalle(anchoNum) || ''

  }, [tipo, anchoNum])



  const ejemploIntermedias = useMemo(() => {

    if (!intermedias || !Number.isFinite(anchoNum) || anchoNum <= 0 || !Number.isFinite(pasoNum) || pasoNum <= 0) {

      return ''

    }

    return TIPOS[tipo]?.ejemploIntermedias(anchoNum, pasoNum) || ''

  }, [tipo, anchoNum, pasoNum, intermedias])



  if (!open) return null



  const confirmar = () => {

    const w = parseFloat(String(ancho).replace(',', '.'))

    const p = parseFloat(String(paso).replace(',', '.'))

    if (!Number.isFinite(w) || w <= 0) {

      setError('Indique un ancho de vía válido (m).')

      return

    }

    if (intermedias && (!Number.isFinite(p) || p <= 0)) {

      setError('Indique el paso entre ordenadas intermedias (m).')

      return

    }

    setError('')

    onConfirm({

      tipo_seccion: tipo,

      ancho_via_m: w,

      calcular_intermedias: intermedias,

      paso_intermedias_m: intermedias ? p : null,

      interpolar_abscisas: false,

      paso_abscisas_m: null,

    })

  }



  return (

    <div

      role="dialog"

      aria-modal="true"

      style={{

        position: 'fixed',

        inset: 0,

        zIndex: 9000,

        background: 'rgba(15,23,42,0.55)',

        display: 'flex',

        alignItems: 'center',

        justifyContent: 'center',

        padding: 16,

      }}

      onClick={onClose}

    >

      <div

        style={{

          ...ui.card,

          width: 'min(640px, 100%)',

          maxHeight: '90vh',

          overflow: 'auto',

          padding: '18px 20px',

        }}

        onClick={(e) => e.stopPropagation()}

      >

        <h3 style={{ margin: '0 0 6px', color: ui.text, fontSize: 'var(--cc-base)' }}>

          Configuración del diseño transversal

        </h3>

        {nombreArchivo && (

          <p style={{ margin: '0 0 12px', fontSize: 'var(--cc-xs)', color: ui.textMuted }}>

            Archivo: <strong style={{ color: ui.text }}>{nombreArchivo}</strong>

          </p>

        )}

        <p style={{ margin: '0 0 14px', fontSize: 'var(--cc-xs)', color: ui.textMuted, lineHeight: 1.45 }}>

          Las columnas IZQUIERDA, EJE y DERECHA del CSV se interpretan según el esquema de ordenadas que elija.

        </p>



        <label style={{ display: 'block', marginBottom: 12 }}>

          <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>Ancho de vía (m)</span>

          <input

            value={ancho}

            onChange={(e) => setAncho(e.target.value)}

            style={{ ...ui.inputStyle, display: 'block', marginTop: 4, maxWidth: 160 }}

          />

        </label>



        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>

          {Object.entries(TIPOS).map(([key, t]) => (

            <label

              key={key}

              style={{

                ...ui.nestedPanel,

                display: 'flex',

                gap: 10,

                alignItems: 'flex-start',

                cursor: 'pointer',

                border: `2px solid ${tipo === key ? (ui.t?.primary || ui.accent) : (ui.t?.border || '#e2e8f0')}`,

              }}

            >

              <input

                type="radio"

                name="tipo_seccion"

                checked={tipo === key}

                onChange={() => setTipo(key)}

                style={{ marginTop: 4 }}

              />

              <div>

                <div style={{ fontWeight: 600, fontSize: 'var(--cc-sm)', color: ui.text }}>{t.titulo}</div>

                <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 2 }}>

                  {Number.isFinite(anchoNum) && anchoNum > 0 ? t.detalle(anchoNum) : '—'}

                </div>

              </div>

            </label>

          ))}

        </div>



        {preview && (

          <p style={{ margin: '0 0 12px', fontSize: 'var(--cc-xs)', color: ui.text }}>

            Referencia: {preview}

          </p>

        )}



        <div style={{ ...ui.insetPanel, marginBottom: 14 }}>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--cc-sm)', color: ui.text }}>

            <input

              type="checkbox"

              checked={intermedias}

              onChange={(e) => setIntermedias(e.target.checked)}

            />

            Calcular ordenadas intermedias (transversal)

          </label>

          <p style={{ margin: '8px 0 0', fontSize: 'var(--cc-xs)', color: ui.textMuted, lineHeight: 1.45 }}>

            En cada PK del CSV, interpola entre borde y punto central (columna EJE) a paso fijo en ordenadas.

          </p>

          {intermedias && (

            <>

              <label style={{ display: 'block', marginTop: 10 }}>

                <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>Paso en ordenadas (m)</span>

                <input

                  value={paso}

                  onChange={(e) => setPaso(e.target.value)}

                  style={{ ...ui.inputStyle, display: 'block', marginTop: 4, maxWidth: 120 }}

                  placeholder="2.00"

                />

              </label>

              {ejemploIntermedias && (

                <p style={{ margin: '8px 0 0', fontSize: 'var(--cc-xs)', color: ui.text }}>

                  Ejemplo ordenadas: {ejemploIntermedias}

                </p>

              )}

            </>

          )}

        </div>



        {error && (

          <p style={{ margin: '0 0 10px', fontSize: 'var(--cc-xs)', color: '#dc2626' }}>{error}</p>

        )}



        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>

          <button type="button" style={ui.btnSecondary} onClick={onClose}>Cancelar</button>

          <button type="button" style={ui.btnPrimary} onClick={confirmar}>Importar diseño</button>

        </div>

      </div>

    </div>

  )

}


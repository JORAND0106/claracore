import { useState } from 'react'

const themes = {
  light: {
    bg: '#F0F9FF', bgCard: '#FFFFFF', border: '#BAE6FD', text: '#0F2942',
    textMuted: '#4A7FA5', primary: '#0077B6', primaryLight: '#00B4C6',
    shadow: '0 2px 12px rgba(0,119,182,0.10)', headerBg: '#FFFFFF',
    overlay: 'rgba(0,0,0,0.4)', inputBg: '#F8FAFC', inputBorder: '#BAE6FD',
  },
  dark: {
    bg: '#0A1628', bgCard: '#0F2038', border: '#1E3A5F', text: '#E0F2FE',
    textMuted: '#7FB3D3', primary: '#00B4C6', primaryLight: '#00D4E8',
    shadow: '0 2px 12px rgba(0,0,0,0.40)', headerBg: '#0F2038',
    overlay: 'rgba(0,0,0,0.7)', inputBg: '#0A1628', inputBorder: '#1E3A5F',
  }
}

function getAutoTheme() {
  const hour = new Date().getHours()
  return (hour >= 7 && hour < 19) ? 'light' : 'dark'
}

export default function App() {
  const [themeMode, setThemeMode] = useState('auto')
  const [activeTheme, setActiveTheme] = useState(getAutoTheme())
  const [tabInferior, setTabInferior] = useState('gantt')
  const [analisis, setAnalisis] = useState('financiero')
  const [showModal, setShowModal] = useState(false)
  const [contrato, setContrato] = useState({
    numero: '', objeto: '', contratista: '', nit: ''
  })
  const [csvData, setCsvData] = useState(null)
  const [csvNombre, setCsvNombre] = useState('')
  const [contratos, setContratos] = useState([])

  const t = themes[activeTheme]

  function handleTheme(mode) {
    setThemeMode(mode)
    if (mode === 'auto') setActiveTheme(getAutoTheme())
    else setActiveTheme(mode)
  }

  function handleCSV(e) {
    const file = e.target.files[0]
    if (!file) return
    setCsvNombre(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target.result
      const lines = text.split('\n').filter(l => l.trim())
      const headers = lines[0].split(',').map(h => h.trim())
      const rows = lines.slice(1).map(line => {
        const vals = line.split(',')
        return headers.reduce((obj, h, i) => ({ ...obj, [h]: vals[i]?.trim() }), {})
      })
      setCsvData(rows)
    }
    reader.readAsText(file)
  }

  function handleGuardar() {
    if (!contrato.numero || !contrato.contratista) return
    setContratos([...contratos, { ...contrato, listado: csvData, listadoNombre: csvNombre }])
    setContrato({ numero: '', objeto: '', contratista: '', nit: '' })
    setCsvData(null)
    setCsvNombre('')
    setShowModal(false)
  }

  const s = {
    app: { fontFamily: "'Segoe UI', sans-serif", background: t.bg, minHeight: '100vh', color: t.text, transition: 'all 0.3s ease' },
    header: { background: t.headerBg, borderBottom: `1px solid ${t.border}`, padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: t.shadow },
    themeSelector: { display: 'flex', gap: '6px', background: t.bg, border: `1px solid ${t.border}`, borderRadius: '20px', padding: '4px' },
    themeBtn: (mode) => ({ background: themeMode === mode ? t.primary : 'transparent', color: themeMode === mode ? '#fff' : t.textMuted, border: 'none', borderRadius: '16px', padding: '4px 12px', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }),
    body: { padding: '20px 24px', maxWidth: '1400px', margin: '0 auto' },
    topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
    btnCrear: { background: t.primary, color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' },
    panelsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' },
    card: { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: '12px', padding: '20px', boxShadow: t.shadow },
    cardLabel: { fontSize: '11px', fontWeight: '600', letterSpacing: '1.5px', color: t.textMuted, marginBottom: '8px' },
    cardValue: { fontSize: '26px', fontWeight: '700', color: t.primary, lineHeight: 1 },
    cardSub: { fontSize: '12px', color: t.textMuted, marginTop: '6px' },
    analisisButtons: { display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' },
    analisisBtn: (key) => ({ background: analisis === key ? t.primary : t.bgCard, color: analisis === key ? '#fff' : t.textMuted, border: `1px solid ${analisis === key ? t.primary : t.border}`, borderRadius: '8px', padding: '8px 18px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s' }),
    table: { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: '12px', padding: '20px', boxShadow: t.shadow, marginBottom: '20px' },
    tableHeader: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: '8px', fontSize: '11px', fontWeight: '600', letterSpacing: '1px', color: t.textMuted, borderBottom: `1px solid ${t.border}`, paddingBottom: '10px', marginBottom: '10px' },
    emptyState: { textAlign: 'center', padding: '40px', color: t.textMuted, fontSize: '14px' },
    bottomPanel: { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: '12px', padding: '20px', boxShadow: t.shadow },
    tabs: { display: 'flex', gap: '8px', marginBottom: '16px' },
    tab: (key) => ({ background: tabInferior === key ? t.primary : t.bgCard, color: tabInferior === key ? '#fff' : t.textMuted, border: 'none', borderRadius: '8px', padding: '8px 18px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s' }),
    // MODAL
    overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: t.overlay, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
    modal: { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: '16px', padding: '32px', width: '520px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
    modalTitle: { fontSize: '18px', fontWeight: '700', color: t.primary, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' },
    label: { fontSize: '12px', fontWeight: '600', color: t.textMuted, letterSpacing: '0.5px', marginBottom: '6px', display: 'block' },
    input: { width: '100%', background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: '8px', padding: '10px 14px', color: t.text, fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '16px' },
    csvBtn: { background: t.bg, border: `2px dashed ${t.border}`, borderRadius: '8px', padding: '16px', width: '100%', textAlign: 'center', cursor: 'pointer', color: t.textMuted, fontSize: '13px', marginBottom: '24px', boxSizing: 'border-box' },
    modalFooter: { display: 'flex', gap: '12px', justifyContent: 'flex-end' },
    btnCancelar: { background: 'transparent', border: `1px solid ${t.border}`, borderRadius: '8px', padding: '10px 20px', color: t.textMuted, fontSize: '14px', cursor: 'pointer' },
    btnGuardar: { background: t.primary, border: 'none', borderRadius: '8px', padding: '10px 24px', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  }

  return (
    <div style={s.app}>
      {/* HEADER */}
      <div style={s.header}>
        <img src="/CLARA.CORE.png" alt="ClaraCore" style={{ height: '40px', filter: activeTheme === 'dark' ? 'brightness(0) invert(1)' : 'none' }} />
        <div style={s.themeSelector}>
          <button style={s.themeBtn('light')} onClick={() => handleTheme('light')}>☀️ Claro</button>
          <button style={s.themeBtn('auto')} onClick={() => handleTheme('auto')}>⚡ Auto</button>
          <button style={s.themeBtn('dark')} onClick={() => handleTheme('dark')}>🌙 Oscuro</button>
        </div>
      </div>

      {/* BODY */}
      <div style={s.body}>
        <div style={s.topBar}>
          <span style={{ fontSize: '13px', color: t.textMuted }}>📋 Contrato: CODENSA 2024</span>
          <button style={s.btnCrear} onClick={() => setShowModal(true)}>
            ＋ Crear Contrato
          </button>
        </div>

        {/* 3 PANELES */}
        <div style={s.panelsGrid}>
          <div style={s.card}>
            <div style={s.cardLabel}>📋 PRESUPUESTO</div>
            <div style={s.cardValue}>$181,927,908</div>
            <div style={s.cardSub}>Valor inicial del contrato</div>
          </div>
          <div style={s.card}>
            <div style={s.cardLabel}>💰 COBRO</div>
            <div style={s.cardValue}>$138,023,945</div>
            <div style={s.cardSub}>Acumulado facturado</div>
          </div>
          <div style={s.card}>
            <div style={s.cardLabel}>🏪 ALMACÉN</div>
            <div style={s.cardValue}>$0</div>
            <div style={s.cardSub}>Próximamente</div>
          </div>
        </div>

        {/* SELECTOR ANÁLISIS */}
        <div style={s.analisisButtons}>
          <button style={s.analisisBtn('financiero')} onClick={() => setAnalisis('financiero')}>Presupuesto vs Cobro — Análisis Financiero</button>
          <button style={s.analisisBtn('pedidos')} onClick={() => setAnalisis('pedidos')}>Presupuesto vs Almacén — Análisis de Pedidos</button>
          <button style={s.analisisBtn('consumo')} onClick={() => setAnalisis('consumo')}>Cobro vs Almacén — Análisis de Consumo</button>
        </div>

        {/* TABLA */}
        <div style={s.table}>
          <div style={s.tableHeader}>
            <span>Ítem / Descripción</span><span>Presupuesto</span><span>Cobrado</span><span>Delta</span><span>Estado</span>
          </div>
          <div style={s.emptyState}>📂 Importa un archivo Excel para ver el análisis comparativo</div>
        </div>

        {/* PANEL INFERIOR */}
        <div style={s.bottomPanel}>
          <div style={s.tabs}>
            <button style={s.tab('gantt')} onClick={() => setTabInferior('gantt')}>📅 Programación / Gantt</button>
            <button style={s.tab('mapa')} onClick={() => setTabInferior('mapa')}>🗺️ Plano Semáforo</button>
          </div>
          <div style={s.emptyState}>
            {tabInferior === 'gantt' ? '📅 Diagrama Gantt — próximamente' : '🗺️ Plano Semáforo — próximamente'}
          </div>
        </div>
      </div>

      {/* MODAL CREAR CONTRATO */}
      {showModal && (
        <div style={s.overlay} onClick={() => setShowModal(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>📋 Crear Nuevo Contrato</div>

            <label style={s.label}>NÚMERO DE CONTRATO *</label>
            <input style={s.input} placeholder="Ej: COD-2024-001"
              value={contrato.numero} onChange={e => setContrato({...contrato, numero: e.target.value})} />

            <label style={s.label}>OBJETO DEL CONTRATO</label>
            <input style={s.input} placeholder="Descripción del objeto contractual"
              value={contrato.objeto} onChange={e => setContrato({...contrato, objeto: e.target.value})} />

            <label style={s.label}>CONTRATISTA *</label>
            <input style={s.input} placeholder="Razón social de la empresa"
              value={contrato.contratista} onChange={e => setContrato({...contrato, contratista: e.target.value})} />

            <label style={s.label}>NIT CONTRATISTA</label>
            <input style={s.input} placeholder="Ej: 900.123.456-7"
              value={contrato.nit} onChange={e => setContrato({...contrato, nit: e.target.value})} />

            <label style={s.label}>LISTADO DE PRECIOS (CSV)</label>
            <label style={s.csvBtn}>
              {csvNombre ? `✅ ${csvNombre}` : '📂 Haz clic para cargar el archivo CSV con el listado de precios'}
              <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCSV} />
            </label>
            {csvData && (
              <div style={{ fontSize: '12px', color: t.primary, marginBottom: '16px' }}>
                ✅ {csvData.length} ítems cargados correctamente
              </div>
            )}

            <div style={s.modalFooter}>
              <button style={s.btnCancelar} onClick={() => setShowModal(false)}>Cancelar</button>
              <button style={s.btnGuardar} onClick={handleGuardar}>Guardar Contrato</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
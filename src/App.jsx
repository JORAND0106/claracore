import { useState, useEffect } from 'react'

const themes = {
  light: {
    bg: '#F0F9FF',
    bgCard: '#FFFFFF',
    bgCardHover: '#E0F2FE',
    border: '#BAE6FD',
    text: '#0F2942',
    textMuted: '#4A7FA5',
    primary: '#0077B6',
    primaryLight: '#00B4C6',
    accent: '#023E8A',
    buttonText: '#FFFFFF',
    shadow: '0 2px 12px rgba(0,119,182,0.10)',
    tabActive: '#0077B6',
    tabInactive: '#E0F2FE',
    tabInactiveText: '#4A7FA5',
    headerBg: '#FFFFFF',
    analysisRow: '#F0F9FF',
  },
  dark: {
    bg: '#0A1628',
    bgCard: '#0F2038',
    bgCardHover: '#162845',
    border: '#1E3A5F',
    text: '#E0F2FE',
    textMuted: '#7FB3D3',
    primary: '#00B4C6',
    primaryLight: '#00D4E8',
    accent: '#0077B6',
    buttonText: '#FFFFFF',
    shadow: '0 2px 12px rgba(0,0,0,0.40)',
    tabActive: '#00B4C6',
    tabInactive: '#0F2038',
    tabInactiveText: '#7FB3D3',
    headerBg: '#0F2038',
    analysisRow: '#0A1628',
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

  useEffect(() => {
    if (themeMode === 'auto') {
      setActiveTheme(getAutoTheme())
      const interval = setInterval(() => setActiveTheme(getAutoTheme()), 60000)
      return () => clearInterval(interval)
    } else {
      setActiveTheme(themeMode)
    }
  }, [themeMode])

  const t = themes[activeTheme]

  const s = {
    app: {
      fontFamily: "'Segoe UI', sans-serif",
      background: t.bg,
      minHeight: '100vh',
      color: t.text,
      transition: 'all 0.3s ease',
    },
    header: {
      background: t.headerBg,
      borderBottom: `1px solid ${t.border}`,
      padding: '12px 24px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      boxShadow: t.shadow,
    },
    logo: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
    },
    logoText: {
      fontSize: '20px',
      fontWeight: '700',
      color: t.primary,
      letterSpacing: '2px',
    },
    logoDot: {
      color: t.primaryLight,
    },
    themeSelector: {
      display: 'flex',
      gap: '6px',
      background: t.bg,
      border: `1px solid ${t.border}`,
      borderRadius: '20px',
      padding: '4px',
    },
    themeBtn: (mode) => ({
      background: themeMode === mode ? t.primary : 'transparent',
      color: themeMode === mode ? '#fff' : t.textMuted,
      border: 'none',
      borderRadius: '16px',
      padding: '4px 12px',
      fontSize: '12px',
      cursor: 'pointer',
      transition: 'all 0.2s',
    }),
    body: {
      padding: '20px 24px',
      maxWidth: '1400px',
      margin: '0 auto',
    },
    contractBadge: {
      display: 'inline-block',
      background: t.bgCard,
      border: `1px solid ${t.border}`,
      borderRadius: '8px',
      padding: '6px 14px',
      fontSize: '13px',
      color: t.textMuted,
      marginBottom: '20px',
    },
    panelsGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: '16px',
      marginBottom: '20px',
    },
    card: {
      background: t.bgCard,
      border: `1px solid ${t.border}`,
      borderRadius: '12px',
      padding: '20px',
      boxShadow: t.shadow,
      transition: 'all 0.2s',
    },
    cardLabel: {
      fontSize: '11px',
      fontWeight: '600',
      letterSpacing: '1.5px',
      color: t.textMuted,
      marginBottom: '8px',
    },
    cardValue: {
      fontSize: '26px',
      fontWeight: '700',
      color: t.primary,
      lineHeight: 1,
    },
    cardSub: {
      fontSize: '12px',
      color: t.textMuted,
      marginTop: '6px',
    },
    analisisButtons: {
      display: 'flex',
      gap: '8px',
      marginBottom: '16px',
      flexWrap: 'wrap',
    },
    analisisBtn: (key) => ({
      background: analisis === key ? t.primary : t.bgCard,
      color: analisis === key ? '#fff' : t.textMuted,
      border: `1px solid ${analisis === key ? t.primary : t.border}`,
      borderRadius: '8px',
      padding: '8px 18px',
      fontSize: '13px',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'all 0.2s',
    }),
    table: {
      background: t.bgCard,
      border: `1px solid ${t.border}`,
      borderRadius: '12px',
      padding: '20px',
      boxShadow: t.shadow,
      marginBottom: '20px',
    },
    tableHeader: {
      display: 'grid',
      gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
      gap: '8px',
      fontSize: '11px',
      fontWeight: '600',
      letterSpacing: '1px',
      color: t.textMuted,
      borderBottom: `1px solid ${t.border}`,
      paddingBottom: '10px',
      marginBottom: '10px',
    },
    emptyState: {
      textAlign: 'center',
      padding: '40px',
      color: t.textMuted,
      fontSize: '14px',
    },
    bottomPanel: {
      background: t.bgCard,
      border: `1px solid ${t.border}`,
      borderRadius: '12px',
      padding: '20px',
      boxShadow: t.shadow,
    },
    tabs: {
      display: 'flex',
      gap: '8px',
      marginBottom: '16px',
    },
    tab: (key) => ({
      background: tabInferior === key ? t.tabActive : t.tabInactive,
      color: tabInferior === key ? '#fff' : t.tabInactiveText,
      border: 'none',
      borderRadius: '8px',
      padding: '8px 18px',
      fontSize: '13px',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'all 0.2s',
    }),
  }

  return (
    <div style={s.app}>
      {/* HEADER */}
      <div style={s.header}>
        <div style={s.logo}>
          <img src="/CLARA.CORE.png" alt="ClaraCore" style={{ height: '40px' }} />
        </div>

        <div style={s.themeSelector}>
          <button style={s.themeBtn('light')} onClick={() => setThemeMode('light')}>☀️ Claro</button>
          <button style={s.themeBtn('auto')} onClick={() => setThemeMode('auto')}>⚡ Auto</button>
          <button style={s.themeBtn('dark')} onClick={() => setThemeMode('dark')}>🌙 Oscuro</button>
        </div>
      </div>

      {/* BODY */}
      <div style={s.body}>
        <div style={s.contractBadge}>📋 Contrato: CODENSA 2024</div>

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
          <button style={s.analisisBtn('financiero')} onClick={() => setAnalisis('financiero')}>
            Presupuesto vs Cobro — Análisis Financiero
          </button>
          <button style={s.analisisBtn('pedidos')} onClick={() => setAnalisis('pedidos')}>
            Presupuesto vs Almacén — Análisis de Pedidos
          </button>
          <button style={s.analisisBtn('consumo')} onClick={() => setAnalisis('consumo')}>
            Cobro vs Almacén — Análisis de Consumo
          </button>
        </div>

        {/* TABLA */}
        <div style={s.table}>
          <div style={s.tableHeader}>
            <span>Ítem / Descripción</span>
            <span>Presupuesto</span>
            <span>Cobrado</span>
            <span>Delta</span>
            <span>Estado</span>
          </div>
          <div style={s.emptyState}>
            📂 Importa un archivo Excel para ver el análisis comparativo
          </div>
        </div>

        {/* PANEL INFERIOR */}
        <div style={s.bottomPanel}>
          <div style={s.tabs}>
            <button style={s.tab('gantt')} onClick={() => setTabInferior('gantt')}>
              📅 Programación / Gantt
            </button>
            <button style={s.tab('mapa')} onClick={() => setTabInferior('mapa')}>
              🗺️ Plano Semáforo
            </button>
          </div>
          <div style={s.emptyState}>
            {tabInferior === 'gantt'
              ? '📅 Diagrama Gantt — próximamente'
              : '🗺️ Plano Semáforo — próximamente'}
          </div>
        </div>
      </div>
    </div>
  )
}
import { useState } from 'react'

function App() {
  const [panelIzq, setPanelIzq] = useState('presupuesto')
  const [panelDer, setPanelDer] = useState('cobro')
  const [tabInferior, setTabInferior] = useState('gantt')

  return (
    <div style={{ fontFamily: 'sans-serif', background: '#0f172a', minHeight: '100vh', color: 'white', padding: '16px' }}>
      
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h1 style={{ color: '#00b4c6', margin: 0 }}>CLARACORE</h1>
        <span style={{ color: '#94a3b8' }}>Contrato: CODENSA 2024</span>
      </div>

      {/* 3 PANELES SUPERIORES */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <div style={{ background: '#1e293b', borderRadius: '8px', padding: '16px' }}>
          <div style={{ color: '#94a3b8', fontSize: '12px' }}>PRESUPUESTO</div>
          <div style={{ color: '#00b4c6', fontSize: '24px', fontWeight: 'bold' }}>$181,927,908</div>
        </div>
        <div style={{ background: '#1e293b', borderRadius: '8px', padding: '16px' }}>
          <div style={{ color: '#94a3b8', fontSize: '12px' }}>COBRO</div>
          <div style={{ color: '#00b4c6', fontSize: '24px', fontWeight: 'bold' }}>$1,380,239,453</div>
        </div>
        <div style={{ background: '#1e293b', borderRadius: '8px', padding: '16px' }}>
          <div style={{ color: '#94a3b8', fontSize: '12px' }}>ALMACÉN</div>
          <div style={{ color: '#00b4c6', fontSize: '24px', fontWeight: 'bold' }}>$0</div>
        </div>
      </div>

      {/* SELECTOR DE ANÁLISIS */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <button style={{ background: '#00b4c6', border: 'none', borderRadius: '6px', padding: '8px 16px', color: 'white', cursor: 'pointer' }}>
          Presupuesto vs Cobro
        </button>
        <button style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', padding: '8px 16px', color: 'white', cursor: 'pointer' }}>
          Presupuesto vs Almacén
        </button>
        <button style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', padding: '8px 16px', color: 'white', cursor: 'pointer' }}>
          Cobro vs Almacén
        </button>
      </div>

      {/* PANEL CENTRAL DE ANÁLISIS */}
      <div style={{ background: '#1e293b', borderRadius: '8px', padding: '16px', marginBottom: '16px', minHeight: '200px' }}>
        <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '12px' }}>ANÁLISIS COMPARATIVO</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '8px', fontSize: '12px', color: '#64748b', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
          <span>Ítem</span><span>ClaraCore</span><span>Cobrado</span><span>Delta Cant.</span><span>Estado</span>
        </div>
        <div style={{ color: '#475569', textAlign: 'center', padding: '40px', fontSize: '14px' }}>
          Importa un archivo Excel para ver el análisis
        </div>
      </div>

      {/* PANEL INFERIOR CON PESTAÑAS */}
      <div style={{ background: '#1e293b', borderRadius: '8px', padding: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <button 
            onClick={() => setTabInferior('gantt')}
            style={{ background: tabInferior === 'gantt' ? '#00b4c6' : '#0f172a', border: 'none', borderRadius: '6px', padding: '6px 14px', color: 'white', cursor: 'pointer' }}>
            Programación / Gantt
          </button>
          <button 
            onClick={() => setTabInferior('mapa')}
            style={{ background: tabInferior === 'mapa' ? '#00b4c6' : '#0f172a', border: 'none', borderRadius: '6px', padding: '6px 14px', color: 'white', cursor: 'pointer' }}>
            Plano Semáforo
          </button>
        </div>
        <div style={{ color: '#475569', textAlign: 'center', padding: '40px', fontSize: '14px' }}>
          {tabInferior === 'gantt' ? 'Diagrama Gantt — próximamente' : 'Plano Semáforo — próximamente'}
        </div>
      </div>

    </div>
  )
}

export default App
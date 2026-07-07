import { useState } from 'react'
import { getClaraTypeScaleInline } from './typographyScale'
import { TAB_KEYS, TAB_LABELS } from './contabilidad/contabilidadUi'
import ContabilidadTransacciones from './contabilidad/ContabilidadTransacciones'
import ContabilidadCuentas from './contabilidad/ContabilidadCuentas'
import ContabilidadCierre from './contabilidad/ContabilidadCierre'
import ContabilidadReportes from './contabilidad/ContabilidadReportes'

export default function ModuloContabilidad({
  t,
  token,
  fontSize = 'normal',
  onClose,
  esDeveloper = false,
  esContador = false,
}) {
  const [tab, setTab] = useState('transacciones')
  const fs = getClaraTypeScaleInline(fontSize)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 12000,
      background: t.bg, display: 'flex', flexDirection: 'column',
      fontSize: 'var(--cc-body)',
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', borderBottom: `1px solid ${t.border}`,
        background: t.bgCard, flexShrink: 0, gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: fs.h2, fontWeight: 800, color: t.primary }}>📊 Módulo de Contabilidad</div>
          <div style={{ fontSize: fs.sm, color: t.textMuted }}>ClaraCore — gestión financiera independiente de obra</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'transparent', border: `1.5px solid ${t.border}`, borderRadius: 10,
            padding: '10px 16px', color: t.text, fontWeight: 700, cursor: 'pointer', fontSize: fs.sm,
          }}
        >
          ← Volver a ClaraCore
        </button>
      </header>

      <nav style={{
        display: 'flex', gap: 4, padding: '10px 20px', borderBottom: `1px solid ${t.border}`,
        background: t.bgCard, flexShrink: 0, overflowX: 'auto',
      }}>
        {TAB_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            style={{
              background: tab === key ? t.primary + '22' : 'transparent',
              border: 'none',
              borderBottom: tab === key ? `3px solid ${t.primary}` : '3px solid transparent',
              padding: '10px 16px', cursor: 'pointer', fontWeight: tab === key ? 700 : 500,
              color: tab === key ? t.primary : t.textMuted, fontSize: fs.sm, whiteSpace: 'nowrap',
            }}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </nav>

      <main style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          {tab === 'transacciones' && (
            <ContabilidadTransacciones t={t} token={token} esDeveloper={esDeveloper} />
          )}
          {tab === 'cuentas' && <ContabilidadCuentas t={t} token={token} />}
          {tab === 'cierre' && (
            <ContabilidadCierre t={t} token={token} esContador={esContador} esDeveloper={esDeveloper} />
          )}
          {tab === 'reportes' && <ContabilidadReportes t={t} token={token} />}
        </div>
      </main>
    </div>
  )
}

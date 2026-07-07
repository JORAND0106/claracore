import { useCallback, useEffect, useState } from 'react'
import { getClaraTypeScaleInline } from './typographyScale'
import { TAB_KEYS, TAB_LABELS } from './contabilidad/contabilidadUi'
import { contabGet } from './contabilidad/contabilidadApi'
import ContabilidadTransacciones from './contabilidad/ContabilidadTransacciones'
import ContabilidadCuentas from './contabilidad/ContabilidadCuentas'
import ContabilidadCierre from './contabilidad/ContabilidadCierre'
import ContabilidadReportes from './contabilidad/ContabilidadReportes'
import ContabilidadDocumentos from './contabilidad/ContabilidadDocumentos'

export default function ModuloContabilidad({
  t,
  token,
  fontSize = 'normal',
  onClose,
  esDeveloper = false,
  esContador = false,
  logoFilter = 'none',
}) {
  const [tab, setTab] = useState('transacciones')
  const [alertasDocs, setAlertasDocs] = useState(0)
  const fs = getClaraTypeScaleInline(fontSize)

  const cargarAlertas = useCallback(async () => {
    try {
      const r = await contabGet('/documentos/alertas-vencimiento', token, { dias_alerta: 30 })
      setAlertasDocs(Number(r?.total_alertas) || 0)
    } catch {
      setAlertasDocs(0)
    }
  }, [token])

  useEffect(() => { cargarAlertas() }, [cargarAlertas])

  useEffect(() => {
    if (tab === 'documentos' || tab === 'reportes') cargarAlertas()
  }, [tab, cargarAlertas])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 12000,
      background: t.bg, display: 'flex', flexDirection: 'column',
      fontSize: 'var(--cc-body)',
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: `1px solid ${t.border}`,
        background: t.bgCard, flexShrink: 0, gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <img
            src="/CLARA.CORE.png"
            alt="ClaraCore"
            className="cc-brand-logo cc-brand-logo--header"
            style={{ height: 40, width: 'auto', flexShrink: 0, filter: logoFilter }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: fs.md, fontWeight: 800, color: t.primary, lineHeight: 1.25 }}>
              Módulo de Contabilidad
            </div>
            <div style={{ fontSize: fs.sm, color: t.textMuted }}>Gestión financiera · independiente de obra</div>
          </div>
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
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            {TAB_LABELS[key]}
            {key === 'documentos' && alertasDocs > 0 && (
              <span style={{
                background: '#EF4444', color: '#fff', borderRadius: 10,
                padding: '1px 7px', fontSize: '0.75em', fontWeight: 800, lineHeight: 1.4,
              }}>
                {alertasDocs > 99 ? '99+' : alertasDocs}
              </span>
            )}
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
          {tab === 'reportes' && (
            <ContabilidadReportes t={t} token={token} onIrDocumentos={() => setTab('documentos')} />
          )}
          {tab === 'documentos' && (
            <ContabilidadDocumentos t={t} token={token} onAlertasChange={cargarAlertas} />
          )}
        </div>
      </main>
    </div>
  )
}

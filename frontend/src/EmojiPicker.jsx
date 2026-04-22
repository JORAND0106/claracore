import { useState, useEffect, useRef } from 'react'

// ─── EMOJI PICKER ─────────────────────────────────────────────────────────────
const EMOJIS = [
  // Caras útiles
  '😀','😊','😅','🤔','😬','😤','😮','🥴','😎','🤝',
  // Manos / gestos
  '👍','👎','👌','✌️','🤞','👏','🙌','🙏','💪','👷',
  // Estado / semáforo
  '✅','❌','⚠️','🔴','🟠','🟡','🟢','🔵','⛔','🚫',
  // Símbolos útiles construcción
  '📌','📍','🔧','🔨','⛏️','🏗️','🚧','🏢','📐','📏',
  // Documentos / datos
  '📝','📋','📊','📈','📉','📁','🗂️','📎','📌','🔗',
  // Alertas / marcadores
  '❗','❓','💡','🔔','📢','🚨','🆘','🆗','🆕','🆙',
  // Tiempo / proceso
  '⏳','⏰','📅','🕐','🔄','▶️','⏸️','⏹️','🔁','🔃',
  // Dinero / métricas
  '💰','💵','💲','📦','🎯','🏆','✨','🌟','💎','🔑',
  // Flechas / símbolos
  '➡️','⬅️','⬆️','⬇️','↩️','↪️','🔼','🔽','➕','➖',
  // Comunicación
  '💬','✉️','📨','📩','📤','📥','🗣️','👀','🤫','💭',
]

export function EmojiPicker({ onSelect, t }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])
  return (
    <div ref={ref} style={{ position:'relative', display:'inline-block' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        title="Insertar emoji"
        style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'6px', padding:'4px 8px', fontSize:'14px', cursor:'pointer', color:t.textMuted, lineHeight:1 }}>
        🙂
      </button>
      {open && (
        <div style={{ position:'absolute', bottom:'calc(100% + 6px)', right:0, zIndex:9999, background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'10px', padding:'8px', boxShadow:'0 8px 32px rgba(0,0,0,0.25)', display:'grid', gridTemplateColumns:'repeat(10, 1fr)', gap:'2px', width:'340px', maxHeight:'280px', overflowY:'auto' }}>
          {EMOJIS.map(em => (
            <button key={em} type="button" onClick={() => { onSelect(em); setOpen(false) }}
              style={{ background:'transparent', border:'none', borderRadius:'4px', padding:'4px', fontSize:'16px', cursor:'pointer', lineHeight:1 }}
              onMouseEnter={e => e.currentTarget.style.background=t.bg}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              {em}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default EmojiPicker

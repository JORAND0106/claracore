/**
 * Estilos compartidos del prose TipTap de temas (editor + vista solo lectura).
 * `variant: 'editor'` incluye placeholder, resize de columnas y gapcursor.
 */
export function temaRichProseCss(t = {}, { minHeight = 0, variant = 'readonly' } = {}) {
  const text = t.text || '#0f172a'
  const textMuted = t.textMuted || '#94a3b8'
  const primary = t.primary || '#0f766e'
  const border = t.border || '#cbd5e1'
  const bgCard = t.bgCard || '#fff'
  const bg = t.bg || '#f8fafc'
  const editorBits = variant === 'editor'
    ? `
.tema-rich-prose {
  min-height: ${Math.max(0, Number(minHeight) || 0)}px;
  padding: 10px 12px;
  outline: none;
  font-size: var(--cc-input, 14px);
}
.tema-rich-prose p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: ${textMuted};
  pointer-events: none;
  height: 0;
}
.tema-rich-prose .is-empty::before {
  color: ${textMuted};
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}
.tema-rich-prose .column-resize-handle {
  position: absolute;
  right: -2px;
  top: 0;
  bottom: 0;
  width: 6px;
  background: ${primary};
  opacity: 0.35;
  cursor: col-resize;
  pointer-events: auto;
  z-index: 2;
}
.tema-rich-prose.resize-cursor {
  cursor: col-resize;
}
.tema-rich-prose .ProseMirror-gapcursor {
  display: none;
  pointer-events: none;
  position: absolute;
}
.tema-rich-prose .ProseMirror-gapcursor:after {
  content: '';
  display: block;
  position: absolute;
  top: -2px;
  width: 20px;
  border-top: 1px solid ${text};
  animation: tema-rich-gapcursor-blink 1.1s steps(2, start) infinite;
}
@keyframes tema-rich-gapcursor-blink {
  to { visibility: hidden; }
}
`
    : `
.tema-rich-prose {
  padding: 0;
  font-size: inherit;
}
.tema-rich-prose--clamp {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}
.tema-rich-prose--clamp p:last-child { margin-bottom: 0; }
`

  return `
.tema-rich-prose {
  color: ${text};
  line-height: 1.45;
  word-break: break-word;
}
.tema-rich-prose p { margin: 0 0 0.55em; }
.tema-rich-prose p:last-child { margin-bottom: 0; }
.tema-rich-prose ul {
  margin: 0.35em 0 0.55em;
  padding-left: 1.35em;
  list-style-type: disc;
}
.tema-rich-prose ul ul { list-style-type: circle; }
.tema-rich-prose ul ul ul { list-style-type: square; }
.tema-rich-prose ol {
  list-style: none;
  margin: 0.35em 0 0.55em;
  padding-left: 0;
  counter-reset: item;
}
.tema-rich-prose ol > li {
  display: block;
  position: relative;
  counter-increment: item;
  margin: 0.15em 0;
  padding-left: 2.1em;
}
.tema-rich-prose ol > li::before {
  content: counters(item, ".") ".";
  position: absolute;
  left: 0;
  top: 0;
  font-weight: 700;
  color: ${primary};
  white-space: nowrap;
}
.tema-rich-prose ol ol {
  margin-top: 0.15em;
  margin-bottom: 0.15em;
}
.tema-rich-prose li p { margin: 0; display: inline; }
.tema-rich-prose li > p { display: block; }
.tema-rich-prose strong { font-weight: 700; }
.tema-rich-prose em { font-style: italic; }
.tema-rich-prose u { text-decoration: underline; }
.tema-rich-prose .tableWrapper {
  overflow-x: auto;
  margin: 0.5em 0;
}
.tema-rich-prose table.tema-rich-table,
.tema-rich-prose table {
  border-collapse: collapse;
  width: auto;
  max-width: 100%;
  table-layout: fixed;
  margin: 0;
}
.tema-rich-prose th,
.tema-rich-prose td {
  border: 1px solid ${border};
  padding: 6px 8px;
  vertical-align: top;
  min-width: 40px;
  position: relative;
  background: ${bgCard};
}
.tema-rich-prose th {
  font-weight: 700;
  background: ${bg};
}
${editorBits}
`
}

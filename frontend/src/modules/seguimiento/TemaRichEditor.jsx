import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import { Table } from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef, useState } from 'react'
import { plainTextToHtml } from './richTextUtils'
import { EnsureEditableAfterTable } from './temaEnsureEditableAfterTable.js'
import { scrollEditorCaretIntoView } from './temaEditorScroll.js'
import { applyColumnWidthPx, currentCellColWidth } from './temaTableWidth'

/**
 * Editor TipTap para temas/ideas y bitácora (Actas, Observaciones Diario, Evento).
 * - Viñetas, numeración y listas multinivel
 * - Negrita / cursiva / subrayado
 * - Tablas con columnas redimensionables (arrastre + ancho numérico)
 * - Auto-scroll del caret al escribir contenido largo
 * - Párrafo editable garantizado tras cada tabla
 */
export default function TemaRichEditor({
  t,
  value = '',
  onChange,
  editable = true,
  minHeight = 120,
  placeholder = '',
  /** Si se pega una imagen, el padre puede adjuntarla como esquema (no insertarla en el HTML). */
  onPasteImage = null,
}) {
  const editorRef = useRef(null)
  const skipNextExternal = useRef(false)
  const onPasteImageRef = useRef(onPasteImage)
  const onChangeRef = useRef(onChange)
  const [colWidthDraft, setColWidthDraft] = useState('')
  const [, setTick] = useState(0)

  useEffect(() => {
    onPasteImageRef.current = onPasteImage
  }, [onPasteImage])

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        blockquote: false,
        horizontalRule: false,
        orderedList: { keepMarks: true, keepAttributes: false },
        bulletList: { keepMarks: true, keepAttributes: false },
      }),
      Underline,
      Placeholder.configure({ placeholder }),
      Table.configure({
        resizable: true,
        lastColumnResizable: true,
        handleWidth: 6,
        cellMinWidth: 40,
        HTMLAttributes: { class: 'tema-rich-table' },
      }),
      TableRow,
      TableHeader,
      TableCell,
      EnsureEditableAfterTable,
    ],
    content: plainTextToHtml(value),
    editable,
    editorProps: {
      attributes: {
        class: 'tema-rich-prose',
      },
      // ProseMirror también intenta scroll interno; el modal lo completa onUpdate.
      scrollThreshold: 24,
      scrollMargin: 24,
      handlePaste: (_view, event) => {
        const pasteImg = onPasteImageRef.current
        if (typeof pasteImg !== 'function') return false
        const items = event.clipboardData?.items
        if (!items?.length) return false
        for (const item of items) {
          if (item.type?.startsWith('image/')) {
            const file = item.getAsFile()
            if (!file) continue
            event.preventDefault()
            pasteImg(file)
            return true
          }
        }
        return false
      },
      handleKeyDown: (_view, event) => {
        const key = (event.key || '').toLowerCase()
        const mod = event.ctrlKey || event.metaKey
        if (!mod) return false
        const ed = editorRef.current
        if (!ed) return false
        if (key === 'n') {
          event.preventDefault()
          event.stopPropagation()
          ed.chain().focus().toggleBold().run()
          return true
        }
        if (key === 'k') {
          event.preventDefault()
          event.stopPropagation()
          ed.chain().focus().toggleItalic().run()
          return true
        }
        if (key === 's') {
          event.preventDefault()
          event.stopPropagation()
          ed.chain().focus().toggleUnderline().run()
          return true
        }
        return false
      },
    },
    onCreate: ({ editor: ed }) => {
      editorRef.current = ed
    },
    onUpdate: ({ editor: ed }) => {
      skipNextExternal.current = true
      onChangeRef.current?.(ed.getHTML())
      setTick((n) => n + 1)
      requestAnimationFrame(() => scrollEditorCaretIntoView(ed))
    },
    onSelectionUpdate: ({ editor: ed }) => {
      setTick((n) => n + 1)
      requestAnimationFrame(() => scrollEditorCaretIntoView(ed))
    },
  })

  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  // Sincroniza valor externo (carga de acta / Clara) sin romper el caret en escritura local.
  useEffect(() => {
    if (!editor) return
    if (skipNextExternal.current) {
      skipNextExternal.current = false
      return
    }
    const next = plainTextToHtml(value)
    const cur = editor.getHTML()
    if (normalizeHtml(cur) !== normalizeHtml(next)) {
      editor.commands.setContent(next, false)
    }
  }, [value, editor])

  useEffect(() => {
    if (editor) editor.setEditable(!!editable)
  }, [editable, editor])

  useEffect(() => {
    if (!editor) return undefined
    const sync = () => {
      const w = currentCellColWidth(editor)
      setColWidthDraft(w != null ? String(w) : '')
    }
    sync()
    editor.on('selectionUpdate', sync)
    return () => {
      editor.off('selectionUpdate', sync)
    }
  }, [editor])

  if (!editor) {
    return (
      <div style={{ ...box(t), minHeight, color: t.textMuted, fontSize: 'var(--cc-sm)', padding: 12 }}>
        Cargando editor…
      </div>
    )
  }

  const inTable = editor.isActive('table')
  const btn = (active) => ({
    border: `1px solid ${active ? t.primary : t.border}`,
    background: active ? `${t.primary}22` : 'transparent',
    color: active ? t.primary : t.text,
    borderRadius: 6,
    padding: '5px 8px',
    cursor: editable ? 'pointer' : 'default',
    fontSize: 'var(--cc-sm)',
    fontWeight: 700,
    lineHeight: 1,
    minWidth: 32,
    minHeight: 32,
  })

  const applyWidth = () => {
    if (!editable) return
    applyColumnWidthPx(editor, colWidthDraft)
    editor.chain().focus().run()
    setTick((n) => n + 1)
  }

  return (
    <div style={box(t)}>
      <style>{editorCss(t, minHeight)}</style>
      {editable && (
        <div
          role="toolbar"
          aria-label="Formato del tema"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            padding: '8px 8px 0',
            borderBottom: `1px solid ${t.border}`,
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            title="Negrita (Ctrl+N)"
            aria-pressed={editor.isActive('bold')}
            style={btn(editor.isActive('bold'))}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <b>N</b>
          </button>
          <button
            type="button"
            title="Cursiva (Ctrl+K)"
            aria-pressed={editor.isActive('italic')}
            style={btn(editor.isActive('italic'))}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <i>K</i>
          </button>
          <button
            type="button"
            title="Subrayado (Ctrl+S)"
            aria-pressed={editor.isActive('underline')}
            style={btn(editor.isActive('underline'))}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <span style={{ textDecoration: 'underline' }}>S</span>
          </button>
          <span style={{ width: 1, background: t.border, margin: '4px 2px', alignSelf: 'stretch' }} aria-hidden="true" />
          <button
            type="button"
            title="Viñetas"
            aria-pressed={editor.isActive('bulletList')}
            style={btn(editor.isActive('bulletList'))}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            • Lista
          </button>
          <button
            type="button"
            title="Numeración automática"
            aria-pressed={editor.isActive('orderedList')}
            style={btn(editor.isActive('orderedList'))}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            1. Lista
          </button>
          <span style={{ width: 1, background: t.border, margin: '4px 2px', alignSelf: 'stretch' }} aria-hidden="true" />
          <button
            type="button"
            title="Insertar tabla 3×3"
            aria-pressed={inTable}
            style={btn(inTable)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
              // EnsureEditableAfterTable añade párrafo tras la tabla; enfocar scroll.
              requestAnimationFrame(() => scrollEditorCaretIntoView(editor))
            }}
          >
            ⊞ Tabla
          </button>
          {inTable && (
            <>
              <button
                type="button"
                title="Agregar fila"
                style={btn(false)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().addRowAfter().run()}
              >
                + Fila
              </button>
              <button
                type="button"
                title="Agregar columna"
                style={btn(false)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().addColumnAfter().run()}
              >
                + Col
              </button>
              <button
                type="button"
                title="Eliminar fila"
                style={btn(false)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().deleteRow().run()}
              >
                − Fila
              </button>
              <button
                type="button"
                title="Eliminar columna"
                style={btn(false)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().deleteColumn().run()}
              >
                − Col
              </button>
              <button
                type="button"
                title="Eliminar tabla"
                style={btn(false)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().deleteTable().run()}
              >
                Quitar tabla
              </button>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  color: t.textMuted,
                  fontWeight: 600,
                  marginLeft: 4,
                }}
                title="Ancho de la columna activa (px). También puede arrastrar el borde entre columnas."
              >
                Ancho
                <input
                  type="number"
                  min={40}
                  max={640}
                  value={colWidthDraft}
                  onChange={(e) => setColWidthDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      applyWidth()
                    }
                  }}
                  style={{
                    width: 64,
                    boxSizing: 'border-box',
                    border: `1px solid ${t.border}`,
                    borderRadius: 6,
                    padding: '4px 6px',
                    fontSize: 12,
                    background: t.bgCard || '#fff',
                    color: t.text,
                    height: 32,
                  }}
                />
                <button
                  type="button"
                  style={{ ...btn(false), fontSize: 11 }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={applyWidth}
                >
                  Aplicar
                </button>
              </label>
            </>
          )}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  )
}

function normalizeHtml(html) {
  return String(html || '')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim()
}

function box(t) {
  return {
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    background: t.bg || t.bgCard,
    overflow: 'hidden',
  }
}

function editorCss(t, minHeight) {
  return `
.tema-rich-prose {
  min-height: ${minHeight}px;
  padding: 10px 12px;
  outline: none;
  color: ${t.text};
  font-size: var(--cc-input, 14px);
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
  color: ${t.primary || '#0f766e'};
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
.tema-rich-prose p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: ${t.textMuted || '#94a3b8'};
  pointer-events: none;
  height: 0;
}
.tema-rich-prose .is-empty::before {
  color: ${t.textMuted || '#94a3b8'};
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}
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
  border: 1px solid ${t.border || '#cbd5e1'};
  padding: 6px 8px;
  vertical-align: top;
  min-width: 40px;
  position: relative;
  background: ${t.bgCard || '#fff'};
}
.tema-rich-prose th {
  font-weight: 700;
  background: ${t.bg || '#f8fafc'};
}
.tema-rich-prose .column-resize-handle {
  position: absolute;
  right: -2px;
  top: 0;
  bottom: 0;
  width: 6px;
  background: ${t.primary || '#2563eb'};
  opacity: 0.35;
  cursor: col-resize;
  pointer-events: auto;
  z-index: 2;
}
.tema-rich-prose.resize-cursor {
  cursor: col-resize;
}
/* Gapcursor: permite colocar el caret antes/después de tablas */
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
  border-top: 1px solid ${t.text || '#0f172a'};
  animation: tema-rich-gapcursor-blink 1.1s steps(2, start) infinite;
}
@keyframes tema-rich-gapcursor-blink {
  to { visibility: hidden; }
}
`
}

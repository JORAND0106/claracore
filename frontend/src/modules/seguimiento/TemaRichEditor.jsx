import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef } from 'react'
import { plainTextToHtml } from './richTextUtils'

/**
 * Editor TipTap para temas/ideas centrales.
 * - Viñetas, numeración y listas multinivel (1. / 1.1. / 1.1.1. vía CSS counters)
 * - Negrita / cursiva / subrayado por barra y Ctrl+N / Ctrl+K / Ctrl+S
 *   (preventDefault solo con el foco en el editor, para no disparar guardar del navegador)
 */
export default function TemaRichEditor({
  t,
  value = '',
  onChange,
  editable = true,
  minHeight = 120,
  placeholder = 'Redacte el tema…',
}) {
  const editorRef = useRef(null)
  const skipNextExternal = useRef(false)

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
    ],
    content: plainTextToHtml(value),
    editable,
    editorProps: {
      attributes: {
        class: 'tema-rich-prose',
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
      onChange?.(ed.getHTML())
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

  if (!editor) {
    return (
      <div style={{ ...box(t), minHeight, color: t.textMuted, fontSize: 'var(--cc-sm)', padding: 12 }}>
        Cargando editor…
      </div>
    )
  }

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
          <span style={{ width: 1, background: t.border, margin: '4px 2px' }} aria-hidden="true" />
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
          <button
            type="button"
            title="Aumentar nivel (Tab)"
            disabled={!editor.can().sinkListItem('listItem')}
            style={{
              ...btn(false),
              opacity: editor.can().sinkListItem('listItem') ? 1 : 0.4,
            }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
          >
            → Nivel
          </button>
          <button
            type="button"
            title="Reducir nivel (Shift+Tab)"
            disabled={!editor.can().liftListItem('listItem')}
            style={{
              ...btn(false),
              opacity: editor.can().liftListItem('listItem') ? 1 : 0.4,
            }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().liftListItem('listItem').run()}
          >
            ← Nivel
          </button>
        </div>
      )}
      <EditorContent editor={editor} />
      {editable && (
        <div style={{
          fontSize: 'var(--cc-xs)',
          color: t.textMuted,
          padding: '4px 10px 8px',
          lineHeight: 1.35,
        }}>
          Atajos: Ctrl+N negrita · Ctrl+K cursiva · Ctrl+S subrayado · Tab / botones de nivel para 1. → 1.1. → 1.1.1.
        </div>
      )}
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
  padding-left: 1.35em;
  counter-reset: item;
}
.tema-rich-prose ol > li {
  display: block;
  position: relative;
  counter-increment: item;
  margin: 0.15em 0;
}
.tema-rich-prose ol > li::before {
  content: counters(item, ".") ". ";
  font-weight: 700;
  color: ${t.primary || '#0f766e'};
}
.tema-rich-prose li p { margin: 0; }
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
`
}

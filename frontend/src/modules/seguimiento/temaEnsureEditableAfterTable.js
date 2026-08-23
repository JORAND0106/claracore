import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { buildEnsureEditableAfterTablesTransaction } from './temaEditorTables.js'

/**
 * Tras insertar/editar tablas, garantiza un párrafo editable inmediatamente después
 * (varias tablas seguidas o tabla al final del documento).
 */
export const EnsureEditableAfterTable = Extension.create({
  name: 'ensureEditableAfterTable',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('ensureEditableAfterTable'),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null
          return buildEnsureEditableAfterTablesTransaction(newState)
        },
      }),
    ]
  },
})

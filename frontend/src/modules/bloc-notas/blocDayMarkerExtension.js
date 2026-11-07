/**
 * Extensión TipTap (opt-in Bloc): conserva class + data-bloc-day en párrafos
 * de fecha automática para que getHTML() no los despoje.
 */
import Paragraph from '@tiptap/extension-paragraph'

export const BlocDayParagraph = Paragraph.extend({
  name: 'paragraph',
  addAttributes() {
    return {
      ...this.parent?.(),
      class: {
        default: null,
        parseHTML: (element) => element.getAttribute('class'),
        renderHTML: (attributes) => {
          if (!attributes.class) return {}
          return { class: attributes.class }
        },
      },
      blocDay: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-bloc-day'),
        renderHTML: (attributes) => {
          if (!attributes.blocDay) return {}
          return {
            'data-bloc-day': attributes.blocDay,
            class: 'bloc-day-marker',
            contenteditable: 'false',
          }
        },
      },
    }
  },
})

export default BlocDayParagraph

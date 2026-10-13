import { isRichTextEmpty, plainTextToHtml } from './richTextUtils'
import { temaRichProseCss } from './temaRichProseCss'

/**
 * Vista solo lectura del HTML TipTap de un tema (mismo aspecto que el editor).
 * No modifica el contenido guardado: solo lo muestra.
 *
 * `injectCss`: si el padre ya inyectó `temaRichProseCss`, poner false.
 */
export default function TemaProseHtml({
  t,
  html = '',
  clamp = false,
  className = '',
  style = undefined,
  injectCss = true,
}) {
  if (isRichTextEmpty(html)) return null
  const safe = plainTextToHtml(html)
  const cls = [
    'tema-rich-prose',
    clamp ? 'tema-rich-prose--clamp' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <>
      {injectCss ? <style>{temaRichProseCss(t, { variant: 'readonly' })}</style> : null}
      <div
        className={cls}
        style={style}
        dangerouslySetInnerHTML={{ __html: safe }}
      />
    </>
  )
}

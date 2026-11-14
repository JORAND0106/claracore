/**
 * Capas de apilamiento SicoeObra.
 *
 * La carpeta del reporte (CarpetaReporte) usa z-index 15000.
 * Cualquier herramienta/popup portaleado a document.body que se abra
 * desde la carpeta debe quedar por encima de ese valor; si no, queda
 * detrás del overlay oscuro y bloquea al usuario.
 *
 * Los overlays anidados dentro de la carpeta (galerías, lightbox) viven
 * en su stacking context y no necesitan competir a nivel de body.
 */

/** Ventana del reporte / carpeta a pantalla completa. */
export const SICOE_CARPETA_Z = 15000

/**
 * Popups institucionales y listas abiertas desde la carpeta
 * (esquemas, avisos, info ítem, cuadro aceros, oferta dibujar, menús).
 */
export const SICOE_POPUP_SOBRE_CARPETA_Z = 16000

/** Herramienta fullscreen: EsquemaEditorModal / Dibujar. */
export const SICOE_HERRAMIENTA_Z = 17000

/** Popups anidados de la herramienta (asignar, refs, 3D UI). */
export const SICOE_HERRAMIENTA_POPUP_Z = 18000

/** Toasts / errores encima de popups de la herramienta. */
export const SICOE_HERRAMIENTA_TOAST_Z = 18100

/** Comprueba que las capas de herramienta quedan delante de la carpeta. */
export function sicoeHerramientasPorDelanteDeCarpeta() {
  return (
    SICOE_POPUP_SOBRE_CARPETA_Z > SICOE_CARPETA_Z
    && SICOE_HERRAMIENTA_Z > SICOE_POPUP_SOBRE_CARPETA_Z
    && SICOE_HERRAMIENTA_POPUP_Z > SICOE_HERRAMIENTA_Z
    && SICOE_HERRAMIENTA_TOAST_Z > SICOE_HERRAMIENTA_POPUP_Z
  )
}

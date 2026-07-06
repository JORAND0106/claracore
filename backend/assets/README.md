# Assets estáticos del backend (no servidos públicamente)

## Logo ClaraCore para PDFs contractuales

Colocar aquí el archivo del logo con uno de estos nombres (en orden de preferencia):

1. `CLARA.CORE.png`
2. `claracore-logo.png`
3. `logo-claracore.png`

El módulo `contrato_documentos_service.logo_claracore_path()` resuelve la ruta en tiempo de generación del PDF.

Formato recomendado: PNG con fondo transparente, ancho ~400–600 px.

## Plantilla legal del contrato de licenciamiento

| Archivo | Uso |
|---------|-----|
| `docs/Contrato_Licencia_Uso_ClaraCore.docx` | **Fuente legal** (Word, placeholders `{{...}}`) |
| `contrato_licencia_plantilla.txt` | Texto derivado para generación PDF (`contrato_documentos_pdf.py`) |

Si se modifica el DOCX en `docs/Contrato_Licencia_Uso_ClaraCore.docx`, regenerar el `.txt` en esta carpeta extrayendo el texto con los marcadores (sin la «Nota técnica» final del borrador).

Placeholders soportados: `{{NUMERO_CONTRATO}}`, `{{FECHA_GENERACION}}`, `{{CLARACORE_NIT}}`, `{{LIC_RAZON_SOCIAL}}`, `{{LIC_NIT}}`, `{{LIC_REPRESENTANTE}}`, `{{LIC_CEDULA}}`, `{{LIC_DIRECCION}}`, `{{LIC_EMAIL}}`, `{{LIC_OBRA}}`, `{{LIC_VALOR_MENSUAL}}`, `{{LIC_VALOR_MENSUAL_LETRAS}}`.

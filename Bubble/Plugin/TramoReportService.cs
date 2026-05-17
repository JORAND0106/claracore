using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Net;

namespace SicoePresupuestoNET8
{
    internal static class TramoReportService
    {
        // ================== CONTEXTO PRESUPUESTO (CAPÍTULO / COMPETENCIA) ==================
        private static string _capituloActual = string.Empty;
        private static string _competenciaActual = string.Empty;

        private const string IndexStartMarker = "<!--TRAMO_INDEX_START-->";
        private const string IndexEndMarker = "<!--TRAMO_INDEX_END-->";

        private static string BuildCapCompSuffixHtml()
        {
            if (string.IsNullOrWhiteSpace(_capituloActual) && string.IsNullOrWhiteSpace(_competenciaActual))
                return string.Empty;

            string capHtml = WebUtility.HtmlEncode(_capituloActual ?? string.Empty);
            string compHtml = WebUtility.HtmlEncode(_competenciaActual ?? string.Empty);
            return $" ({capHtml} - {compHtml})";
        }

        private static string BuildSectionId(string tramoNombre)
        {
            var baseName = (tramoNombre ?? string.Empty) +
                           (_capituloActual ?? string.Empty) +
                           (_competenciaActual ?? string.Empty);

            var sb = new StringBuilder("tramo-");

            foreach (char ch in baseName.ToLowerInvariant())
            {
                if (char.IsLetterOrDigit(ch))
                {
                    sb.Append(ch);
                }
                else if (ch == '+' || ch == '-')
                {
                    sb.Append(ch);
                }
                else
                {
                    if (sb[sb.Length - 1] != '-')
                        sb.Append('-');
                }
            }

            return sb.ToString();
        }

        /// <summary>
        /// Fija el capítulo y la competencia que se mostrarán en el título del tramo.
        /// Se llama desde FrmSicoePresupuesto.BtnAgritem_Click.
        /// </summary>
        public static void SetCapituloCompetencia(string capitulo, string competencia)
        {
            _capituloActual = capitulo ?? string.Empty;
            _competenciaActual = competencia ?? string.Empty;
        }

        private static readonly object _sync = new object();

        /// <summary>
        /// Agrega una sección de informe HTML para un tramo.
        /// Si el archivo no existe, lo crea con cabecera, estilos y estructura base.
        /// Si existe, inserta la sección antes de </body>.
        /// </summary>
        public static void AppendTramoHtml(
            string filePath,
            string tramoNombre,
            IReadOnlyList<FrmNombrarTramo.TramoJson> tramos,
            string? graficoPath)
        {
            if (tramos == null || tramos.Count == 0)
                return;

            lock (_sync)
            {
                string? dir = Path.GetDirectoryName(filePath);
                if (!string.IsNullOrEmpty(dir))
                    Directory.CreateDirectory(dir);

                // Logo SicoeCAD (ruta física → URL file://)
                const string logoPathFs =
                    @"C:\Users\JORAND\OneDrive\Aplicaciones y Macros\Programación_Visual Studio\SicoePresupuestoNET8\SicoePresupuestoNET8\SicoeCAD.png";

                string logoUrl = File.Exists(logoPathFs)
                    ? new Uri(logoPathFs).AbsoluteUri
                    : string.Empty;

                // Id “slug” único por tramo (para ancla, índice y comentarios)
                string tramoSlug = MakeSlug(tramoNombre);
                string tramoId = "tramo-" + tramoSlug;

                string sectionHtml = BuildTramoSectionHtml(tramoNombre, tramoId, tramos, graficoPath);
                string indexHtml = BuildTramoIndexEntryHtml(tramoNombre, tramoId);

                if (!File.Exists(filePath))
                {
                    var sb = new StringBuilder();

                    sb.AppendLine("<!DOCTYPE html>");
                    sb.AppendLine("<html lang=\"es\">");
                    sb.AppendLine("<head>");
                    sb.AppendLine("  <meta charset=\"utf-8\" />");
                    sb.AppendLine("  <title>SICOE - Informe de Tramos de Tubería</title>");
                    sb.AppendLine(BuildCss());
                    sb.AppendLine("</head>");
                    sb.AppendLine("<body>");

                    // ===== ENCABEZADO DEL INFORME (LOGO IZQUIERDA, TEXTO DERECHA) =====
                    sb.AppendLine("  <header class=\"hdr\">");

                    // Logo a la izquierda
                    if (!string.IsNullOrEmpty(logoUrl))
                    {
                        sb.AppendLine("    <div class=\"hdr-logo\">");
                        sb.AppendLine($"      <img src=\"{logoUrl}\" alt=\"SicoeCAD\" />");
                        sb.AppendLine("    </div>");
                    }

                    // Texto a la derecha, justificado a la derecha
                    sb.AppendLine("    <div class=\"hdr-text\">");
                    sb.AppendLine("      <div class=\"hdr-title\">CONTRATO IDU-1551-2017</div>");
                    sb.AppendLine("      <div class=\"hdr-subtitle\">Unión Temporal MURCON</div>");
                    sb.AppendLine("      <div class=\"hdr-meta\">");
                    sb.AppendLine("        Objeto de contrato: AJUSTES Y/O ACTUALIZACIÓN Y/O COMPLEMENTACIÓN A LOS ESTUDIOS Y DISEÑOS" +
                                  "Y CONSTRUCCIÓN DE LA AVENIDA LAUREANO GÓMEZ (AK 9) DESDE AV. SAN JOSÉ (AC 170) HASTA LA CALLE 193, ACUERDO 646 DE 2016" +
                                  "EN LA CIUDAD DE BOGOTÁ D.C.");
                    sb.AppendLine("      </div>");
                    sb.AppendLine("      <div class=\"hdr-meta\">Módulo: Informe de Tramos de Tubería - SicoeCAD&#174;</div>");
                    sb.AppendLine($"      <div class=\"hdr-meta\">Generado: {DateTime.Now:yyyy-MM-dd HH:mm}</div>");
                    sb.AppendLine("      <div class=\"hdr-meta-small\">&copy; 2025 SicoeCAD. Todos los derechos reservados.</div>");
                    sb.AppendLine("    </div>");

                    sb.AppendLine("  </header>");

                    sb.AppendLine("  <main class=\"main\">");

                    // NAV de índice con marcadores
                    sb.AppendLine("    <nav class=\"tramo-index\">");
                    sb.AppendLine("      <div class=\"tramo-index-title\">Índice de tramos</div>");
                    sb.AppendLine("      <ul id=\"tramoIndexList\">");
                    sb.AppendLine("        <!--TRAMOS-INDEX-->");
                    sb.AppendLine("      </ul>");
                    sb.AppendLine("    </nav>");

                    // Marcador donde se insertan las secciones
                    sb.AppendLine("    <!--TRAMOS-SECTIONS-->");
                    sb.AppendLine("  </main>");

                    // Script global (eliminar tramo + comentarios)
                    sb.AppendLine("  <script>");
                    sb.AppendLine("    const SICOE_TRAMO_PASSWORD = 'SicoeCAD';");
                    sb.AppendLine("    function eliminarTramo(tramoId) {");
                    sb.AppendLine("      var pass = prompt('Ingrese la contraseña para eliminar este tramo:');");
                    sb.AppendLine("      if (pass === null) return;");
                    sb.AppendLine("      if (pass !== SICOE_TRAMO_PASSWORD) { alert('Contraseña incorrecta.'); return; }");
                    sb.AppendLine("      var sec = document.getElementById(tramoId);");
                    sb.AppendLine("      if (sec && sec.parentNode) sec.parentNode.removeChild(sec);");
                    sb.AppendLine("      var link = document.querySelector('.tramo-index a[href=\"#' + tramoId + '\"]');");
                    sb.AppendLine("      if (link && link.parentNode) link.parentNode.removeChild(link);");
                    sb.AppendLine("    }");
                    sb.AppendLine();
                    sb.AppendLine("    function agregarComentario(tramoId) {");
                    sb.AppendLine("      var txt = document.getElementById('txtComentario-' + tramoId);");
                    sb.AppendLine("      var nom = document.getElementById('txtNombre-' + tramoId);");
                    sb.AppendLine("      var cargo = document.getElementById('cmbCargo-' + tramoId);");
                    sb.AppendLine("      var lista = document.getElementById('comments-' + tramoId);");
                    sb.AppendLine("      if (!txt || !lista) return;");
                    sb.AppendLine("      var texto = txt.value.trim();");
                    sb.AppendLine("      if (!texto) return;");
                    sb.AppendLine("      var nombre = nom && nom.value.trim() ? nom.value.trim() : 'Sin nombre';");
                    sb.AppendLine("      var cargoTxt = '';");
                    sb.AppendLine("      if (cargo && cargo.value) { cargoTxt = cargo.options[cargo.selectedIndex].text; }");
                    sb.AppendLine("      var fecha = new Date().toLocaleString();");
                    sb.AppendLine("      var div = document.createElement('div');");
                    sb.AppendLine("      div.className = 'comentario-item';");
                    sb.AppendLine("      var cuerpo = texto.replace(/</g, '&lt;').replace(/>/g, '&gt;');");
                    sb.AppendLine("      var etiqueta = nombre + (cargoTxt ? ' (' + cargoTxt + ')' : '');");
                    sb.AppendLine("      div.innerHTML = '<div class=\"comentario-header\"><span class=\"comentario-autor\">' + etiqueta + '</span>' +");
                    sb.AppendLine("                     '<span class=\"comentario-fecha\">' + fecha + '</span></div>' +");
                    sb.AppendLine("                     '<div class=\"comentario-texto\">' + cuerpo + '</div>'; ");
                    sb.AppendLine("      lista.appendChild(div);");
                    sb.AppendLine("      txt.value = '';");  // limpiar caja
                    sb.AppendLine("    }");
                    sb.AppendLine("  </script>");

                    sb.AppendLine("</body>");
                    sb.AppendLine("</html>");

                    string htmlNuevo = sb.ToString();
                    htmlNuevo = htmlNuevo.Replace("<!--TRAMOS-INDEX-->", indexHtml + Environment.NewLine + "        <!--TRAMOS-INDEX-->");
                    htmlNuevo = htmlNuevo.Replace("<!--TRAMOS-SECTIONS-->", sectionHtml + Environment.NewLine + "    <!--TRAMOS-SECTIONS-->");

                    File.WriteAllText(filePath, htmlNuevo, Encoding.UTF8);
                }
                else
                {
                    string html = File.ReadAllText(filePath, Encoding.UTF8);

                    // Asegurar que existan los marcadores; si no, hacemos append simple al final.
                    if (html.Contains("<!--TRAMOS-INDEX-->") && html.Contains("<!--TRAMOS-SECTIONS-->"))
                    {
                        html = html.Replace("<!--TRAMOS-INDEX-->", indexHtml + Environment.NewLine + "        <!--TRAMOS-INDEX-->");
                        html = html.Replace("<!--TRAMOS-SECTIONS-->", sectionHtml + Environment.NewLine + "    <!--TRAMOS-SECTIONS-->");
                    }
                    else
                    {
                        const string bodyClose = "</body>";
                        int idx = html.LastIndexOf(bodyClose, StringComparison.OrdinalIgnoreCase);
                        if (idx < 0)
                        {
                            html += Environment.NewLine + sectionHtml + Environment.NewLine;
                        }
                        else
                        {
                            var sb = new StringBuilder(html.Length + sectionHtml.Length + 64);
                            sb.Append(html, 0, idx);
                            sb.AppendLine(sectionHtml);
                            sb.AppendLine();
                            sb.Append(html, idx, html.Length - idx);
                            html = sb.ToString();
                        }
                    }

                    File.WriteAllText(filePath, html, Encoding.UTF8);
                }
            }
        }

        // ====================== CSS =========================

        private static string BuildCss()
        {
            var sb = new StringBuilder();
            sb.AppendLine("<style>");
            sb.AppendLine("  body {");
            sb.AppendLine("    font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif;");
            sb.AppendLine("    font-size: 14px;");
            sb.AppendLine("    color: #222;");
            sb.AppendLine("    background-color: #f5f5f5;");
            sb.AppendLine("    margin: 0;");
            sb.AppendLine("    padding: 0;");
            sb.AppendLine("  }");

            // ===== HEADER CONTRATO + LOGO =====
            sb.AppendLine("  .hdr {");
            sb.AppendLine("    display: flex;");
            sb.AppendLine("    justify-content: space-between;");
            sb.AppendLine("    align-items: center;");
            sb.AppendLine("    background: linear-gradient(90deg, #008a9a, #00bcd4);");
            sb.AppendLine("    color: #fff;");
            sb.AppendLine("    padding: 10px 32px;");
            sb.AppendLine("    box-shadow: 0 2px 4px rgba(0,0,0,0.25);");
            sb.AppendLine("  }");
            sb.AppendLine("  .hdr-logo img {");
            sb.AppendLine("    height: 64px;");
            sb.AppendLine("  }");
            sb.AppendLine("  .hdr-text {");
            sb.AppendLine("    text-align: right;");
            sb.AppendLine("  }");
            sb.AppendLine("  .hdr-title {");
            sb.AppendLine("    font-size: 24px;");
            sb.AppendLine("    font-weight: 700;");
            sb.AppendLine("    letter-spacing: 1px;");
            sb.AppendLine("  }");
            sb.AppendLine("  .hdr-subtitle {");
            sb.AppendLine("    font-size: 15px;");
            sb.AppendLine("    margin-top: 2px;");
            sb.AppendLine("  }");
            sb.AppendLine("  .hdr-meta {");
            sb.AppendLine("    margin-top: 2px;");
            sb.AppendLine("    font-size: 12px;");
            sb.AppendLine("    opacity: 0.9;");
            sb.AppendLine("  }");
            sb.AppendLine("  .hdr-meta-small {");
            sb.AppendLine("    margin-top: 4px;");
            sb.AppendLine("    font-size: 11px;");
            sb.AppendLine("    opacity: 0.85;");
            sb.AppendLine("  }");

            sb.AppendLine("  .main {");
            sb.AppendLine("    padding: 16px 32px 32px 32px;");
            sb.AppendLine("  }");
            sb.AppendLine("  .tramo-section {");
            sb.AppendLine("    background-color: #ffffff;");
            sb.AppendLine("    border-radius: 8px;");
            sb.AppendLine("    box-shadow: 0 1px 3px rgba(0,0,0,0.15);");
            sb.AppendLine("    margin-bottom: 24px;");
            sb.AppendLine("    padding: 12px 20px 18px 20px;");
            sb.AppendLine("  }");

            // ===== ÍNDICE DE TRAMOS =====
            sb.AppendLine("  .tramo-index {");
            sb.AppendLine("    background-color: #e0f7fa;");
            sb.AppendLine("    border: 1px solid #00acc1;");
            sb.AppendLine("    border-radius: 6px;");
            sb.AppendLine("    padding: 10px 14px;");
            sb.AppendLine("    margin-bottom: 20px;");
            sb.AppendLine("  }");
            sb.AppendLine("  .tramo-index-title {");
            sb.AppendLine("    font-weight: 600;");
            sb.AppendLine("    color: #006064;");
            sb.AppendLine("    margin-bottom: 6px;");
            sb.AppendLine("  }");
            sb.AppendLine("  .tramo-index ul {");
            sb.AppendLine("    list-style: none;");
            sb.AppendLine("    padding-left: 0;");
            sb.AppendLine("    margin: 0;");
            sb.AppendLine("    display: flex;");
            sb.AppendLine("    flex-wrap: wrap;");
            sb.AppendLine("    gap: 8px;");
            sb.AppendLine("  }");
            sb.AppendLine("  .tramo-index li a {");
            sb.AppendLine("    text-decoration: none;");
            sb.AppendLine("    padding: 4px 8px;");
            sb.AppendLine("    border-radius: 4px;");
            sb.AppendLine("    background-color: #00bcd4;");
            sb.AppendLine("    color: #fff;");
            sb.AppendLine("    font-size: 12px;");
            sb.AppendLine("  }");
            sb.AppendLine("  .tramo-index li a:hover {");
            sb.AppendLine("    background-color: #008a9a;");
            sb.AppendLine("  }");

            // ===== NODOS =====
            sb.AppendLine("  .top-nodes {");
            sb.AppendLine("    display: flex;");
            sb.AppendLine("    gap: 24px;");
            sb.AppendLine("    margin: 12px 8px 16px 8px;");
            sb.AppendLine("  }");
            sb.AppendLine("  .node-card {");
            sb.AppendLine("    flex: 1;");
            sb.AppendLine("    background-color: #f9fcff;");
            sb.AppendLine("    border-radius: 6px;");
            sb.AppendLine("    border: 1px solid #dde6f0;");
            sb.AppendLine("    box-shadow: 0 1px 2px rgba(0,0,0,0.06);");
            sb.AppendLine("    overflow: hidden;");
            sb.AppendLine("  }");
            sb.AppendLine("  .node-card-header {");
            sb.AppendLine("    display: flex;");
            sb.AppendLine("    justify-content: space-between;");
            sb.AppendLine("    padding: 6px 10px;");
            sb.AppendLine("    background-color: #eef4fb;");
            sb.AppendLine("    font-weight: 600;");
            sb.AppendLine("  }");
            sb.AppendLine("  .node-name {");
            sb.AppendLine("    font-size: 13px;");
            sb.AppendLine("  }");
            sb.AppendLine("  .node-abs {");
            sb.AppendLine("    font-size: 13px;");
            sb.AppendLine("    opacity: 0.9;");
            sb.AppendLine("  }");
            sb.AppendLine("  .node-table {");
            sb.AppendLine("    width: 100%;");
            sb.AppendLine("    border-collapse: collapse;");
            sb.AppendLine("    font-size: 13px;");
            sb.AppendLine("  }");
            sb.AppendLine("  .node-table th, .node-table td {");
            sb.AppendLine("    padding: 4px 10px;");
            sb.AppendLine("    border-top: 1px solid #e0e6f0;");
            sb.AppendLine("  }");
            sb.AppendLine("  .node-table th {");
            sb.AppendLine("    width: 40%;");
            sb.AppendLine("    font-weight: 500;");
            sb.AppendLine("    color: #555;");
            sb.AppendLine("  }");

            // ===== INFORMACIÓN DE TRAMO (columna izquierda) =====
            sb.AppendLine("  .info-tramo-header {");
            sb.AppendLine("    padding: 4px 10px;");
            sb.AppendLine("    background-color: #e5f0fb;");
            sb.AppendLine("    font-size: 13px;");
            sb.AppendLine("    font-weight: 600;");
            sb.AppendLine("    text-align: center;");
            sb.AppendLine("    border-radius: 4px 4px 0 0;");
            sb.AppendLine("  }");

            sb.AppendLine("  .info-tramo-block {");
            sb.AppendLine("    flex: 0 0 32%;");
            sb.AppendLine("    min-width: 280px;");
            sb.AppendLine("  }");

            sb.AppendLine("  .info-tramo-grid {");
            sb.AppendLine("    margin: 0;");
            sb.AppendLine("  }");

            sb.AppendLine("  .info-table {");
            sb.AppendLine("    width: 100%;");
            sb.AppendLine("    border-collapse: collapse;");
            sb.AppendLine("    font-size: 13px;");
            sb.AppendLine("  }");
            sb.AppendLine("  .info-table th, .info-table td {");
            sb.AppendLine("    padding: 4px 10px;");
            sb.AppendLine("    border-top: 1px solid #e0e6f0;");
            sb.AppendLine("  }");
            sb.AppendLine("  .info-table th {");
            sb.AppendLine("    font-weight: 500;");
            sb.AppendLine("    color: #555;");
            sb.AppendLine("  }");

            // ===== FILA: Información + Cantidades =====
            sb.AppendLine("  .info-cant-row {");
            sb.AppendLine("    display: flex;");
            sb.AppendLine("    flex-wrap: nowrap;");
            sb.AppendLine("    gap: 16px;");
            sb.AppendLine("    margin: 4px 8px 10px 8px;");
            sb.AppendLine("    align-items: flex-start;");
            sb.AppendLine("  }");

            // ===== CANTIDADES TRAMO (columna derecha) =====
            sb.AppendLine("  .cantidades-card {");
            sb.AppendLine("    flex: 1;");
            sb.AppendLine("    background-color: #e5f4fb;");
            sb.AppendLine("    border-radius: 6px;");
            sb.AppendLine("    border: 1px solid #b4cce5;");
            sb.AppendLine("    box-shadow: 0 1px 2px rgba(0,0,0,0.06);");
            sb.AppendLine("  }");
            sb.AppendLine("  .cantidades-header {");
            sb.AppendLine("    padding: 6px 10px;");
            sb.AppendLine("    background-color: #d7e7fb;");
            sb.AppendLine("    font-weight: 600;");
            sb.AppendLine("    font-size: 13px;");
            sb.AppendLine("  }");
            sb.AppendLine("  .cantidades-table {");
            sb.AppendLine("    width: 100%;");
            sb.AppendLine("    border-collapse: collapse;");
            sb.AppendLine("    font-size: 13px;");
            sb.AppendLine("  }");
            sb.AppendLine("  .cantidades-table th, .cantidades-table td {");
            sb.AppendLine("    padding: 4px 10px;");
            sb.AppendLine("    border-top: 1px solid #cfdced;");
            sb.AppendLine("    vertical-align: top;");
            sb.AppendLine("  }");
            sb.AppendLine("  .cantidades-table th {");
            sb.AppendLine("    font-weight: 600;");
            sb.AppendLine("    color: #35526f;");
            sb.AppendLine("    white-space: nowrap;");
            sb.AppendLine("  }");
            sb.AppendLine("  .cantidades-table td.num {");
            sb.AppendLine("    text-align: right;");
            sb.AppendLine("    white-space: nowrap;");
            sb.AppendLine("  }");
            sb.AppendLine("  .cantidades-table td.obs {");
            sb.AppendLine("    width: 45%;");
            sb.AppendLine("  }");

            // ===== GRÁFICO DEL TRAMO =====
            sb.AppendLine("  .grafico-tramo {");
            sb.AppendLine("    margin-top: 12px;");
            sb.AppendLine("    text-align: center;");
            sb.AppendLine("    max-height: 260px;");
            sb.AppendLine("    overflow: hidden;");
            sb.AppendLine("  }");
            sb.AppendLine("  .grafico-tramo img {");
            sb.AppendLine("    max-width: 100%;");
            sb.AppendLine("    max-height: 240px;");
            sb.AppendLine("    height: auto;");
            sb.AppendLine("    border-radius: 4px;");
            sb.AppendLine("    box-shadow: 0 1px 3px rgba(0,0,0,0.25);");
            sb.AppendLine("    object-fit: contain;");
            sb.AppendLine("  }");
            sb.AppendLine("  .grafico-hint {");
            sb.AppendLine("    margin-top: 4px;");
            sb.AppendLine("    font-size: 11px;");
            sb.AppendLine("    color: #666;");
            sb.AppendLine("  }");

            // ===== PANEL DE COMENTARIOS =====
            sb.AppendLine("  .comentarios-panel {");
            sb.AppendLine("    margin-top: 10px;");
            sb.AppendLine("    margin-right: 0;");
            sb.AppendLine("    border-radius: 6px;");
            sb.AppendLine("    background-color: #e0f7fa;");
            sb.AppendLine("    border: 1px solid #00acc1;");
            sb.AppendLine("    padding: 10px;");
            sb.AppendLine("  }");
            sb.AppendLine("  .comentarios-title {");
            sb.AppendLine("    font-weight: 600;");
            sb.AppendLine("    margin-bottom: 6px;");
            sb.AppendLine("  }");
            sb.AppendLine("  .comentarios-list {");
            sb.AppendLine("    max-height: 220px;");
            sb.AppendLine("    overflow-y: auto;");
            sb.AppendLine("    margin-bottom: 8px;");
            sb.AppendLine("    border: 1px solid #e0e0e0;");
            sb.AppendLine("    padding: 6px;");
            sb.AppendLine("    background-color: #ffffff;");
            sb.AppendLine("  }");
            sb.AppendLine("  .comentario-item {");
            sb.AppendLine("    border-bottom: 1px solid #eee;");
            sb.AppendLine("    padding: 4px 0;");
            sb.AppendLine("    font-size: 12px;");
            sb.AppendLine("  }");
            sb.AppendLine("  .comentario-header {");
            sb.AppendLine("    display: flex;");
            sb.AppendLine("    justify-content: space-between;");
            sb.AppendLine("    font-weight: 500;");
            sb.AppendLine("  }");
            sb.AppendLine("  .comentario-texto {");
            sb.AppendLine("    margin-top: 2px;");
            sb.AppendLine("  }");
            sb.AppendLine("  .comentarios-form textarea {");
            sb.AppendLine("    width: 100%;");
            sb.AppendLine("    min-height: 50px;");
            sb.AppendLine("    resize: vertical;");
            sb.AppendLine("    font-size: 12px;");
            sb.AppendLine("  }");
            sb.AppendLine("  .comentarios-form-footer {");
            sb.AppendLine("   	display: flex;");
            sb.AppendLine("    gap: 6px;");
            sb.AppendLine("    margin-top: 4px;");
            sb.AppendLine("  }");
            sb.AppendLine("  .comentarios-form-footer input[type=\"text\"],");
            sb.AppendLine("  .comentarios-form-footer select {");
            sb.AppendLine("    font-size: 12px;");
            sb.AppendLine("    padding: 2px 4px;");
            sb.AppendLine("  }");
            sb.AppendLine("  .comentarios-form-footer button {");
            sb.AppendLine("    padding: 4px 10px;");
            sb.AppendLine("    font-size: 12px;");
            sb.AppendLine("    background-color: #00bcd4;");
            sb.AppendLine("    border: none;");
            sb.AppendLine("    color: #fff;");
            sb.AppendLine("    border-radius: 4px;");
            sb.AppendLine("    cursor: pointer;");
            sb.AppendLine("  }");
            sb.AppendLine("  .comentarios-form-footer button:hover {");
            sb.AppendLine("    background-color: #008a9a;");
            sb.AppendLine("  }");

            sb.AppendLine("</style>");
            return sb.ToString();
        }



        // ================== SECCIÓN POR TRAMO =========================

        private static string BuildTramoSectionHtml(
            string tramoNombre,
            string tramoId,
            IReadOnlyList<FrmNombrarTramo.TramoJson> tramos,
            string? graficoPath)
        {
            var t = tramos[0];

            var sb = new StringBuilder();

            sb.AppendLine($"<section class=\"tramo-section\" id=\"{tramoId}\">");

            // Imagen del tramo (NUEVA LÓGICA: Base64 embedado en lugar de URL externa)
            string imagenSrc = string.Empty;
            bool tieneImagen = false;

            // PRIORIDAD 1: Usar screenshot capturado automáticamente (Base64)
            if (!string.IsNullOrWhiteSpace(t.ImagenBase64))
            {
                imagenSrc = $"data:image/jpeg;base64,{t.ImagenBase64}";
                tieneImagen = true;
            }
            // PRIORIDAD 2: Fallback a imagen cargada manualmente (si existe)
            else if (!string.IsNullOrWhiteSpace(graficoPath) && File.Exists(graficoPath))
            {
                imagenSrc = new Uri(graficoPath).AbsoluteUri;
                tieneImagen = true;
            }

            // ===== CABECERA DEL TRAMO =====
            sb.AppendLine("  <div class=\"tramo-header\">");

            string nomTramo = WebUtility.HtmlEncode(tramoNombre ?? string.Empty);

            string capComp = string.Empty;
            if (!string.IsNullOrWhiteSpace(_capituloActual) || !string.IsNullOrWhiteSpace(_competenciaActual))
            {
                string capHtml = WebUtility.HtmlEncode(_capituloActual ?? string.Empty);
                string compHtml = WebUtility.HtmlEncode(_competenciaActual ?? string.Empty);
                capComp = $" ({capHtml} - {compHtml})";
            }

            sb.AppendLine($"    <div class=\"tramo-title\">TRAMO {nomTramo}{capComp}</div>");
            sb.AppendLine("  </div>");

            if (tieneImagen)
            {
                sb.AppendLine("  <div class=\"grafico-tramo\">");
                sb.AppendLine($"      <img src=\"{imagenSrc}\" alt=\"Vista del tramo capturada automáticamente\" style=\"max-width: 100%; height: auto;\" />");
                sb.AppendLine("    <div class=\"grafico-hint\">Vista capturada automáticamente al asignar el nombre del tramo.</div>");
                sb.AppendLine("  </div>");
            }

            // ===== TARJETAS NODO INICIAL / FINAL =====
            sb.AppendLine("  <div class=\"top-nodes\">");

            // Nodo inicial
            sb.AppendLine("    <div class=\"node-card\">");
            sb.AppendLine("      <div class=\"node-card-header\">");
            sb.Append("        <div class=\"node-name\">");
            sb.Append(WebUtility.HtmlEncode(t.NodoIni ?? string.Empty));
            sb.AppendLine("</div>");
            sb.Append("        <div class=\"node-abs\">");
            sb.Append(WebUtility.HtmlEncode(t.AbsIni ?? string.Empty));
            sb.AppendLine("</div>");
            sb.AppendLine("      </div>");
            sb.AppendLine("      <table class=\"node-table\">");
            sb.AppendLine("        <tr><th>NORTE</th><td class=\"num\">" + Fmt(t.NorteIni) + "</td></tr>");
            sb.AppendLine("        <tr><th>ESTE</th><td class=\"num\">" + Fmt(t.EsteIni) + "</td></tr>");
            sb.AppendLine("        <tr><th>RASANTE</th><td class=\"num\">" + Fmt(t.RasanteIni) + "</td></tr>");
            sb.AppendLine("        <tr><th>CLAVE</th><td class=\"num\">" + Fmt(t.ClaveIni) + "</td></tr>");
            sb.AppendLine("      </table>");
            sb.AppendLine("    </div>");

            // Nodo final
            sb.AppendLine("    <div class=\"node-card\">");
            sb.AppendLine("      <div class=\"node-card-header\">");
            sb.Append("        <div class=\"node-name\">");
            sb.Append(WebUtility.HtmlEncode(t.NodoFin ?? string.Empty));
            sb.AppendLine("</div>");
            sb.Append("        <div class=\"node-abs\">");
            sb.Append(WebUtility.HtmlEncode(t.AbsFin ?? string.Empty));
            sb.AppendLine("</div>");
            sb.AppendLine("      </div>");
            sb.AppendLine("      <table class=\"node-table\">");
            sb.AppendLine("        <tr><th>NORTE</th><td class=\"num\">" + Fmt(t.NorteFin) + "</td></tr>");
            sb.AppendLine("        <tr><th>ESTE</th><td class=\"num\">" + Fmt(t.EsteFin) + "</td></tr>");
            sb.AppendLine("        <tr><th>RASANTE</th><td class=\"num\">" + Fmt(t.RasanteFin) + "</td></tr>");
            sb.AppendLine("        <tr><th>CLAVE</th><td class=\"num\">" + Fmt(t.ClaveFin) + "</td></tr>");
            sb.AppendLine("      </table>");
            sb.AppendLine("    </div>");

            sb.AppendLine("  </div>"); // top-nodes

            // ===== INFORMACIÓN DE TRAMO + CANTIDADES =====

            double pendientePorc = 0.0;
            bool esContrapendiente = false;

            if (t.Longitud > 1e-6)
            {
                double deltaClave = t.ClaveIni - t.ClaveFin; // Inicio - Fin
                pendientePorc = Math.Abs(deltaClave / t.Longitud * 100.0);
                esContrapendiente = (deltaClave > 0.0);
            }

            string pendienteTexto = pendientePorc.ToString("0.000", CultureInfo.InvariantCulture) +
                                    " %" + (esContrapendiente ? " (Contrapendiente)" : string.Empty);

            // Contenedor común: info de tramo (izquierda) + cantidades (derecha)
            sb.AppendLine("  <div class=\"info-cant-row\">");

            // ---- Columna izquierda: INFORMACIÓN DE TRAMO ----
            sb.AppendLine("    <div class=\"info-tramo-block\">");
            sb.AppendLine("      <div class=\"info-tramo-header\">INFORMACIÓN DE TRAMO</div>");
            sb.AppendLine("      <div class=\"info-tramo-grid\">");
            sb.AppendLine("        <table class=\"info-table\">");
            sb.AppendLine("          <tr><th>Área externa tubería (m²)</th><td class=\"num\">" + Fmt(t.AreaExtTubos) + "</td></tr>");
            sb.AppendLine("          <tr><th>Pendiente m(%)</th><td class=\"num\">" + WebUtility.HtmlEncode(pendienteTexto) + "</td></tr>");
            sb.AppendLine("          <tr><th>Altura de excavación (m)</th><td class=\"num\">" + Fmt(t.AlturaExcavacion) + "</td></tr>");
            sb.AppendLine("          <tr><th>Diámetro Ø</th><td class=\"num\">" + WebUtility.HtmlEncode(t.DiametroTexto ?? string.Empty) + "</td></tr>");
            sb.AppendLine("          <tr><th>Espesor tub. (m)</th><td class=\"num\">" + Fmt(t.EspesorTuberiaMm) + "</td></tr>");
            sb.AppendLine("          <tr><th>Ancho exc. (m)</th><td class=\"num\">" + Fmt(t.AnchoExcavacion) + "</td></tr>");
            sb.AppendLine("          <tr><th>Altura atraque</th><td class=\"num\">" + (t.AlturaAtraqueTexto ?? "") + "</td></tr>");
            sb.AppendLine("        </table>");
            sb.AppendLine("      </div>"); // info-tramo-grid
            sb.AppendLine("    </div>");     // info-tramo-block

            // ---- Columna derecha: CANTIDADES DEL TRAMO ----
            sb.AppendLine("    <div class=\"cantidades-card\">");
            sb.AppendLine("      <div class=\"cantidades-header\">Cantidades del tramo</div>");
            sb.AppendLine("      <table class=\"cantidades-table\">");
            sb.AppendLine("        <tr>");
            sb.AppendLine("          <th>Ítem de presupuesto</th>");
            sb.AppendLine("          <th>Cantidad</th>");
            sb.AppendLine("          <th>Observación</th>");
            sb.AppendLine("        </tr>");

            var filas = new List<(string item, string cant, string obs)>();

            string L = Fmt(t.Longitud);
            string ancho = Fmt(t.AnchoExcavacion);
            string hExc = Fmt(t.AlturaExcavacion);
            string hAtr = t.AlturaAtraqueTexto ?? "";

            // Altura “equivalente” de relleno, calculada a partir del volumen:
            // hRell = VolumenRelleno / (L * ancho)
            double hRellNum = 0.0;
            if (t.Longitud > 1e-6 && t.AnchoExcavacion > 1e-6 && t.VolumenRelleno > 1e-6)
            {
                hRellNum = t.VolumenRelleno / (t.Longitud * t.AnchoExcavacion);
            }
            string hRell = Fmt(hRellNum);

            string areaExt = Fmt(t.AreaExtTubos);


            if (t.UsaExcav && !string.IsNullOrWhiteSpace(t.ItemExcav) && t.VolumenExcavacion > 0)
            {
                filas.Add((
                    t.ItemExcav,
                    Fmt(t.VolumenExcavacion) + " m³",
                    $"V_excav = {L} m × {ancho} × {hExc}"
                ));
            }

            if (t.UsaAtraque && !string.IsNullOrWhiteSpace(t.ItemAtraque) && t.VolumenAtraque > 0)
            {
                filas.Add((
                    t.ItemAtraque,
                    Fmt(t.VolumenAtraque) + " m³",
                    $"V_atraque = {L} m × {ancho} × {hAtr} − ({areaExt} × {L})"
                ));
            }

            if (t.UsaLong && !string.IsNullOrWhiteSpace(t.ItemLong) && t.Longitud > 0)
            {
                filas.Add((
                    t.ItemLong,
                    L + " m",
                    $"L_tubería = {L} m (longitud medida sobre el eje en AutoCAD)"
                ));
            }

            if (t.UsaRelleno && !string.IsNullOrWhiteSpace(t.ItemRelleno) && t.VolumenRelleno > 0)
            {
                filas.Add((
                    t.ItemRelleno,
                    Fmt(t.VolumenRelleno) + " m³",
                    $"V_relleno = {L} m × {ancho} × {hRell}"
                ));
            }

            if (t.UsaEntibado && !string.IsNullOrWhiteSpace(t.ItemEntibado) && t.AreaEntibado > 0)
            {
                filas.Add((
                    t.ItemEntibado,
                    Fmt(t.AreaEntibado) + " m²",
                    $"A_entibado = 2 × {hExc} × {L} m (dos caras)"
                ));
            }

            if (t.UsaCinta && !string.IsNullOrWhiteSpace(t.ItemCinta) && t.Longitud > 0)
            {
                filas.Add((
                    t.ItemCinta,
                    L + " m",
                    $"L_cinta = {L} m (longitud sobre el eje del tramo)"
                ));
            }

            if (t.UsaOtros && !string.IsNullOrWhiteSpace(t.ItemOtros) && t.CantOtros > 0)
            {
                filas.Add((
                    t.ItemOtros,
                    Fmt(t.CantOtros),
                    "Sumatoria de ítems 'Otros' armonizados con la longitud del tramo (factor × longitud)."
                ));
            }

            if (t.UsaCampana1 && !string.IsNullOrWhiteSpace(t.ItemCampana1) && t.CantCampana1 > 0)
            {
                filas.Add((
                    t.ItemCampana1,
                    t.CantCampana1.ToString() + " UND",
                    "Campanas 1: cantidad entera digitada manualmente por el usuario."
                ));
            }

            if (t.UsaCampana2 && !string.IsNullOrWhiteSpace(t.ItemCampana2) && t.CantCampana2 > 0)
            {
                filas.Add((
                    t.ItemCampana2,
                    t.CantCampana2.ToString() + " UND",
                    "Campanas 2: cantidad entera digitada manualmente por el usuario."
                ));
            }

            if (filas.Count == 0)
            {
                sb.AppendLine("        <tr>");
                sb.AppendLine("          <td colspan=\"3\">No hay ítems de presupuesto seleccionados para este tramo.</td>");
                sb.AppendLine("        </tr>");
            }
            else
            {
                foreach (var f in filas)
                {
                    string itemHtml = WebUtility.HtmlEncode(f.item ?? string.Empty);
                    string cantHtml = WebUtility.HtmlEncode(f.cant ?? string.Empty);
                    string obsHtml = WebUtility.HtmlEncode(f.obs ?? string.Empty);

                    sb.AppendLine("        <tr>");
                    sb.AppendLine($"          <td>{itemHtml}</td>");
                    sb.AppendLine($"          <td class=\"num\">{cantHtml}</td>");
                    sb.AppendLine($"          <td class=\"obs\">{obsHtml}</td>");
                    sb.AppendLine("        </tr>");
                }
            }

            sb.AppendLine("      </table>");
            sb.AppendLine("    </div>"); // cantidades-card

            sb.AppendLine("  </div>"); // info-cant-row


            // ===== PANEL DE COMENTARIOS =====
            sb.AppendLine("  <div class=\"comentarios-panel\">");
            sb.AppendLine("    <div class=\"comentarios-title\">Historial de comentarios</div>");
            sb.AppendLine($"    <div class=\"comentarios-list\" id=\"comments-{tramoId}\">");
            sb.AppendLine("      <!-- Comentarios se agregan en tiempo de ejecución en el navegador -->");
            sb.AppendLine("    </div>");
            sb.AppendLine("    <div class=\"comentarios-form\">");
            sb.AppendLine($"      <textarea id=\"txtComentario-{tramoId}\" placeholder=\"Escriba un comentario y pulse Enviar...\"></textarea>");
            sb.AppendLine("      <div class=\"comentarios-form-footer\">");
            sb.AppendLine($"        <input type=\"text\" id=\"txtNombre-{tramoId}\" placeholder=\"Nombre\" />");
            sb.AppendLine($"        <select id=\"cmbCargo-{tramoId}\">");
            sb.AppendLine("          <option value=\"\">Cargo...</option>");
            sb.AppendLine("          <option>Topógrafo Contratista</option>");
            sb.AppendLine("          <option>Topógrafo Interventoría</option>");
            sb.AppendLine("          <option>Inspector de Obra</option>");
            sb.AppendLine("          <option>Inspector de Interventoría</option>");
            sb.AppendLine("          <option>Residente de Obra</option>");
            sb.AppendLine("          <option>Residente de Interventoria</option>");
            sb.AppendLine("          <option>Representante ESP</option>");
            sb.AppendLine("          <option>Director de Obra</option>");
            sb.AppendLine("          <option>Director de Interventoria</option>");
            sb.AppendLine("          <option>Residente de Costos</option>");
            sb.AppendLine("          <option>Otro</option>");
            sb.AppendLine("        </select>");
            sb.AppendLine($"        <button type=\"button\" onclick=\"agregarComentario('{tramoId}')\">Enviar</button>");
            sb.AppendLine($"        <button type=\"button\" class=\"btn-eliminar\" onclick=\"eliminarTramo('{tramoId}')\">Eliminar tramo</button>");
            sb.AppendLine("      </div>");
            sb.AppendLine("    </div>");
            sb.AppendLine("  </div>");

            sb.AppendLine("</section>");

            return sb.ToString();
        }


        private static string BuildTramoIndexEntryHtml(string tramoNombre, string tramoId)
        {
            string texto = WebUtility.HtmlEncode(tramoNombre ?? string.Empty);
            if (!string.IsNullOrWhiteSpace(_capituloActual) || !string.IsNullOrWhiteSpace(_competenciaActual))
            {
                string capHtml = WebUtility.HtmlEncode(_capituloActual ?? string.Empty);
                string compHtml = WebUtility.HtmlEncode(_competenciaActual ?? string.Empty);
                texto = $"{texto} ({capHtml} - {compHtml})";
            }

            return $"        <li><a href=\"#{tramoId}\">{texto}</a></li>";
        }
        private static string MakeSlug(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw))
                return "tramo";

            var sb = new StringBuilder();
            foreach (char c in raw)
            {
                if (char.IsLetterOrDigit(c))
                    sb.Append(char.ToLowerInvariant(c));
                else if (c == '+' || c == '_')
                    sb.Append('_');
                else
                    sb.Append('-');
            }
            return sb.ToString().Trim('-');
        }

        internal static class FrmNombrarTramoExtensions
        {
            public static bool TryGetImagenesBase64(
                FrmNombrarTramo.TramoJson json,
                out List<string> imagenes)
            {
                imagenes = null;

                var prop = typeof(FrmNombrarTramo.TramoRow).GetProperty("ImagenesBase64");
                if (prop == null)
                    return false;

                return false; // JSON no trae imágenes por ahora (solo el formulario)
            }
        }


        private static string Fmt(double value)
        {
            return value.ToString("0.000", CultureInfo.InvariantCulture);
        }
    }
}

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Text;

namespace SicoePresupuestoNET8
{
    internal static class NodoReportService
    {
        private static readonly object _sync = new object();

        /// <summary>
        /// Agrega una sección de informe HTML para un nodo.
        /// Si el archivo no existe, lo crea con cabecera, estilos y estructura base.
        /// Si existe, inserta la sección antes de </body>.
        /// </summary>
        public static void AppendNodoHtml(
            string filePath,
            FrmNombrarNodos.NodoJson nodo,
            string? graficoPath)
        {
            if (nodo == null)
                return;

            lock (_sync)
            {
                string? dir = Path.GetDirectoryName(filePath);
                if (!string.IsNullOrEmpty(dir))
                    Directory.CreateDirectory(dir);

                const string logoPathFs =
                    @"C:\Users\JORAND\OneDrive\Aplicaciones y Macros\Programación_Visual Studio\SicoePresupuestoNET8\SicoePresupuestoNET8\SicoeCAD.png";

                string logoUrl = File.Exists(logoPathFs)
                    ? new Uri(logoPathFs).AbsoluteUri
                    : string.Empty;

                string nodoId = MakeSlug(nodo.Nombre ?? "nodo");

                string sectionHtml = BuildNodoSectionHtml(nodoId, nodo, graficoPath);
                if (!File.Exists(filePath))
                {
                    var sb = new StringBuilder();

                    sb.AppendLine("<!DOCTYPE html>");
                    sb.AppendLine("<html lang=\"es\">");
                    sb.AppendLine("<head>");
                    sb.AppendLine("  <meta charset=\"utf-8\" />");
                    sb.AppendLine("  <title>SICOE - Informe de Nodos</title>");
                    sb.AppendLine(BuildCss());
                    sb.AppendLine("</head>");
                    sb.AppendLine("<body>");

                    sb.AppendLine("  <header class=\"hdr\">");
                    if (!string.IsNullOrEmpty(logoUrl))
                    {
                        sb.AppendLine("    <div class=\"hdr-logo\">");
                        sb.AppendLine($"      <img src=\"{logoUrl}\" alt=\"SicoeCAD\" />");
                        sb.AppendLine("    </div>");
                    }
                    sb.AppendLine("    <div class=\"hdr-text\">");
                    sb.AppendLine("      <div class=\"hdr-title\">CONTRATO IDU-1551-2017</div>");
                    sb.AppendLine("      <div class=\"hdr-subtitle\">Unión Temporal MURCON</div>");
                    sb.AppendLine("      <div class=\"hdr-meta\">Módulo: Informe de Nodos - SicoeCAD&#174;</div>");
                    sb.AppendLine($"      <div class=\"hdr-meta\">Generado: {DateTime.Now:yyyy-MM-dd HH:mm}</div>");
                    sb.AppendLine("      <div class=\"hdr-meta-small\">&copy; 2025 SicoeCAD. Todos los derechos reservados.</div>");
                    sb.AppendLine("    </div>");
                    sb.AppendLine("  </header>");

                    sb.AppendLine("  <main class=\"main\">");
                    sb.AppendLine(sectionHtml);
                    sb.AppendLine("  </main>");

                    // Script global: comentarios y eliminación de nodo
                    sb.AppendLine("  <script>");
                    sb.AppendLine("    const SICOE_NODO_PASSWORD = 'SicoeCAD';");
                    sb.AppendLine("    function eliminarNodo(nodoId) {");
                    sb.AppendLine("      var pass = prompt('Ingrese la contraseña para eliminar este nodo:');");
                    sb.AppendLine("      if (pass === null) return;");
                    sb.AppendLine("      if (pass !== SICOE_NODO_PASSWORD) { alert('Contraseña incorrecta.'); return; }");
                    sb.AppendLine("      var sec = document.getElementById(nodoId);");
                    sb.AppendLine("      if (sec && sec.parentNode) sec.parentNode.removeChild(sec);");
                    sb.AppendLine("    }");
                    sb.AppendLine();
                    sb.AppendLine("    function agregarComentarioNodo(nodoId) {");
                    sb.AppendLine("      var txt = document.getElementById('txtComentario-' + nodoId);");
                    sb.AppendLine("      var nom = document.getElementById('txtNombre-' + nodoId);");
                    sb.AppendLine("      var cargo = document.getElementById('cmbCargo-' + nodoId);");
                    sb.AppendLine("      var lista = document.getElementById('comments-' + nodoId);");
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
                    sb.AppendLine("      txt.value = '';");
                    sb.AppendLine("    }");
                    sb.AppendLine("  </script>");

                    sb.AppendLine("</body>");
                    sb.AppendLine("</html>");

                    File.WriteAllText(filePath, sb.ToString(), Encoding.UTF8);
                }
                else
                {
                    string html = File.ReadAllText(filePath, Encoding.UTF8);
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
                    File.WriteAllText(filePath, html, Encoding.UTF8);
                }
            }
        }


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

            // HEADER
            sb.AppendLine("  .hdr {");
            sb.AppendLine("    display: flex;");
            sb.AppendLine("    justify-content: space-between;");
            sb.AppendLine("    align-items: center;");
            sb.AppendLine("    background: linear-gradient(90deg, #008a9a, #00bcd4);");
            sb.AppendLine("    color: #fff;");
            sb.AppendLine("    padding: 10px 32px;");
            sb.AppendLine("    box-shadow: 0 2px 4px rgba(0,0,0,0.25);");
            sb.AppendLine("  }");
            sb.AppendLine("  .hdr-logo img { height: 64px; }");
            sb.AppendLine("  .hdr-text { text-align: right; }");
            sb.AppendLine("  .hdr-title { font-size: 24px; font-weight: 700; letter-spacing: 1px; }");
            sb.AppendLine("  .hdr-subtitle { font-size: 15px; margin-top: 2px; }");
            sb.AppendLine("  .hdr-meta { margin-top: 2px; font-size: 12px; opacity: 0.9; }");
            sb.AppendLine("  .hdr-meta-small { margin-top: 4px; font-size: 11px; opacity: 0.85; }");

            sb.AppendLine("  .main { padding: 16px 32px 32px 32px; }");
            sb.AppendLine("  .nodo-section {");
            sb.AppendLine("    background-color: #ffffff;");
            sb.AppendLine("    border-radius: 8px;");
            sb.AppendLine("    box-shadow: 0 1px 3px rgba(0,0,0,0.15);");
            sb.AppendLine("    margin-bottom: 24px;");
            sb.AppendLine("    padding: 12px 20px 18px 20px;");
            sb.AppendLine("  }");
            sb.AppendLine("  .nodo-header {");
            sb.AppendLine("    display: flex;");
            sb.AppendLine("    justify-content: space-between;");
            sb.AppendLine("    margin-bottom: 8px;");
            sb.AppendLine("  }");
            sb.AppendLine("  .nodo-title { font-size: 16px; font-weight: 700; color: #004d40; }");
            sb.AppendLine("  .nodo-abs { font-size: 13px; color: #00695c; }");

            sb.AppendLine("  .nodo-layout {");
            sb.AppendLine("    display: flex;");
            sb.AppendLine("    flex-wrap: wrap;");
            sb.AppendLine("    gap: 16px;");
            sb.AppendLine("    margin-top: 6px;");
            sb.AppendLine("  }");
            sb.AppendLine("  .card {");
            sb.AppendLine("    flex: 1;");
            sb.AppendLine("    min-width: 260px;");
            sb.AppendLine("    background-color: #f9fcff;");
            sb.AppendLine("    border-radius: 6px;");
            sb.AppendLine("    border: 1px solid #dde6f0;");
            sb.AppendLine("    box-shadow: 0 1px 2px rgba(0,0,0,0.06);");
            sb.AppendLine("    overflow: hidden;");
            sb.AppendLine("  }");
            sb.AppendLine("  .card-header {");
            sb.AppendLine("    padding: 6px 10px;");
            sb.AppendLine("    background-color: #e0f7fa;");
            sb.AppendLine("    font-weight: 600;");
            sb.AppendLine("    font-size: 13px;");
            sb.AppendLine("  }");
            sb.AppendLine("  .card-body { padding: 6px 10px 10px 10px; }");
            sb.AppendLine("  .info-table {");
            sb.AppendLine("    width: 100%;");
            sb.AppendLine("    border-collapse: collapse;");
            sb.AppendLine("    font-size: 13px;");
            sb.AppendLine("  }");
            sb.AppendLine("  .info-table th, .info-table td {");
            sb.AppendLine("    padding: 4px 6px;");
            sb.AppendLine("    border-top: 1px solid #e0e6f0;");
            sb.AppendLine("  }");
            sb.AppendLine("  .info-table th { width: 50%; font-weight: 500; color: #555; }");
            sb.AppendLine("  .info-table td.num { text-align: right; }");

            sb.AppendLine("  .cantidades-table {");
            sb.AppendLine("    width: 100%;");
            sb.AppendLine("    border-collapse: collapse;");
            sb.AppendLine("    font-size: 13px;");
            sb.AppendLine("  }");
            sb.AppendLine("  .cantidades-table th, .cantidades-table td {");
            sb.AppendLine("    padding: 4px 6px;");
            sb.AppendLine("    border-top: 1px solid #cfdced;");
            sb.AppendLine("  }");
            sb.AppendLine("  .cantidades-table th {");
            sb.AppendLine("    font-weight: 600;");
            sb.AppendLine("    color: #35526f;");
            sb.AppendLine("    white-space: nowrap;");
            sb.AppendLine("  }");
            sb.AppendLine("  .cantidades-table td.num { text-align: right; white-space: nowrap; }");

            sb.AppendLine("  .grafico-nodo { margin-top: 10px; text-align: center; }");
            sb.AppendLine("  .grafico-nodo img {");
            sb.AppendLine("    max-width: 100%;");
            sb.AppendLine("    max-height: 220px;");
            sb.AppendLine("    border-radius: 4px;");
            sb.AppendLine("    box-shadow: 0 1px 3px rgba(0,0,0,0.25);");
            sb.AppendLine("    object-fit: contain;");
            sb.AppendLine("  }");
            sb.AppendLine("  .grafico-hint { margin-top: 4px; font-size: 11px; color: #666; }");

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
            sb.AppendLine("    display: flex;");
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

        private static string BuildNodoSectionHtml(
            string nodoId,
            FrmNombrarNodos.NodoJson n,
            string? graficoPath)
        {
            var sb = new StringBuilder();
            sb.AppendLine($"<section class=\"nodo-section\" id=\"{nodoId}\">");

            sb.AppendLine("  <div class=\"nodo-header\">");
            sb.AppendLine($"    <div class=\"nodo-title\">NODO {Html(n.Nombre)}</div>");
            sb.AppendLine($"    <div class=\"nodo-abs\">Abscisa: {Html(n.Abs)}</div>");
            sb.AppendLine("  </div>");

            // Imagen del nodo (NUEVA LÓGICA: Base64 embedado)
            string imagenSrc = string.Empty;
            bool tieneImagen = false;

            // PRIORIDAD 1: Usar screenshot capturado (Base64)
            if (!string.IsNullOrWhiteSpace(n.ImagenBase64))
            {
                imagenSrc = $"data:image/jpeg;base64,{n.ImagenBase64}";
                tieneImagen = true;
            }
            // PRIORIDAD 2: Fallback a imagen manual (si existe)
            else if (!string.IsNullOrWhiteSpace(graficoPath) && File.Exists(graficoPath))
            {
                imagenSrc = new Uri(graficoPath).AbsoluteUri;
                tieneImagen = true;
            }

            sb.AppendLine("  <div class=\"nodo-layout\">");

            // Card 1: Datos geométricos
            sb.AppendLine("    <div class=\"card\">");
            sb.AppendLine("      <div class=\"card-header\">Datos geométricos del nodo</div>");
            sb.AppendLine("      <div class=\"card-body\">");
            sb.AppendLine("        <table class=\"info-table\">");

            // Coordenadas del punto medio del bloque
            sb.AppendLine("          <tr><th>Norte (m)</th><td class=\"num\">" + Fmt(n.Norte) + "</td></tr>");
            sb.AppendLine("          <tr><th>Este (m)</th><td class=\"num\">" + Fmt(n.Este) + "</td></tr>");

            // Restantes datos geométricos
            sb.AppendLine("          <tr><th>Rasante (m)</th><td class=\"num\">" + Fmt(n.Rasante) + "</td></tr>");
            sb.AppendLine("          <tr><th>Clave salida (m)</th><td class=\"num\">" + Fmt(n.ClaveSalida) + "</td></tr>");
            sb.AppendLine("          <tr><th>Diámetro salida (m)</th><td class=\"num\">" + Fmt(n.DiametroSalida) + "</td></tr>");
            sb.AppendLine("          <tr><th>Área NODO_EXT (m²)</th><td class=\"num\">" + Fmt(n.AreaNodoEXT) + "</td></tr>");
            sb.AppendLine("          <tr><th>Área NODO_MED (m²)</th><td class=\"num\">" + Fmt(n.AreaNodoMED) + "</td></tr>"); sb.AppendLine("        </table>");
            sb.AppendLine("      </div>");
            sb.AppendLine("    </div>");

            // Card 2: Información de excavación
            sb.AppendLine("    <div class=\"card\">");
            sb.AppendLine("      <div class=\"card-header\">Información de excavación</div>");
            sb.AppendLine("      <div class=\"card-body\">");
            sb.AppendLine("        <table class=\"info-table\">");
            sb.AppendLine("          <tr><th>Altura de excavación (m)</th><td class=\"num\">" + Fmt(n.AlturaExc) + "</td></tr>");
            sb.AppendLine("          <tr><th>Área de excavación (m²)</th><td class=\"num\">" + Fmt(n.AreaExc) + "</td></tr>");
            sb.AppendLine("          <tr><th>Área perimetral NODO_MED (m²)</th><td class=\"num\">" + Fmt(n.AreaNodoMED) + "</td></tr>"); sb.AppendLine("          <tr><th>Pasos (und)</th><td class=\"num\">" + (n.Pasos > 0 ? n.Pasos.ToString("0") : "-") + "</td></tr>");
            sb.AppendLine("        </table>");
            sb.AppendLine("      </div>");
            sb.AppendLine("    </div>");

            // Card 3: Vista capturada del nodo
            if (tieneImagen)
            {
                sb.AppendLine("    <div class=\"card\">");
                sb.AppendLine("      <div class=\"card-header\">Vista del nodo</div>");
                sb.AppendLine("      <div class=\"card-body\">");
                sb.AppendLine("        <div class=\"grafico-nodo\">");
                sb.AppendLine($"            <img src=\"{imagenSrc}\" alt=\"Vista del nodo\" style=\"max-width: 100%; height: auto;\" />");
                sb.AppendLine("          <div class=\"grafico-hint\">Vista capturada automáticamente al asignar el nombre del nodo.</div>");
                sb.AppendLine("        </div>");
                sb.AppendLine("      </div>");
                sb.AppendLine("    </div>");
            }

            sb.AppendLine("  </div>"); // nodo-layout

            // Tabla de cantidades
            sb.AppendLine("  <div class=\"card\" style=\"margin-top:10px;\">");
            sb.AppendLine("    <div class=\"card-header\">Cantidades del nodo</div>");
            sb.AppendLine("    <div class=\"card-body\">");
            sb.AppendLine("      <table class=\"cantidades-table\">");
            sb.AppendLine("        <tr><th>Ítem de presupuesto</th><th>Cantidad</th></tr>");

            var filas = new List<(string item, string cant)>();

            if (n.UsaExcav && n.CantExcav > 0 && !string.IsNullOrWhiteSpace(n.ItemExcav))
                filas.Add((n.ItemExcav!, Fmt(n.CantExcav) + " m³"));

            if (n.UsaRellenoPerim && n.CantRellenoPerim > 0 && !string.IsNullOrWhiteSpace(n.ItemRellenoPerim))
                filas.Add((n.ItemRellenoPerim!, Fmt(n.CantRellenoPerim) + " m³"));

            if (n.UsaEntibado && n.CantEntibado > 0 && !string.IsNullOrWhiteSpace(n.ItemEntibado))
                filas.Add((n.ItemEntibado!, Fmt(n.CantEntibado) + " m²"));

            if (n.UsaNodo && n.CantNodo > 0 && !string.IsNullOrWhiteSpace(n.ItemNodo))
                filas.Add((n.ItemNodo!, Fmt(n.CantNodo) + " und"));

            if (n.UsaMamposteria && n.CantMamposteria > 0 && !string.IsNullOrWhiteSpace(n.ItemMamposteria))
                filas.Add((n.ItemMamposteria!, Fmt(n.CantMamposteria) + " (altura muro)"));

            if (n.UsaPlacaFondo && n.CantPlacaFondo > 0 && !string.IsNullOrWhiteSpace(n.ItemPlacaFondo))
                filas.Add((n.ItemPlacaFondo!, Fmt(n.CantPlacaFondo) + " und"));

            if (n.UsaPasos && n.CantPasos > 0 && !string.IsNullOrWhiteSpace(n.ItemPasos))
                filas.Add((n.ItemPasos!, n.CantPasos.ToString("0") + " und"));

            if (n.UsaCanjuela && n.CantCanjuela > 0 && !string.IsNullOrWhiteSpace(n.ItemCanjuela))
                filas.Add((n.ItemCanjuela!, Fmt(n.CantCanjuela) + " und"));

            if (filas.Count == 0)
            {
                sb.AppendLine("        <tr><td colspan=\"2\">No hay ítems de presupuesto seleccionados para este nodo.</td></tr>");
            }
            else
            {
                foreach (var f in filas)
                {
                    sb.AppendLine("        <tr>");
                    sb.AppendLine($"          <td>{Html(f.item)}</td>");
                    sb.AppendLine($"          <td class=\"num\">{Html(f.cant)}</td>");
                    sb.AppendLine("        </tr>");
                }
            }

            sb.AppendLine("      </table>");
            sb.AppendLine("    </div>");
            sb.AppendLine("  </div>");

            // ===== PANEL DE COMENTARIOS =====
            sb.AppendLine("  <div class=\"comentarios-panel\">");
            sb.AppendLine("    <div class=\"comentarios-title\">Historial de comentarios</div>");
            sb.AppendLine($"    <div class=\"comentarios-list\" id=\"comments-{nodoId}\">");
            sb.AppendLine("      <!-- Comentarios se agregan en tiempo de ejecución en el navegador -->");
            sb.AppendLine("    </div>");
            sb.AppendLine("    <div class=\"comentarios-form\">");
            sb.AppendLine($"      <textarea id=\"txtComentario-{nodoId}\" placeholder=\"Escriba un comentario y pulse Enviar...\"></textarea>");
            sb.AppendLine("      <div class=\"comentarios-form-footer\">");
            sb.AppendLine($"        <input type=\"text\" id=\"txtNombre-{nodoId}\" placeholder=\"Nombre\" />");
            sb.AppendLine($"        <select id=\"cmbCargo-{nodoId}\">");
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
            sb.AppendLine($"        <button type=\"button\" onclick=\"agregarComentarioNodo('{nodoId}')\">Enviar</button>");
            sb.AppendLine($"        <button type=\"button\" class=\"btn-eliminar\" onclick=\"eliminarNodo('{nodoId}')\">Eliminar nodo</button>");
            sb.AppendLine("      </div>");
            sb.AppendLine("    </div>");
            sb.AppendLine("  </div>");

            sb.AppendLine("</section>");
            return sb.ToString();
        }


        private static string MakeSlug(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw))
                return "nodo";

            var sb = new StringBuilder("nodo-");
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

        private static string Html(string? s)
        {
            return WebUtility.HtmlEncode(s ?? string.Empty);
        }

        private static string Fmt(double value)
        {
            return value.ToString("0.000", CultureInfo.InvariantCulture);
        }
    }
}

using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;

namespace SicoePresupuestoNET8
{
    /// <summary>
    /// Generador de biblioteca de métodos SicoeCAD en HTML.
    /// Se invoca (actualmente) desde FrmSicoeCad al hacer clic en pictureAutor.
    /// </summary>
    internal static class MethodDocLibrary
    {
        /// <summary>
        /// Punto de entrada usado por el lanzador.
        /// Mantiene el nombre para no romper llamadas existentes.
        /// </summary>
        public static void AppendFrmSicoePresupuestoDoc()
        {
            try
            {
                GenerateFullLibraryHtml();
            }
            catch
            {
                // Silencioso: cualquier error se maneja en el formulario llamador.
                throw;
            }
        }

        /// <summary>
        /// Genera (o regenera) el HTML completo de biblioteca de métodos.
        /// Siempre SOBRESCRIBE el archivo SicoeCAD_MethodLibrary.html.
        /// </summary>
        private static void GenerateFullLibraryHtml()
        {
            // Ensamblado principal (donde vive FrmSicoePresupuesto y gran parte de la lógica)
            Assembly asm = typeof(FrmSicoePresupuesto).Assembly;

            // Tipos de interés: clases de los namespaces SicoePresupuestoNET8 y SicoeCAD
            var tipos = asm
                .GetTypes()
                .Where(t =>
                    t.IsClass &&
                    t.Namespace != null &&
                    !t.IsGenericType &&
                    !t.FullName!.StartsWith("SicoePresupuestoNET8.Properties", StringComparison.OrdinalIgnoreCase) &&
                    (t.Namespace!.StartsWith("SicoePresupuestoNET8", StringComparison.OrdinalIgnoreCase) ||
                     t.Namespace!.StartsWith("SicoeCAD", StringComparison.OrdinalIgnoreCase)))
                .OrderBy(t => t.Namespace)
                .ThenBy(t => t.Name)
                .ToList();

            var sb = new StringBuilder(200_000);

            // ========== ENCABEZADO HTML + CSS ==========
            sb.AppendLine("<!DOCTYPE html>");
            sb.AppendLine("<html lang=\"es\">");
            sb.AppendLine("<head>");
            sb.AppendLine("  <meta charset=\"utf-8\" />");
            sb.AppendLine("  <title>SicoeCAD – Biblioteca de métodos</title>");
            sb.AppendLine("  <style>");
            sb.AppendLine("    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;");
            sb.AppendLine("           font-size: 14px; color: #222; background-color: #f5f7fb; margin: 0; padding: 0; }");
            sb.AppendLine("    header { background: linear-gradient(90deg,#018a9c,#005f73); color: #fff;");
            sb.AppendLine("             padding: 16px 32px; box-shadow: 0 2px 6px rgba(0,0,0,0.15); }");
            sb.AppendLine("    header h1 { margin: 0; font-size: 22px; }");
            sb.AppendLine("    header h2 { margin: 4px 0 0 0; font-size: 14px; font-weight: 400; opacity: .9; }");
            sb.AppendLine("    main { padding: 20px 32px 40px 32px; }");
            sb.AppendLine("    .meta { font-size: 12px; color: #555; margin-top: 8px; }");
            sb.AppendLine("    .toc-box { background:#ffffff; border-radius:12px; padding:16px 20px;");
            sb.AppendLine("               box-shadow:0 1px 4px rgba(0,0,0,0.08); margin-bottom:24px; }");
            sb.AppendLine("    .toc-title { font-weight:600; margin-bottom:6px; }");
            sb.AppendLine("    .toc-list { columns: 3 260px; -webkit-columns:3 260px; -moz-columns:3 260px;");
            sb.AppendLine("                list-style:none; padding-left:0; margin:4px 0 0 0; }");
            sb.AppendLine("    .toc-list li { margin: 2px 0; }");
            sb.AppendLine("    .toc-list a { color:#005f73; text-decoration:none; }");
            sb.AppendLine("    .toc-list a:hover { text-decoration:underline; }");
            sb.AppendLine("    section.type-block { background:#ffffff; border-radius:12px; padding:14px 18px 10px 18px;");
            sb.AppendLine("                         margin-bottom:18px; box-shadow:0 1px 4px rgba(0,0,0,0.05); }");
            sb.AppendLine("    section.type-block h3 { margin:0 0 4px 0; font-size:16px; }");
            sb.AppendLine("    section.type-block .type-path { font-size:11px; color:#777; margin-bottom:8px; }");
            sb.AppendLine("    table.methods { width:100%; border-collapse:collapse; font-size:12px; }");
            sb.AppendLine("    table.methods th, table.methods td { border:1px solid #dde3ec; padding:4px 6px; }");
            sb.AppendLine("    table.methods th { background:#e9f3f7; font-weight:600; text-align:left; }");
            sb.AppendLine("    table.methods tbody tr:nth-child(even) { background:#f7fafc; }");
            sb.AppendLine("    code { font-family:'Cascadia Code','Consolas','Fira Code',monospace; font-size:12px; }");
            sb.AppendLine("    .pill { display:inline-block; padding:1px 6px; border-radius:999px; font-size:10px;");
            sb.AppendLine("            line-height:1.5; background:#edf2ff; color:#234; border:1px solid #c9d3ff; }");
            sb.AppendLine("    .pill-static { background:#ffe9f0; border-color:#ffc2d4; }");
            sb.AppendLine("    .pill-private { background:#fef3c7; border-color:#fde68a; }");
            sb.AppendLine("    footer { font-size:11px; color:#777; text-align:center; padding:10px 0 18px 0; }");
            sb.AppendLine("  </style>");
            sb.AppendLine("</head>");
            sb.AppendLine("<body>");

            // ========== HEADER ==========
            sb.AppendLine("<header>");
            sb.AppendLine("  <h1>SicoeCAD – Biblioteca de métodos del plugin</h1>");
            sb.AppendLine("  <h2>Mapa técnico automático de clases y métodos del ensamblado</h2>");
            sb.AppendLine($"  <div class=\"meta\">Generado: {DateTime.Now:yyyy-MM-dd HH:mm:ss} &nbsp;|&nbsp; Ensamblado: {asm.GetName().Name}</div>");
            sb.AppendLine("</header>");

            sb.AppendLine("<main>");

            // ========== TABLA DE CONTENIDO ==========
            sb.AppendLine("  <div class=\"toc-box\">");
            sb.AppendLine("    <div class=\"toc-title\">Tabla de contenido (clases detectadas)</div>");
            sb.AppendLine("    <ul class=\"toc-list\">");

            foreach (var t in tipos)
            {
                string typeId = GetTypeAnchorId(t);
                sb.Append("      <li><a href=\"#").Append(typeId).Append("\">");
                sb.Append(Escape(t.Name));
                sb.Append(" <span style=\"color:#999;font-size:10px\">(")
                  .Append(Escape(t.Namespace ?? ""))
                  .Append(")</span>");
                sb.AppendLine("</a></li>");
            }

            sb.AppendLine("    </ul>");
            sb.AppendLine("  </div>");

            // ========== BLOQUE POR TIPO ==========
            foreach (var t in tipos)
            {
                string typeId = GetTypeAnchorId(t);

                sb.AppendLine();
                sb.AppendLine($"  <section class=\"type-block\" id=\"{typeId}\">");
                sb.Append("    <h3>").Append(Escape(t.Name)).AppendLine("</h3>");
                sb.Append("    <div class=\"type-path\">")
                  .Append("Namespace: <code>")
                  .Append(Escape(t.Namespace ?? ""))
                  .Append("</code> &nbsp;|&nbsp; Tipo completo: <code>")
                  .Append(Escape(t.FullName ?? t.Name))
                  .AppendLine("</code></div>");

                // Obtener TODOS los métodos declarados en la clase
                var methods = t.GetMethods(
                        BindingFlags.Instance |
                        BindingFlags.Static |
                        BindingFlags.Public |
                        BindingFlags.NonPublic |
                        BindingFlags.DeclaredOnly)
                    .Where(m => !m.IsSpecialName) // quita getters/setters, operadores y add/remove de eventos
                    .Where(m => !m.Name.StartsWith("<", StringComparison.Ordinal)) // evita lambdas/async
                    .OrderBy(m => m.IsPublic ? 0 : 1)
                    .ThenBy(m => m.IsStatic ? 0 : 1)
                    .ThenBy(m => m.Name)
                    .ToList();

                if (methods.Count == 0)
                {
                    sb.AppendLine("    <div style=\"font-size:12px;color:#666;margin-top:4px;\">(Sin métodos declarados en este tipo.)</div>");
                    sb.AppendLine("  </section>");
                    continue;
                }

                sb.AppendLine("    <table class=\"methods\">");
                sb.AppendLine("      <thead>");
                sb.AppendLine("        <tr>");
                sb.AppendLine("          <th style=\"width:22%\">Firma del método</th>");
                sb.AppendLine("          <th style=\"width:10%\">Ámbito</th>");
                sb.AppendLine("          <th style=\"width:8%\">Tipo</th>");
                sb.AppendLine("          <th style=\"width:20%\">Parámetros</th>");
                sb.AppendLine("          <th style=\"width:15%\">Tipo de retorno</th>");
                sb.AppendLine("          <th style=\"width:25%\">Descripción auto-generada</th>");
                sb.AppendLine("        </tr>");
                sb.AppendLine("      </thead>");
                sb.AppendLine("      <tbody>");

                foreach (var m in methods)
                {
                    sb.AppendLine("        <tr>");

                    // Firma corta
                    sb.Append("          <td><code>")
                      .Append(Escape(m.Name))
                      .Append("</code></td>");

                    // Ámbito (public / internal / protected / private)
                    string scope = m.IsPublic ? "public"
                                   : m.IsFamily ? "protected"
                                   : m.IsAssembly ? "internal"
                                   : m.IsFamilyOrAssembly ? "protected internal"
                                   : "private";

                    string scopeClass = scope.IndexOf("private", StringComparison.OrdinalIgnoreCase) >= 0
                        ? "pill pill-private"
                        : "pill";

                    sb.Append("          <td><span class=\"")
                      .Append(scopeClass)
                      .Append("\">")
                      .Append(Escape(scope))
                      .AppendLine("</span></td>");

                    // Tipo (instancia/estático)
                    string tipo = m.IsStatic ? "static" : "instance";
                    string tipoClass = m.IsStatic ? "pill pill-static" : "pill";

                    sb.Append("          <td><span class=\"")
                      .Append(tipoClass)
                      .Append("\">")
                      .Append(Escape(tipo))
                      .AppendLine("</span></td>");

                    // Parámetros
                    var parametros = m.GetParameters();
                    if (parametros.Length == 0)
                    {
                        sb.AppendLine("          <td>(sin parámetros)</td>");
                    }
                    else
                    {
                        var paramText = string.Join(", ",
                            parametros.Select(p => $"{p.ParameterType.Name} {p.Name}"));
                        sb.Append("          <td><code>")
                          .Append(Escape(paramText))
                          .AppendLine("</code></td>");
                    }

                    // Retorno
                    string ret = m.ReturnType == typeof(void)
                        ? "void"
                        : m.ReturnType.Name;
                    sb.Append("          <td><code>")
                      .Append(Escape(ret))
                      .AppendLine("</code></td>");

                    // Descripción automática muy breve
                    string descAuto = BuildAutoSummary(t, m);
                    sb.Append("          <td>")
                      .Append(Escape(descAuto))
                      .AppendLine("</td>");

                    sb.AppendLine("        </tr>");
                }

                sb.AppendLine("      </tbody>");
                sb.AppendLine("    </table>");
                sb.AppendLine("  </section>");
            }

            sb.AppendLine("</main>");
            sb.AppendLine("<footer>");
            sb.AppendLine("  SicoeCAD – Sistema Integrado de Control de Obra Ejecutada · Módulos de presupuesto y topografía.");
            sb.AppendLine("  <br/>Esta biblioteca se genera automáticamente a partir del código compilado; "
                        + "no expone información sensible distinta a nombres de clases y métodos.");
            sb.AppendLine("</footer>");
            sb.AppendLine("</body>");
            sb.AppendLine("</html>");

            // === Escritura del archivo (SIEMPRE SOBREESCRIBE) ===
            string asmPath = asm.Location;
            string folder = Path.GetDirectoryName(asmPath) ?? Environment.CurrentDirectory;
            string outPath = Path.Combine(folder, "SicoeCAD_MethodLibrary.html");

            File.WriteAllText(outPath, sb.ToString(), Encoding.UTF8);
        }

        // ----------------- HELPERS -----------------

        private static string GetTypeAnchorId(Type t)
        {
            // id único válido para HTML: namespace + nombre sin puntos
            string full = t.FullName ?? t.Name;
            var chars = full.Select(ch =>
                char.IsLetterOrDigit(ch) ? ch : '_').ToArray();
            return new string(chars);
        }

        private static string Escape(string? raw)
        {
            if (string.IsNullOrEmpty(raw)) return string.Empty;
            return raw
                .Replace("&", "&amp;")
                .Replace("<", "&lt;")
                .Replace(">", "&gt;")
                .Replace("\"", "&quot;");
        }

        /// <summary>
        /// Crea una descripción corta en castellano a partir de la clase y el método.
        /// (No es documentación funcional, pero ayuda a orientarse visualmente).
        /// </summary>
        private static string BuildAutoSummary(Type t, MethodInfo m)
        {
            var kind = m.IsStatic ? "Método estático" : "Método de instancia";

            string rol =
                m.Name.EndsWith("_Click", StringComparison.OrdinalIgnoreCase) ? " (manejador de evento Click)" :
                m.Name.EndsWith("_Load", StringComparison.OrdinalIgnoreCase) ? " (manejador de evento Load)" :
                m.Name.StartsWith("On", StringComparison.OrdinalIgnoreCase) ? " (método de evento / override)" :
                m.Name.StartsWith("Btn", StringComparison.OrdinalIgnoreCase) ? " (lógica asociada a botón)" :
                m.Name.StartsWith("Grid", StringComparison.OrdinalIgnoreCase) ? " (lógica asociada a grid)" :
                "";

            return $"{kind} declarado en {t.Name}{rol}.";
        }
    }
}

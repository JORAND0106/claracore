using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Spreadsheet;
using SicoePresupuestoNET8;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;

public static class SicoeXlsmExporter
{
    private const string TargetSheetName = "SicoeCAD_Data";
    private const string TargetTableName = "tblSicoeCAD";

    public static void ExportToExistingXlsm(string xlsmPath, IReadOnlyList<FrmSicoePresupuesto.GridRow> rows)
    {
        if (string.IsNullOrWhiteSpace(xlsmPath)) throw new ArgumentException("Ruta XLSM vacía.");
        if (!File.Exists(xlsmPath)) throw new FileNotFoundException("No existe el XLSM.", xlsmPath);

        using var doc = SpreadsheetDocument.Open(xlsmPath, true);
        var wbPart = doc.WorkbookPart ?? throw new InvalidOperationException("WorkbookPart nulo.");

        var sheet = wbPart.Workbook.Sheets
            .OfType<Sheet>()
            .FirstOrDefault(s => string.Equals(s.Name?.Value, TargetSheetName, StringComparison.OrdinalIgnoreCase))
            ?? throw new InvalidOperationException($"No se encontró la hoja '{TargetSheetName}'.");

        // Acceso compatible con OpenXml 2.x
        if (sheet.Id == null || string.IsNullOrEmpty(sheet.Id.Value))
            throw new InvalidOperationException($"La hoja '{TargetSheetName}' no tiene un Id válido.");

        var wsPart = (WorksheetPart)wbPart.GetPartById(sheet.Id);

        var sheetData = wsPart.Worksheet.Descendants<SheetData>().FirstOrDefault()
            ?? throw new InvalidOperationException("No se encontró SheetData en la hoja destino.");

        var tablePart = wsPart.TableDefinitionParts
            .FirstOrDefault(tp =>
            {
                var t = tp.Table;
                var name = t?.Name?.Value ?? "";
                var dname = t?.DisplayName?.Value ?? "";
                return string.Equals(name, TargetTableName, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(dname, TargetTableName, StringComparison.OrdinalIgnoreCase);
            });

        if (tablePart == null || tablePart.Table == null)
            throw new InvalidOperationException($"No se encontró la tabla '{TargetTableName}' en la hoja '{TargetSheetName}'.");

        var table = tablePart.Table;

        if (table.Reference == null || string.IsNullOrEmpty(table.Reference.Value))
            throw new InvalidOperationException("La tabla no tiene un rango de referencia válido.");

        var (startCol, startRow, endCol, endRow) = ParseRange(table.Reference.Value);

        var tableCols = table.TableColumns?.OfType<TableColumn>().ToList()
            ?? throw new InvalidOperationException("La tabla no tiene TableColumns.");

        var colNames = tableCols.Select(c => c.Name?.Value ?? "").ToList();
        if (colNames.Count == 0) throw new InvalidOperationException("La tabla no tiene nombres de columnas.");

        var headerMap = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (int i = 0; i < colNames.Count; i++)
        {
            var name = colNames[i].Trim();
            if (name.Length == 0) continue;
            headerMap[name] = startCol + i;
        }

        var firstDataRow = startRow + 1;

        // NO borrar nada - encontrar la última fila con datos existentes
        var existingDataRows = sheetData.Elements<Row>()
            .Where(r =>
            {
                var idx = (int)(r.RowIndex?.Value ?? 0);
                return idx >= firstDataRow && idx <= endRow;
            })
            .ToList();

        // Calcular desde dónde empezar a escribir (después de la última fila existente)
        uint writeRowIndex = existingDataRows.Count > 0
            ? (uint)(existingDataRows.Max(r => (int)(r.RowIndex?.Value ?? 0)) + 1)
            : (uint)firstDataRow;

        foreach (var gr in rows)
        {
            var row = new Row { RowIndex = writeRowIndex };

            foreach (var kv in headerMap)
            {
                string header = kv.Key;
                int colIndex = kv.Value;
                var cellRef = GetCellReference(colIndex, (int)writeRowIndex);
                var cell = BuildCellForHeader(header, cellRef, gr);
                row.Append(cell);
            }

            sheetData.Append(row);
            writeRowIndex++;
        }

        // Calcular el nuevo rango: desde startRow hasta la última fila escrita
        var newEndRow = Math.Max(endRow, (int)writeRowIndex - 1);
        var newRef = BuildRange(startCol, startRow, startCol + colNames.Count - 1, newEndRow);

        table.Reference.Value = newRef;

        if (table.AutoFilter != null && table.AutoFilter.Reference != null)
            table.AutoFilter.Reference.Value = newRef;

        table.Save();
        wsPart.Worksheet.Save();
        wbPart.Workbook.Save();
    }

    private static Cell BuildCellForHeader(string header, string cellRef, FrmSicoePresupuesto.GridRow r)
    {
        object? value = header.Trim() switch
        {
            "Capitulo" => r.Capitulo,
            "Competencia" => r.Competencia,
            "Pk_Id" => r.PK_ID,
            "Abs. Inicio" => r.AbsIni,
            "Abs. Final" => r.AbsFin,
            "Item" => r.Item,
            "Descripción" => r.Descripcion,
            "Und" => r.Und,
            "Vlr Unitario" => r.VlrUnitario,
            "Calzada" => r.Calzada,
            "Tramo" => r.Tramo,
            "No. Inicio" => r.NoInicio,
            "No. Final" => r.NoFinal,
            "Area/Long/Nod" => r.AreaLongNod,
            "Ancho" => r.Ancho,
            "Espesor" => r.Espesor,
            "Cant.Total" => r.CantTotal,
            "Costo Directo" => r.CostoDirecto,
            "Tipo de Ejecución" => r.TipoEjecucion,
            "Tipo de Entidad" => r.TipoEntidad,
            "ID_Pol" => r.ID_Pol,
            "Observación" => r.Observacion,
            "CapaSolo" => r.CapaSolo,
            "EntHandle" => r.EntHandle,
            "TxtHandle" => r.TxtHandle,
            "LayerEnt" => r.LayerEnt,
            "LayerTxt" => r.LayerTxt,
            "ColorHex" => r.ColorHex,
            "GUID" => r.GUID,
            "Remitente" => r.Remitente,
            "Fecha Soporte" => r.FechaSoporte,
            "Asunto Soporte" => r.AsuntoSoporte,
            "Link Soporte" => r.LinkSoporte,
            "X_LABEL (Este)" => r.X_LABEL,
            "Y_LABEL (Norte)" => r.Y_LABEL,
            "X_DWG (Este)" => "",
            "Y_DWG (Norte)" => "",
            "Rasante Ini" => r.RasanteIni,
            "Rasante Fin" => r.RasanteFin,
            "Clave Ini" => r.ClaveIni,
            "Clave Fin" => r.ClaveFin,
            _ => ""
        };

        if (value is decimal dec)
            return NewNumberCell(cellRef, (double)dec);
        if (value is double dbl)
            return NewNumberCell(cellRef, dbl);
        if (value is float flt)
            return NewNumberCell(cellRef, flt);
        if (value is int i32)
            return NewNumberCell(cellRef, i32);

        var s = (value?.ToString() ?? "").Trim();
        return NewInlineStringCell(cellRef, s);
    }

    private static Cell NewInlineStringCell(string cellRef, string text)
    {
        return new Cell
        {
            CellReference = cellRef,
            DataType = CellValues.InlineString,
            InlineString = new InlineString(new Text(text ?? ""))
        };
    }

    private static Cell NewNumberCell(string cellRef, double value)
    {
        string s = value.ToString(CultureInfo.InvariantCulture);
        return new Cell
        {
            CellReference = cellRef,
            DataType = CellValues.Number,
            CellValue = new CellValue(s)
        };
    }

    private static (int startCol, int startRow, int endCol, int endRow) ParseRange(string a1Range)
    {
        var parts = a1Range.Split(':');
        if (parts.Length != 2) throw new InvalidOperationException("Rango de tabla inválido: " + a1Range);

        var (sc, sr) = ParseA1(parts[0]);
        var (ec, er) = ParseA1(parts[1]);
        return (sc, sr, ec, er);
    }

    private static (int col, int row) ParseA1(string a1)
    {
        a1 = a1.Trim();
        int i = 0;
        while (i < a1.Length && char.IsLetter(a1[i])) i++;

        var colPart = a1.Substring(0, i).ToUpperInvariant();
        var rowPart = a1.Substring(i);

        int col = ColumnNameToIndex(colPart);
        int row = int.Parse(rowPart, CultureInfo.InvariantCulture);
        return (col, row);
    }

    private static string BuildRange(int startCol, int startRow, int endCol, int endRow)
    {
        return $"{IndexToColumnName(startCol)}{startRow}:{IndexToColumnName(endCol)}{endRow}";
    }

    private static string GetCellReference(int colIndex, int rowIndex)
    {
        return IndexToColumnName(colIndex) + rowIndex.ToString(CultureInfo.InvariantCulture);
    }

    private static int ColumnNameToIndex(string col)
    {
        int sum = 0;
        foreach (char c in col)
        {
            if (c < 'A' || c > 'Z') continue;
            sum *= 26;
            sum += (c - 'A' + 1);
        }
        return sum;
    }

    private static string IndexToColumnName(int index)
    {
        var dividend = index;
        string colName = "";
        while (dividend > 0)
        {
            int modulo = (dividend - 1) % 26;
            colName = Convert.ToChar('A' + modulo) + colName;
            dividend = (dividend - modulo) / 26;
        }
        return colName;
    }
}
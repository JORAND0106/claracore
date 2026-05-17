using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

public static class UiTheme
{
    // Paleta
    public static readonly Color Bg = Color.FromArgb(248, 250, 252); // #F8FAFC
    public static readonly Color Text = Color.FromArgb(15, 23, 42);    // #0F172A
    public static readonly Color MutedText = Color.FromArgb(71, 85, 105);   // #475569
    public static readonly Color Card = Color.White;
    public static readonly Color Border = Color.FromArgb(229, 231, 235); // #E5E7EB
    public static readonly Color InputBg = Color.FromArgb(241, 245, 249); // #F1F5F9
    public static readonly Color Primary = Color.FromArgb(37, 99, 235);   // #2563EB
    public static readonly Color PrimaryHover = Color.FromArgb(29, 78, 216);   // #1D4ED8
    public static readonly Color DangerBorder = Color.FromArgb(254, 226, 226); // #FEE2E2
    public static readonly Color DangerText = Color.FromArgb(185, 28, 28);   // #B91C1C

    public static readonly Font BodyFont = new Font("Segoe UI", 9.5f, FontStyle.Regular);
    public static readonly Font SectionFont = new Font("Segoe UI Semibold", 10.5f);

    public static void Apply(Form form)
    {
        form.BackColor = Bg;
        form.Font = BodyFont;
        form.ForeColor = Text;
        form.Padding = new Padding(10);

        foreach (var c in AllControls(form))
        {
            if (c is Panel p)
            {
                p.BackColor = Card;
                p.Padding = new Padding(12);
                p.Paint += (s, e) =>
                {
                    e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                    var r = new Rectangle(0, 0, p.Width - 1, p.Height - 1);
                    using var path = Rounded(r, 10);
                    using var bg = new SolidBrush(Card);
                    using var pen = new Pen(Border);
                    e.Graphics.FillPath(bg, path);
                    e.Graphics.DrawPath(pen, path);
                };
            }
            else if (c is TextBox tb)
            {
                tb.BorderStyle = BorderStyle.FixedSingle;
                tb.BackColor = InputBg;
                tb.ForeColor = Text;
                tb.Margin = new Padding(6);
                tb.Height = 28;
            }
            else if (c is ComboBox cb)
            {
                cb.FlatStyle = FlatStyle.Flat;
                cb.BackColor = Color.White;
                cb.ForeColor = Text;
                cb.Margin = new Padding(6);
                cb.Height = 28;
            }
            else if (c is Button b)
            {
                StyleButton(b);
            }
            else if (c is Label lbl)
            {
                lbl.ForeColor = MutedText;
            }
            else if (c is DataGridView dg)
            {
                dg.BackgroundColor = Card;
                dg.BorderStyle = BorderStyle.None;
                dg.GridColor = Border;
                dg.EnableHeadersVisualStyles = false;
                dg.ColumnHeadersDefaultCellStyle.BackColor = Card;
                dg.ColumnHeadersDefaultCellStyle.ForeColor = Text;
                dg.DefaultCellStyle.BackColor = Card;
                dg.DefaultCellStyle.ForeColor = Text;
                dg.DefaultCellStyle.SelectionBackColor = Color.FromArgb(229, 243, 255);
                dg.DefaultCellStyle.SelectionForeColor = Text;
            }
        }
    }

    public static void StyleButton(Button b)
    {
        b.FlatStyle = FlatStyle.Flat;
        b.FlatAppearance.BorderSize = 0;
        b.Height = Math.Max(b.Height, 30);
        b.Margin = new Padding(6);
        b.Cursor = Cursors.Hand;

        var tag = (b.Tag as string)?.ToLowerInvariant();
        if (tag == "primary")
        {
            b.BackColor = Primary;
            b.ForeColor = Color.White;
            b.MouseEnter += (s, e) => b.BackColor = PrimaryHover;
            b.MouseLeave += (s, e) => b.BackColor = Primary;
        }
        else if (tag == "danger")
        {
            b.BackColor = Color.White;
            b.ForeColor = DangerText;
            b.FlatAppearance.BorderSize = 1;
            b.FlatAppearance.BorderColor = DangerBorder;
        }
        else
        {
            // secundario
            b.BackColor = Color.White;
            b.ForeColor = Text;
            b.FlatAppearance.BorderSize = 1;
            b.FlatAppearance.BorderColor = Border;
        }

        b.Resize += (s, e) =>
        {
            var rect = new Rectangle(0, 0, b.Width, b.Height);
            using var path = Rounded(rect, 8);
            b.Region = new Region(path);
        };
    }

    static IEnumerable<Control> AllControls(Control root)
    {
        foreach (Control c in root.Controls)
        {
            foreach (var cc in AllControls(c)) yield return cc;
            yield return c;
        }
    }

    static GraphicsPath Rounded(Rectangle r, int radius)
    {
        int d = radius * 2;
        var path = new GraphicsPath();
        path.AddArc(r.X, r.Y, d, d, 180, 90);
        path.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        path.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }
}

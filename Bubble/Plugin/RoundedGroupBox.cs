using System.ComponentModel;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace SicoePresupuestoNET8.Controls
{
    [DesignerCategory("code")]
    public class RoundedGroupBox : GroupBox
    {
        private int _borderRadius = 14;
        private int _borderSize = 1;
        private Color _borderColor = Color.FromArgb(225, 229, 236); // gris suave
        private Color _backgroundColor = Color.White;

        [Category("Appearance")]
        public int BorderRadius
        {
            get => _borderRadius;
            set { _borderRadius = value < 0 ? 0 : value; Invalidate(); }
        }

        [Category("Appearance")]
        public int BorderSize
        {
            get => _borderSize;
            set { _borderSize = value < 1 ? 1 : value; Invalidate(); }
        }

        [Category("Appearance")]
        public Color BorderColor
        {
            get => _borderColor;
            set { _borderColor = value; Invalidate(); }
        }

        [Category("Appearance")]
        public Color BackgroundColor
        {
            get => _backgroundColor;
            set { _backgroundColor = value; Invalidate(); }
        }

        public RoundedGroupBox()
        {
            DoubleBuffered = true;
            ResizeRedraw = true;
            Padding = new Padding(12, 24, 12, 12); // espacio para el título
            BackColor = Color.Transparent;         // pintamos nosotros el fondo
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;

            // fondo exterior (del contenedor padre)
            var parentBack = Parent?.BackColor ?? SystemColors.Control;
            g.Clear(parentBack);

            // rectángulo interior
            var rect = ClientRectangle;
            rect.Inflate(-1, -1);

            using (var path = CreatePath(rect, _borderRadius))
            {
                // relleno
                using (var fill = new SolidBrush(_backgroundColor))
                    g.FillPath(fill, path);

                // borde
                using (var pen = new Pen(_borderColor, _borderSize))
                    g.DrawPath(pen, path);
            }

            // “cortar” el borde detrás del texto (como hace GroupBox)
            var textSize = TextRenderer.MeasureText(Text, Font);
            var wipeRect = new Rectangle(rect.X + 16, rect.Y - 1, textSize.Width + 6, textSize.Height);
            using (var wipe = new SolidBrush(parentBack))
                g.FillRectangle(wipe, wipeRect);

            // título
            TextRenderer.DrawText(g, Text, Font, new Point(rect.X + 20, rect.Y + 0), ForeColor);
        }

        private static GraphicsPath CreatePath(Rectangle r, int radius)
        {
            var path = new GraphicsPath();
            if (radius <= 0) { path.AddRectangle(r); return path; }

            float d = radius * 2f;
            path.AddArc(r.X, r.Y, d, d, 180, 90);
            path.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            path.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }
    }
}

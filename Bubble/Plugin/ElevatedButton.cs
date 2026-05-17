using System.ComponentModel;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace SicoePresupuestoNET8.Controls
{
    [DesignerCategory("code")]
    public class ElevatedButton : Button
    {
        // --- Apariencia configurable ---
        private int _cornerRadius = 14;
        private int _elevation = 6;
        private int _borderSize = 1;

        private Color _baseColor = Color.FromArgb(33, 118, 255);
        private Color _hoverColor = Color.FromArgb(27, 105, 232);
        private Color _pressedColor = Color.FromArgb(21, 92, 210);
        private Color _disabledColor = Color.FromArgb(200, 205, 210);
        private Color _borderColor = Color.FromArgb(220, 223, 230);
        private Color _shadowColor = Color.FromArgb(80, 0, 0, 0);
        private Color _textColor = Color.White;

        private bool _hover;
        private bool _pressed;

        public ElevatedButton()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint |
                     ControlStyles.OptimizedDoubleBuffer |
                     ControlStyles.UserPaint |
                     ControlStyles.ResizeRedraw, true);

            FlatStyle = FlatStyle.Flat;     // evitamos el estilo por defecto
            FlatAppearance.BorderSize = 0;
            BackColor = Color.Transparent;
            ForeColor = _textColor;
            Padding = new Padding(12, 6, 12, 6);
            Cursor = Cursors.Hand;
            AutoSize = false;
            Size = new Size(120, 40);
        }

        // -------- Propiedades ----------
        [Category("Appearance")]
        public int CornerRadius
        {
            get => _cornerRadius;
            set { _cornerRadius = value < 0 ? 0 : value; Invalidate(); }
        }

        [Category("Appearance")]
        public int Elevation
        {
            get => _elevation;
            set { _elevation = value < 0 ? 0 : value; Invalidate(); }
        }

        [Category("Appearance")]
        public int BorderSize
        {
            get => _borderSize;
            set { _borderSize = value < 0 ? 0 : value; Invalidate(); }
        }

        [Category("Appearance")]
        public Color BaseColor
        {
            get => _baseColor;
            set { _baseColor = value; Invalidate(); }
        }

        [Category("Appearance")]
        public Color HoverColor
        {
            get => _hoverColor;
            set { _hoverColor = value; Invalidate(); }
        }

        [Category("Appearance")]
        public Color PressedColor
        {
            get => _pressedColor;
            set { _pressedColor = value; Invalidate(); }
        }

        [Category("Appearance")]
        public Color DisabledColor
        {
            get => _disabledColor;
            set { _disabledColor = value; Invalidate(); }
        }

        [Category("Appearance")]
        public Color BorderColor
        {
            get => _borderColor;
            set { _borderColor = value; Invalidate(); }
        }

        [Category("Appearance")]
        public Color ShadowColor
        {
            get => _shadowColor;
            set { _shadowColor = value; Invalidate(); }
        }

        [Category("Appearance")]
        public Color TextColor
        {
            get => _textColor;
            set { _textColor = value; ForeColor = value; Invalidate(); }
        }

        // --------- Estados ----------
        protected override void OnMouseEnter(System.EventArgs e)
        { _hover = true; Invalidate(); base.OnMouseEnter(e); }

        protected override void OnMouseLeave(System.EventArgs e)
        { _hover = false; _pressed = false; Invalidate(); base.OnMouseLeave(e); }

        protected override void OnMouseDown(MouseEventArgs mevent)
        { _pressed = mevent.Button == MouseButtons.Left; Invalidate(); base.OnMouseDown(mevent); }

        protected override void OnMouseUp(MouseEventArgs mevent)
        { _pressed = false; Invalidate(); base.OnMouseUp(mevent); }

        protected override void OnEnabledChanged(System.EventArgs e)
        { Invalidate(); base.OnEnabledChanged(e); }

        // --------- Dibujo ----------
        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;

            // Área base
            Rectangle rect = ClientRectangle;
            Rectangle rectShadow = new Rectangle(rect.X, rect.Y + _elevation, rect.Width, rect.Height);

            // Colores según estado
            Color fill = !Enabled ? _disabledColor
                        : _pressed ? _pressedColor
                        : _hover ? _hoverColor
                        : _baseColor;

            // Sombra (elevación)
            if (_elevation > 0 && Enabled)
            {
                using var pathShadow = CreateRoundRect(rectShadow, _cornerRadius);
                using var shadowBrush = new SolidBrush(_shadowColor);
                g.FillPath(shadowBrush, pathShadow);
            }

            // Botón
            using var path = CreateRoundRect(rect, _cornerRadius);
            using var brush = new LinearGradientBrush(rect,
                                ControlPaint.Light(fill, 0.06f),
                                ControlPaint.Dark(fill, 0.06f),
                                LinearGradientMode.Vertical);
            g.FillPath(brush, path);

            // Borde
            if (_borderSize > 0)
            {
                using var pen = new Pen(_borderColor, _borderSize);
                g.DrawPath(pen, path);
            }

            // Texto (centrado)
            TextRenderer.DrawText(
                g,
                Text,
                Font,
                rect,
                Enabled ? _textColor : Color.FromArgb(160, _textColor),
                TextFormatFlags.HorizontalCenter |
                TextFormatFlags.VerticalCenter |
                TextFormatFlags.EndEllipsis);

            // Enfoque (accesibilidad)
            if (Focused && ShowFocusCues)
            {
                Rectangle focusRect = Rectangle.Inflate(rect, -_cornerRadius, -_cornerRadius);
                ControlPaint.DrawFocusRectangle(e.Graphics, focusRect);
            }
        }

        private static GraphicsPath CreateRoundRect(Rectangle r, int radius)
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

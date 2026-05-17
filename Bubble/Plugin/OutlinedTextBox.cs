using System.ComponentModel;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace SicoePresupuestoNET8.Controls
{
    [DesignerCategory("code")]
    public class OutlinedTextBox : TextBox
    {
        private Color _borderColor = Color.FromArgb(220, 223, 230);
        private Color _focusColor = Color.FromArgb(33, 118, 255);
        private int _borderRadius = 10;
        private int _borderThickness = 1;
        private string _placeholder = string.Empty;
        private bool _isPlaceholder;

        public OutlinedTextBox()
        {
            BorderStyle = BorderStyle.None;
            Padding = new Padding(8);
            SetStyle(ControlStyles.AllPaintingInWmPaint |
                     ControlStyles.OptimizedDoubleBuffer |
                     ControlStyles.UserPaint |
                     ControlStyles.ResizeRedraw, true);

            // Altura agradable
            Height = 32;
        }

        [Category("Appearance")]
        public Color BorderColor
        {
            get => _borderColor;
            set { _borderColor = value; Invalidate(); }
        }

        [Category("Appearance")]
        public Color FocusColor
        {
            get => _focusColor;
            set { _focusColor = value; Invalidate(); }
        }

        [Category("Appearance")]
        public int BorderRadius
        {
            get => _borderRadius;
            set { _borderRadius = value < 0 ? 0 : value; Invalidate(); }
        }

        [Category("Appearance")]
        public int BorderThickness
        {
            get => _borderThickness;
            set { _borderThickness = value < 1 ? 1 : value; Invalidate(); }
        }

        [Category("Appearance")]
        public string Placeholder
        {
            get => _placeholder;
            set { _placeholder = value ?? ""; SetPlaceholder(); Invalidate(); }
        }

        protected override void OnCreateControl()
        {
            base.OnCreateControl();
            SetPlaceholder();
        }

        protected override void OnEnter(System.EventArgs e)
        {
            base.OnEnter(e);
            if (_isPlaceholder)
            {
                Text = "";
                _isPlaceholder = false;
                ForeColor = SystemColors.WindowText;
            }
            Invalidate();
        }

        protected override void OnLeave(System.EventArgs e)
        {
            base.OnLeave(e);
            SetPlaceholder();
            Invalidate();
        }

        private void SetPlaceholder()
        {
            if (string.IsNullOrEmpty(Text))
            {
                _isPlaceholder = true;
                Text = _placeholder;
                ForeColor = Color.Gray;
            }
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;

            var rect = ClientRectangle;
            using var path = CreatePath(rect, _borderRadius);

            using var bg = new SolidBrush(BackColor == Color.Empty ? Color.White : BackColor);
            g.FillPath(bg, path);

            // Texto
            var flags = TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.EndEllipsis;
            Rectangle textRect = Rectangle.Inflate(rect, -8, -2);
            TextRenderer.DrawText(g, Text, Font, textRect, ForeColor, flags);

            // Borde
            var color = Focused ? _focusColor : _borderColor;
            using var pen = new Pen(color, _borderThickness);
            g.DrawPath(pen, path);
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

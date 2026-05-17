using System.Windows.Forms;

namespace SicoePresupuestoNET8
{
    partial class FrmCapasCsvPopup
    {
        private System.ComponentModel.IContainer components = null;
        private System.Windows.Forms.Panel topBar;
        private System.Windows.Forms.Button btnCargarCsv;
        private System.Windows.Forms.Button btnOk;
        private System.Windows.Forms.Button btnCancel;
        private System.Windows.Forms.Label lblRuta;
        private System.Windows.Forms.DataGridView dgvCapas;
        private System.Windows.Forms.Button btnCargarPk;


        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null)) components.Dispose();
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            components = new System.ComponentModel.Container();
            DataGridViewCellStyle dataGridViewCellStyle2 = new DataGridViewCellStyle();
            topBar = new Panel();
            btnNuevoPk = new Button();
            btnImportJson = new Button();
            btnExportJson = new Button();
            btnExportGeoJson = new Button();
            btnCargarPk = new Button();
            btnCancel = new Button();
            btnOk = new Button();
            btnCargarCsv = new Button();
            lblRuta = new Label();
            dgvCapas = new DataGridView();
            colRegion = new DataGridViewTextBoxColumn();
            toolTip1 = new ToolTip(components);
            topBar.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)dgvCapas).BeginInit();
            SuspendLayout();
            // 
            // topBar
            // 
            topBar.BackColor = System.Drawing.Color.FromArgb(225, 237, 255);
            topBar.Controls.Add(btnNuevoPk);
            topBar.Controls.Add(btnImportJson);
            topBar.Controls.Add(btnExportJson);
            topBar.Controls.Add(btnExportGeoJson);
            topBar.Controls.Add(btnCargarPk);
            topBar.Controls.Add(btnCancel);
            topBar.Controls.Add(btnOk);
            topBar.Controls.Add(btnCargarCsv);
            topBar.Controls.Add(lblRuta);
            topBar.Dock = DockStyle.Top;
            topBar.Location = new System.Drawing.Point(0, 0);
            topBar.Margin = new Padding(3, 4, 3, 4);
            topBar.Name = "topBar";
            topBar.Size = new System.Drawing.Size(1029, 64);
            topBar.TabIndex = 0;
            // 
            // btnNuevoPk
            // 
            btnNuevoPk.BackgroundImage = Properties.Resources.Crear_Pk_ID;
            btnNuevoPk.BackgroundImageLayout = ImageLayout.Zoom;
            btnNuevoPk.ForeColor = System.Drawing.Color.Black;
            btnNuevoPk.Location = new System.Drawing.Point(120, 3);
            btnNuevoPk.Name = "btnNuevoPk";
            btnNuevoPk.Size = new System.Drawing.Size(28, 29);
            btnNuevoPk.TabIndex = 7;
            toolTip1.SetToolTip(btnNuevoPk, "Crear un PK-ID nuevo");
            btnNuevoPk.UseVisualStyleBackColor = true;
            // 
            // btnImportJson
            // 
            btnImportJson.BackgroundImage = Properties.Resources.Importa_Json;
            btnImportJson.BackgroundImageLayout = ImageLayout.Zoom;
            btnImportJson.ForeColor = System.Drawing.Color.Black;
            btnImportJson.Location = new System.Drawing.Point(916, 4);
            btnImportJson.Name = "btnImportJson";
            btnImportJson.Size = new System.Drawing.Size(28, 29);
            btnImportJson.TabIndex = 6;
            toolTip1.SetToolTip(btnImportJson, "Importar Regiones DWG de un archivo JSON");
            btnImportJson.UseVisualStyleBackColor = true;
            // 
            // btnExportJson
            // 
            btnExportJson.BackColor = System.Drawing.Color.White;
            btnExportJson.BackgroundImage = Properties.Resources.Exporta_Json;
            btnExportJson.BackgroundImageLayout = ImageLayout.Zoom;
            btnExportJson.ForeColor = System.Drawing.Color.Black;
            btnExportJson.Location = new System.Drawing.Point(916, 32);
            btnExportJson.Name = "btnExportJson";
            btnExportJson.Size = new System.Drawing.Size(28, 29);
            btnExportJson.TabIndex = 5;
            toolTip1.SetToolTip(btnExportJson, "Exportar Regiones DWG de un archivo JSON");
            btnExportJson.UseVisualStyleBackColor = false;
            // 
            // btnExportGeoJson
            // 
            btnExportGeoJson.BackColor = System.Drawing.Color.White;
            btnExportGeoJson.ForeColor = System.Drawing.Color.FromArgb(10, 33, 64);
            btnExportGeoJson.Font = new System.Drawing.Font("Segoe UI", 7F, System.Drawing.FontStyle.Bold);
            btnExportGeoJson.Location = new System.Drawing.Point(948, 4);
            btnExportGeoJson.Name = "btnExportGeoJson";
            btnExportGeoJson.Size = new System.Drawing.Size(28, 29);
            btnExportGeoJson.TabIndex = 8;
            btnExportGeoJson.Text = "GEO";
            toolTip1.SetToolTip(btnExportGeoJson, "Exportar regiones a GeoJSON (WGS84)");
            btnExportGeoJson.UseVisualStyleBackColor = false;
            // 
            // btnCargarPk
            // 
            btnCargarPk.BackColor = System.Drawing.Color.FromArgb(224, 224, 224);
            btnCargarPk.BackgroundImage = Properties.Resources.Cargar_PK_ID;
            btnCargarPk.BackgroundImageLayout = ImageLayout.Zoom;
            btnCargarPk.FlatStyle = FlatStyle.Flat;
            btnCargarPk.ForeColor = System.Drawing.Color.Black;
            btnCargarPk.Location = new System.Drawing.Point(62, 3);
            btnCargarPk.Margin = new Padding(3, 4, 3, 4);
            btnCargarPk.Name = "btnCargarPk";
            btnCargarPk.Size = new System.Drawing.Size(56, 58);
            btnCargarPk.TabIndex = 4;
            toolTip1.SetToolTip(btnCargarPk, "Crear Región en AutoCAD");
            btnCargarPk.UseVisualStyleBackColor = false;
            btnCargarPk.Click += BtnCargarPk_Click;
            // 
            // btnCancel
            // 
            btnCancel.DialogResult = DialogResult.Cancel;
            btnCancel.Location = new System.Drawing.Point(950, 33);
            btnCancel.Margin = new Padding(3, 4, 3, 4);
            btnCancel.Name = "btnCancel";
            btnCancel.Size = new System.Drawing.Size(69, 28);
            btnCancel.TabIndex = 3;
            btnCancel.Text = "Cancelar";
            btnCancel.UseVisualStyleBackColor = true;
            // 
            // btnOk
            // 
            btnOk.BackColor = System.Drawing.Color.FromArgb(64, 128, 255);
            btnOk.DialogResult = DialogResult.OK;
            btnOk.FlatStyle = FlatStyle.Flat;
            btnOk.ForeColor = System.Drawing.Color.White;
            btnOk.Location = new System.Drawing.Point(950, 3);
            btnOk.Margin = new Padding(3, 4, 3, 4);
            btnOk.Name = "btnOk";
            btnOk.Size = new System.Drawing.Size(69, 28);
            btnOk.TabIndex = 2;
            btnOk.Text = "Aceptar";
            btnOk.UseVisualStyleBackColor = false;
            // 
            // btnCargarCsv
            // 
            btnCargarCsv.BackgroundImage = Properties.Resources.Importar_Csv;
            btnCargarCsv.BackgroundImageLayout = ImageLayout.Zoom;
            btnCargarCsv.FlatStyle = FlatStyle.Flat;
            btnCargarCsv.ForeColor = System.Drawing.Color.Black;
            btnCargarCsv.Location = new System.Drawing.Point(3, 3);
            btnCargarCsv.Margin = new Padding(3, 4, 3, 4);
            btnCargarCsv.Name = "btnCargarCsv";
            btnCargarCsv.Size = new System.Drawing.Size(56, 58);
            btnCargarCsv.TabIndex = 0;
            toolTip1.SetToolTip(btnCargarCsv, "Cargar CSV con PK-ID del Proyecto");
            btnCargarCsv.UseVisualStyleBackColor = false;
            btnCargarCsv.Click += BtnCargarCsv_Click;
            // 
            // lblRuta
            // 
            lblRuta.Location = new System.Drawing.Point(154, 4);
            lblRuta.Name = "lblRuta";
            lblRuta.Size = new System.Drawing.Size(683, 56);
            lblRuta.TabIndex = 1;
            lblRuta.Text = "Ruta: (sin cargar)";
            // 
            // dgvCapas
            // 
            dgvCapas.AllowUserToOrderColumns = true;
            dgvCapas.BackgroundColor = System.Drawing.Color.White;
            dataGridViewCellStyle2.Alignment = DataGridViewContentAlignment.MiddleLeft;
            dataGridViewCellStyle2.BackColor = System.Drawing.Color.FromArgb(210, 228, 255);
            dataGridViewCellStyle2.Font = new System.Drawing.Font("Segoe UI", 9F);
            dataGridViewCellStyle2.ForeColor = System.Drawing.Color.Black;
            dataGridViewCellStyle2.SelectionBackColor = System.Drawing.SystemColors.Highlight;
            dataGridViewCellStyle2.SelectionForeColor = System.Drawing.SystemColors.HighlightText;
            dataGridViewCellStyle2.WrapMode = DataGridViewTriState.True;
            dgvCapas.ColumnHeadersDefaultCellStyle = dataGridViewCellStyle2;
            dgvCapas.ColumnHeadersHeight = 29;
            dgvCapas.Columns.AddRange(new DataGridViewColumn[] { colRegion });
            dgvCapas.Dock = DockStyle.Fill;
            dgvCapas.EnableHeadersVisualStyles = false;
            dgvCapas.Location = new System.Drawing.Point(0, 64);
            dgvCapas.Margin = new Padding(3, 4, 3, 4);
            dgvCapas.MultiSelect = false;
            dgvCapas.Name = "dgvCapas";
            dgvCapas.ReadOnly = true;
            dgvCapas.RowHeadersWidth = 51;
            dgvCapas.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            dgvCapas.Size = new System.Drawing.Size(1029, 629);
            dgvCapas.TabIndex = 4;
            // 
            // colRegion
            // 
            colRegion.HeaderText = "Región";
            colRegion.MinimumWidth = 6;
            colRegion.Name = "colRegion";
            colRegion.ReadOnly = true;
            colRegion.Width = 60;
            // 
            // FrmCapasCsvPopup
            // 
            AcceptButton = btnOk;
            AutoScaleDimensions = new System.Drawing.SizeF(8F, 20F);
            AutoScaleMode = AutoScaleMode.Font;
            BackColor = System.Drawing.Color.FromArgb(240, 247, 255);
            CancelButton = btnCancel;
            ClientSize = new System.Drawing.Size(1029, 693);
            Controls.Add(dgvCapas);
            Controls.Add(topBar);
            Font = new System.Drawing.Font("Segoe UI", 9F);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            Margin = new Padding(3, 4, 3, 4);
            MaximizeBox = false;
            MinimizeBox = false;
            Name = "FrmCapasCsvPopup";
            StartPosition = FormStartPosition.CenterParent;
            Text = "Capas CSV";
            topBar.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)dgvCapas).EndInit();
            ResumeLayout(false);

        }
        private DataGridViewTextBoxColumn colRegion;
        private Button btnExportJson;
        private Button btnImportJson;
        private Button btnNuevoPk;
        private Button btnExportGeoJson;
        private ToolTip toolTip1;
    }
}

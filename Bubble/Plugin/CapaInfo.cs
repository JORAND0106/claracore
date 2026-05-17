using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SicoePresupuestoNET8
{
    public sealed class CapaInfo
    {
        public string CAPA { get; set; } = "";
        public string CIV { get; set; } = "";
        public string TRAMO { get; set; } = "";
        public string INFRAESTRUCTURA { get; set; } = "";
        public string COSTADO { get; set; } = "";
        public string UBICACION { get; set; } = "";
        public string ABS_INICIO { get; set; } = "";
        public string ABS_FINAL { get; set; } = "";
        public string CALZADA { get; set; } = "";  // "NORTE/ SUR / ORIENTE / OCCIDENTE" o "A"/"B"
    }
}

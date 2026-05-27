using Microsoft.Win32;
using System;
using System.IO;
using System.IO.Pipes;
using System.Windows.Forms;

namespace ClaraLink
{
    internal static class Program
    {
        private const string PIPE_NAME = "ClaraLinkPipe";

        [STAThread]
        static void Main(string[] args)
        {
            ApplicationConfiguration.Initialize();
            RegistrarUriScheme();

            string? uri = args.Length > 0 ? args[0] : null;

            // Si llegó una URI, intentar pasarla a instancia existente
            if (uri != null && uri.StartsWith("claralink://", StringComparison.OrdinalIgnoreCase))
            {
                if (EnviarAInstanciaExistente(uri))
                    return;
            }

            // No hay instancia corriendo → arrancar como proceso principal
            Application.Run(new FrmClaraLink(uri));
        }

        private static bool EnviarAInstanciaExistente(string uri)
        {
            try
            {
                using var client = new NamedPipeClientStream(".", PIPE_NAME, PipeDirection.Out);
                client.Connect(2500);  // espera a instancia en bandeja (navegador lanza URI)
                using var sw = new StreamWriter(client);
                sw.WriteLine(uri);
                return true;
            }
            catch { return false; }
        }

        internal static void IniciarServidorPipe(Action<string> onUri)
        {
            System.Threading.ThreadPool.QueueUserWorkItem(_ =>
            {
                while (true)
                {
                    try
                    {
                        using var server = new NamedPipeServerStream(PIPE_NAME, PipeDirection.In);
                        server.WaitForConnection();
                        using var sr = new StreamReader(server);
                        var line = sr.ReadLine();
                        if (!string.IsNullOrWhiteSpace(line))
                            onUri(line);
                    }
                    catch { }
                }
            });
        }

        private static void RegistrarUriScheme()
        {
            try
            {
                string exePath = System.Diagnostics.Process.GetCurrentProcess().MainModule!.FileName;
                using var key = Registry.CurrentUser.CreateSubKey(@"Software\Classes\claralink");
                key.SetValue("", "URL:ClaraLink Protocol");
                key.SetValue("URL Protocol", "");
                using var cmd = key.CreateSubKey(@"shell\open\command");
                cmd.SetValue("", $"\"{exePath}\" \"%1\"");
            }
            catch { }
        }
    }
}
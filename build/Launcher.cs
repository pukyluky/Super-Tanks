using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace TanquesTacticosLauncher
{
    internal static class NativeJob
    {
        [StructLayout(LayoutKind.Sequential)]
        private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
        {
            public long PerProcessUserTimeLimit;
            public long PerJobUserTimeLimit;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize;
            public UIntPtr MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass;
            public uint SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct IO_COUNTERS
        {
            public ulong ReadOperationCount;
            public ulong WriteOperationCount;
            public ulong OtherOperationCount;
            public ulong ReadTransferCount;
            public ulong WriteTransferCount;
            public ulong OtherTransferCount;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        {
            public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
            public IO_COUNTERS IoInfo;
            public UIntPtr ProcessMemoryLimit;
            public UIntPtr JobMemoryLimit;
            public UIntPtr PeakProcessMemoryUsed;
            public UIntPtr PeakJobMemoryUsed;
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        private static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string lpName);

        [DllImport("kernel32.dll")]
        private static extern bool SetInformationJobObject(IntPtr hJob, int infoClass, ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION lpJobObjectInfo, uint cbJobObjectInfoLength);

        [DllImport("kernel32.dll")]
        private static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

        private const int JobObjectExtendedLimitInformation = 9;
        private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;

        public static IntPtr CreateKillOnCloseJob(Process proc)
        {
            IntPtr hJob = CreateJobObject(IntPtr.Zero, null);
            if (hJob == IntPtr.Zero) return IntPtr.Zero;

            var info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            int len = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
            SetInformationJobObject(hJob, JobObjectExtendedLimitInformation, ref info, (uint)len);
            AssignProcessToJobObject(hJob, proc.Handle);
            return hJob;
        }
    }

    internal static class Program
    {
        private const string AppFolderName = "TanquesTacticos2D";
        private const string PayloadResourceName = "Tanques.payload.zip";

        [STAThread]
        private static int Main(string[] args)
        {
            bool selfTest = args != null && args.Length > 0 && args[0] == "--self-test";
            Application.EnableVisualStyles();
            try
            {
                string baseDataDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    AppFolderName
                );
                string appDir = EnsurePayloadExtracted(Path.Combine(baseDataDir, "app"));
                string nodeExe = Path.Combine(appDir, "node.exe");
                string serverJs = Path.Combine(appDir, "server.js");

                if (!File.Exists(nodeExe) || !File.Exists(serverJs))
                {
                    MessageBox.Show("Faltan archivos internos del juego.", "Tanques Tacticos 2D", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return 1;
                }

                int port = GetFreeTcpPort();
                var serverPsi = new ProcessStartInfo
                {
                    FileName = nodeExe,
                    Arguments = "server.js",
                    WorkingDirectory = appDir,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                serverPsi.EnvironmentVariables["PORT"] = port.ToString();

                Process serverProc = Process.Start(serverPsi);
                if (serverProc == null)
                {
                    MessageBox.Show("No se pudo iniciar el motor del juego.", "Tanques Tacticos 2D", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return 1;
                }

                IntPtr jobHandle = NativeJob.CreateKillOnCloseJob(serverProc);
                string baseUrl = "http://127.0.0.1:" + port;

                if (!WaitForServerReady(baseUrl + "/index.html", serverProc, 8000))
                {
                    StopServer(baseUrl, serverProc);
                    MessageBox.Show("El servidor del juego no respondio a tiempo.", "Tanques Tacticos 2D", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return 1;
                }

                if (selfTest)
                {
                    StopServer(baseUrl, serverProc);
                    GC.KeepAlive(jobHandle);
                    return serverProc.HasExited ? 0 : 2;
                }

                string browserExe = FindChromiumBrowser();
                Process browserProc = null;

                if (!string.IsNullOrEmpty(browserExe))
                {
                    string profileDir = Path.Combine(baseDataDir, "BrowserProfile");
                    Directory.CreateDirectory(profileDir);

                    var browserPsi = new ProcessStartInfo
                    {
                        FileName = browserExe,
                        Arguments = string.Format(
                            "--app={0} --user-data-dir=\"{1}\" --new-window --window-size=1340,880 --no-first-run --no-default-browser-check",
                            baseUrl,
                            profileDir
                        ),
                        UseShellExecute = false
                    };

                    DateTime startedAt = DateTime.UtcNow;
                    browserProc = Process.Start(browserPsi);
                    if (browserProc != null)
                    {
                        while (!serverProc.HasExited && !browserProc.HasExited)
                        {
                            Thread.Sleep(150);
                        }

                        // Si el navegador delego en otra instancia ya abierta (< 1.5s), esperamos al cierre automatico por WebSocket del servidor.
                        if (!serverProc.HasExited && browserProc.HasExited && (DateTime.UtcNow - startedAt).TotalMilliseconds < 1500)
                        {
                            serverProc.WaitForExit();
                        }
                    }
                    else
                    {
                        serverProc.WaitForExit();
                    }
                }
                else
                {
                    Process.Start(new ProcessStartInfo { FileName = baseUrl, UseShellExecute = true });
                    serverProc.WaitForExit();
                }

                StopServer(baseUrl, serverProc);
                GC.KeepAlive(jobHandle);
                return 0;
            }
            catch (Exception ex)
            {
                MessageBox.Show("Error ejecutando Tanques Tacticos 2D:\n" + ex.Message, "Tanques Tacticos 2D", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }

        private static string EnsurePayloadExtracted(string appDir)
        {
            Assembly asm = Assembly.GetExecutingAssembly();
            using (Stream resStream = asm.GetManifestResourceStream(PayloadResourceName))
            {
                if (resStream == null)
                {
                    throw new InvalidOperationException("Recurso embebido no encontrado: " + PayloadResourceName);
                }

                string hash;
                using (var sha = SHA256.Create())
                {
                    byte[] digest = sha.ComputeHash(resStream);
                    hash = BitConverter.ToString(digest).Replace("-", "");
                }

                string stampFile = Path.Combine(appDir, ".payload_sha256");
                if (Directory.Exists(appDir) && File.Exists(stampFile) && File.ReadAllText(stampFile).Trim() == hash)
                {
                    return appDir;
                }

                if (Directory.Exists(appDir))
                {
                    Directory.Delete(appDir, true);
                }
                Directory.CreateDirectory(appDir);

                resStream.Position = 0;
                string tmpZip = Path.Combine(Path.GetTempPath(), "tanques_payload_" + Guid.NewGuid().ToString("N") + ".zip");
                try
                {
                    using (var fs = File.Create(tmpZip))
                    {
                        resStream.CopyTo(fs);
                    }
                    ZipFile.ExtractToDirectory(tmpZip, appDir);
                    File.WriteAllText(stampFile, hash, Encoding.UTF8);
                }
                finally
                {
                    if (File.Exists(tmpZip)) File.Delete(tmpZip);
                }
            }

            return appDir;
        }

        private static int GetFreeTcpPort()
        {
            try
            {
                var preferred = new TcpListener(IPAddress.Any, 3000);
                preferred.Start();
                preferred.Stop();
                return 3000;
            }
            catch
            {
            }

            var listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            int port = ((IPEndPoint)listener.LocalEndpoint).Port;
            listener.Stop();
            return port;
        }

        private static bool WaitForServerReady(string checkUrl, Process serverProc, int timeoutMs)
        {
            DateTime deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
            while (DateTime.UtcNow < deadline && !serverProc.HasExited)
            {
                try
                {
                    var req = (HttpWebRequest)WebRequest.Create(checkUrl);
                    req.Timeout = 250;
                    using (var resp = (HttpWebResponse)req.GetResponse())
                    {
                        if (resp.StatusCode == HttpStatusCode.OK) return true;
                    }
                }
                catch
                {
                }
                Thread.Sleep(60);
            }
            return false;
        }

        private static void StopServer(string baseUrl, Process serverProc)
        {
            if (serverProc == null || serverProc.HasExited) return;

            try
            {
                var req = (HttpWebRequest)WebRequest.Create(baseUrl + "/api/shutdown");
                req.Method = "POST";
                req.Timeout = 400;
                req.ContentLength = 0;
                using (req.GetResponse()) { }
            }
            catch
            {
            }

            try
            {
                if (!serverProc.WaitForExit(500))
                {
                    serverProc.Kill();
                }
            }
            catch
            {
            }
        }

        private static string FindChromiumBrowser()
        {
            string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string la = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

            string[] directCandidates =
            {
                Path.Combine(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(pf, "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(pf86, "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(la, "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(pf, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
                Path.Combine(pf86, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
                Path.Combine(la, "BraveSoftware", "Brave-Browser", "Application", "brave.exe")
            };

            foreach (string path in directCandidates)
            {
                if (!string.IsNullOrEmpty(path) && File.Exists(path)) return path;
            }

            string[] exeNames = { "msedge.exe", "chrome.exe", "brave.exe", "opera.exe" };
            foreach (string exe in exeNames)
            {
                string subKey = @"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\" + exe;
                string regPath = ReadRegPath(Registry.LocalMachine, subKey) ?? ReadRegPath(Registry.CurrentUser, subKey);
                if (!string.IsNullOrEmpty(regPath) && File.Exists(regPath)) return regPath;
            }

            return null;
        }

        private static string ReadRegPath(RegistryKey root, string subKey)
        {
            try
            {
                using (RegistryKey key = root.OpenSubKey(subKey))
                {
                    object val = key != null ? key.GetValue(null) : null;
                    if (val == null) return null;
                    return val.ToString().Trim().Trim('"');
                }
            }
            catch
            {
                return null;
            }
        }
    }
}

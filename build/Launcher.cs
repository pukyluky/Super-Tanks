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

        private static class NativeWin
        {
            public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

            [DllImport("user32.dll")]
            public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

            [DllImport("user32.dll")]
            public static extern bool IsWindow(IntPtr hWnd);

            [DllImport("user32.dll")]
            public static extern bool IsWindowVisible(IntPtr hWnd);

            [DllImport("user32.dll", CharSet = CharSet.Unicode)]
            public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

            [DllImport("user32.dll")]
            public static extern int GetWindowTextLength(IntPtr hWnd);

            [DllImport("user32.dll")]
            public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

            [DllImport("user32.dll", EntryPoint = "GetWindowLongPtr")]
            public static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);

            [DllImport("user32.dll", EntryPoint = "SetWindowLongPtr")]
            public static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

            [DllImport("user32.dll")]
            public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

            [DllImport("user32.dll")]
            public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

            public const int GWL_STYLE = -16;
            public const long WS_FRAME_BITS = 0x00CF0000L; // WS_CAPTION | WS_SYSMENU | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX
            public const uint SWP_NOZORDER = 0x0004;
            public const uint SWP_NOACTIVATE = 0x0010;
            public const uint SWP_FRAMECHANGED = 0x0020;
            public const uint SWP_SHOWWINDOW = 0x0040;
            public const int SW_RESTORE = 9;
        }

        private sealed class DisplaySettings
        {
            public string DisplayMode = "windowed";
            public string Resolution = "1340x880";
        }

        private static readonly object WindowSync = new object();
        private static IntPtr CachedBrowserHwnd = IntPtr.Zero;
        private static long SavedFrameStyle = 0;

        private static string NormalizeDisplayMode(string mode)
        {
            if (mode == "borderless" || mode == "fullscreen") return mode;
            return "windowed";
        }

        private static string NormalizeResolution(string res)
        {
            if (string.IsNullOrWhiteSpace(res) || res == "auto") return "auto";
            int w, h;
            if (TryParseResolution(res, out w, out h)) return w + "x" + h;
            return "1340x880";
        }

        private static bool TryParseResolution(string res, out int width, out int height)
        {
            width = 0;
            height = 0;
            if (string.IsNullOrWhiteSpace(res) || res == "auto") return false;
            string[] parts = res.Trim().ToLowerInvariant().Split('x');
            if (parts.Length != 2) return false;
            if (!int.TryParse(parts[0], out width) || !int.TryParse(parts[1], out height)) return false;
            if (width < 640 || height < 480 || width > 7680 || height > 4320) return false;
            return true;
        }

        private static string ExtractJsonString(string json, string key)
        {
            if (string.IsNullOrEmpty(json)) return null;
            string marker = "\"" + key + "\"";
            int keyIdx = json.IndexOf(marker, StringComparison.Ordinal);
            if (keyIdx < 0) return null;
            int colonIdx = json.IndexOf(':', keyIdx + marker.Length);
            if (colonIdx < 0) return null;
            int q1 = json.IndexOf('"', colonIdx + 1);
            if (q1 < 0) return null;
            int q2 = json.IndexOf('"', q1 + 1);
            if (q2 < 0) return null;
            return json.Substring(q1 + 1, q2 - q1 - 1);
        }

        private static DisplaySettings LoadDisplaySettings(string path)
        {
            var cfg = new DisplaySettings();
            try
            {
                if (File.Exists(path))
                {
                    string raw = File.ReadAllText(path, Encoding.UTF8);
                    string mode = ExtractJsonString(raw, "displayMode");
                    string res = ExtractJsonString(raw, "resolution");
                    if (!string.IsNullOrEmpty(mode)) cfg.DisplayMode = NormalizeDisplayMode(mode);
                    if (!string.IsNullOrEmpty(res)) cfg.Resolution = NormalizeResolution(res);
                }
            }
            catch
            {
            }
            return cfg;
        }

        private static void SaveDisplaySettings(string path, DisplaySettings cfg)
        {
            try
            {
                string json = string.Format(
                    "{{\"displayMode\":\"{0}\",\"resolution\":\"{1}\"}}",
                    NormalizeDisplayMode(cfg.DisplayMode),
                    NormalizeResolution(cfg.Resolution)
                );
                File.WriteAllText(path, json, Encoding.UTF8);
            }
            catch
            {
            }
        }

        private static IntPtr FindBrowserWindowHandle(Process browserProc)
        {
            lock (WindowSync)
            {
                if (CachedBrowserHwnd != IntPtr.Zero && NativeWin.IsWindow(CachedBrowserHwnd) && NativeWin.IsWindowVisible(CachedBrowserHwnd))
                {
                    return CachedBrowserHwnd;
                }

                IntPtr byPid = IntPtr.Zero;
                IntPtr byTitle = IntPtr.Zero;
                int targetPid = browserProc != null ? browserProc.Id : -1;

                NativeWin.EnumWindows((hWnd, lParam) =>
                {
                    if (!NativeWin.IsWindowVisible(hWnd)) return true;
                    int len = NativeWin.GetWindowTextLength(hWnd);
                    if (len <= 0) return true;
                    var sb = new StringBuilder(len + 1);
                    NativeWin.GetWindowText(hWnd, sb, sb.Capacity);
                    string title = sb.ToString();

                    uint winPid;
                    NativeWin.GetWindowThreadProcessId(hWnd, out winPid);

                    if (targetPid > 0 && winPid == (uint)targetPid && title.IndexOf("Tanques", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        byPid = hWnd;
                        return false;
                    }
                    if (byTitle == IntPtr.Zero && title.IndexOf("Tanques", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        byTitle = hWnd;
                    }
                    return true;
                }, IntPtr.Zero);

                CachedBrowserHwnd = byPid != IntPtr.Zero ? byPid : byTitle;
                return CachedBrowserHwnd;
            }
        }

        private static bool ApplyDisplaySettingsToWindow(Process browserProc, DisplaySettings cfg)
        {
            IntPtr hwnd = FindBrowserWindowHandle(browserProc);
            if (hwnd == IntPtr.Zero) return false;

            lock (WindowSync)
            {
                long style = NativeWin.GetWindowLongPtr(hwnd, NativeWin.GWL_STYLE).ToInt64();
                if (SavedFrameStyle == 0)
                {
                    SavedFrameStyle = style | NativeWin.WS_FRAME_BITS;
                }

                var screen = Screen.PrimaryScreen;
                var bounds = screen.Bounds;
                var work = screen.WorkingArea;

                int reqW, reqH;
                bool hasExplicitRes = TryParseResolution(cfg.Resolution, out reqW, out reqH);

                if (cfg.DisplayMode == "borderless")
                {
                    NativeWin.ShowWindow(hwnd, NativeWin.SW_RESTORE);
                    long borderlessStyle = style & ~NativeWin.WS_FRAME_BITS;
                    NativeWin.SetWindowLongPtr(hwnd, NativeWin.GWL_STYLE, new IntPtr(borderlessStyle));

                    int targetW = hasExplicitRes ? Math.Min(reqW, bounds.Width) : bounds.Width;
                    int targetH = hasExplicitRes ? Math.Min(reqH, bounds.Height) : bounds.Height;
                    int posX = bounds.X + Math.Max(0, (bounds.Width - targetW) / 2);
                    int posY = bounds.Y + Math.Max(0, (bounds.Height - targetH) / 2);

                    NativeWin.SetWindowPos(
                        hwnd,
                        IntPtr.Zero,
                        posX,
                        posY,
                        targetW,
                        targetH,
                        NativeWin.SWP_FRAMECHANGED | NativeWin.SWP_NOZORDER | NativeWin.SWP_SHOWWINDOW | NativeWin.SWP_NOACTIVATE
                    );
                    return true;
                }

                if (cfg.DisplayMode == "windowed")
                {
                    NativeWin.ShowWindow(hwnd, NativeWin.SW_RESTORE);
                    long windowedStyle = SavedFrameStyle != 0 ? SavedFrameStyle : (style | NativeWin.WS_FRAME_BITS);
                    NativeWin.SetWindowLongPtr(hwnd, NativeWin.GWL_STYLE, new IntPtr(windowedStyle));

                    int defW = hasExplicitRes ? reqW : 1340;
                    int defH = hasExplicitRes ? reqH : 880;
                    int targetW = Math.Min(defW, work.Width);
                    int targetH = Math.Min(defH, work.Height);
                    int posX = work.X + Math.Max(0, (work.Width - targetW) / 2);
                    int posY = work.Y + Math.Max(0, (work.Height - targetH) / 2);

                    NativeWin.SetWindowPos(
                        hwnd,
                        IntPtr.Zero,
                        posX,
                        posY,
                        targetW,
                        targetH,
                        NativeWin.SWP_FRAMECHANGED | NativeWin.SWP_NOZORDER | NativeWin.SWP_SHOWWINDOW | NativeWin.SWP_NOACTIVATE
                    );
                    return true;
                }

                return true;
            }
        }

        private static int StartWindowControlServer(string settingsPath, Func<Process> getBrowserProc, DisplaySettings currentCfg)
        {
            var listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            int port = ((IPEndPoint)listener.LocalEndpoint).Port;

            var thread = new Thread(() =>
            {
                while (true)
                {
                    try
                    {
                        using (TcpClient client = listener.AcceptTcpClient())
                        using (NetworkStream stream = client.GetStream())
                        {
                            client.ReceiveTimeout = 1500;
                            var buffer = new byte[4096];
                            int read = stream.Read(buffer, 0, buffer.Length);
                            if (read <= 0) continue;

                            string raw = Encoding.UTF8.GetString(buffer, 0, read);
                            int bodySplit = raw.IndexOf("\r\n\r\n", StringComparison.Ordinal);
                            string body = bodySplit >= 0 ? raw.Substring(bodySplit + 4) : "";

                            if (raw.StartsWith("POST /apply", StringComparison.OrdinalIgnoreCase))
                            {
                                string mode = ExtractJsonString(body, "displayMode");
                                string res = ExtractJsonString(body, "resolution");
                                if (!string.IsNullOrEmpty(mode)) currentCfg.DisplayMode = NormalizeDisplayMode(mode);
                                if (!string.IsNullOrEmpty(res)) currentCfg.Resolution = NormalizeResolution(res);
                                SaveDisplaySettings(settingsPath, currentCfg);
                                bool applied = ApplyDisplaySettingsToWindow(getBrowserProc(), currentCfg);
                                string respBody = string.Format(
                                    "{{\"ok\":true,\"nativeWindow\":true,\"applied\":{0},\"displayMode\":\"{1}\",\"resolution\":\"{2}\"}}",
                                    applied ? "true" : "false",
                                    currentCfg.DisplayMode,
                                    currentCfg.Resolution
                                );
                                WriteHttpJson(stream, respBody);
                            }
                            else
                            {
                                string respBody = string.Format(
                                    "{{\"ok\":true,\"nativeWindow\":true,\"displayMode\":\"{0}\",\"resolution\":\"{1}\"}}",
                                    currentCfg.DisplayMode,
                                    currentCfg.Resolution
                                );
                                WriteHttpJson(stream, respBody);
                            }
                        }
                    }
                    catch
                    {
                    }
                }
            });
            thread.IsBackground = true;
            thread.Start();
            return port;
        }

        private static void WriteHttpJson(NetworkStream stream, string json)
        {
            byte[] payload = Encoding.UTF8.GetBytes(json);
            string header =
                "HTTP/1.1 200 OK\r\n" +
                "Content-Type: application/json; charset=utf-8\r\n" +
                "Content-Length: " + payload.Length + "\r\n" +
                "Connection: close\r\n\r\n";
            byte[] headerBytes = Encoding.ASCII.GetBytes(header);
            stream.Write(headerBytes, 0, headerBytes.Length);
            stream.Write(payload, 0, payload.Length);
        }

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
                string displaySettingsPath = Path.Combine(baseDataDir, "display-settings.json");
                DisplaySettings displayCfg = LoadDisplaySettings(displaySettingsPath);
                Process browserProc = null;
                int windowBridgePort = StartWindowControlServer(displaySettingsPath, () => browserProc, displayCfg);

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
                serverPsi.EnvironmentVariables["TANQUES_WINDOW_API"] = "http://127.0.0.1:" + windowBridgePort + "/";

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

                if (!string.IsNullOrEmpty(browserExe))
                {
                    string profileDir = Path.Combine(baseDataDir, "BrowserProfile");
                    Directory.CreateDirectory(profileDir);

                    var work = Screen.PrimaryScreen.WorkingArea;
                    var bounds = Screen.PrimaryScreen.Bounds;
                    int launchW, launchH;
                    if (displayCfg.DisplayMode == "borderless" && displayCfg.Resolution == "auto")
                    {
                        launchW = bounds.Width;
                        launchH = bounds.Height;
                    }
                    else if (!TryParseResolution(displayCfg.Resolution, out launchW, out launchH))
                    {
                        launchW = Math.Min(1340, work.Width);
                        launchH = Math.Min(880, work.Height);
                    }
                    else
                    {
                        launchW = Math.Min(launchW, bounds.Width);
                        launchH = Math.Min(launchH, bounds.Height);
                    }

                    string fsFlag = displayCfg.DisplayMode == "fullscreen" ? " --start-fullscreen" : "";
                    var browserPsi = new ProcessStartInfo
                    {
                        FileName = browserExe,
                        Arguments = string.Format(
                            "--app={0} --user-data-dir=\"{1}\" --new-window --window-size={2},{3}{4} --no-first-run --no-default-browser-check",
                            baseUrl,
                            profileDir,
                            launchW,
                            launchH,
                            fsFlag
                        ),
                        UseShellExecute = false
                    };

                    DateTime startedAt = DateTime.UtcNow;
                    browserProc = Process.Start(browserPsi);
                    if (browserProc != null)
                    {
                        if (displayCfg.DisplayMode == "borderless" || displayCfg.DisplayMode == "windowed")
                        {
                            var applyThread = new Thread(() =>
                            {
                                for (int attempt = 0; attempt < 50; attempt++)
                                {
                                    if (ApplyDisplaySettingsToWindow(browserProc, displayCfg)) break;
                                    Thread.Sleep(120);
                                }
                            });
                            applyThread.IsBackground = true;
                            applyThread.Start();
                        }

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

import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
import uuid
from unittest.mock import MagicMock, patch

import local_entry
import windows_startup


class WindowsStartupTests(unittest.TestCase):
    def test_native_mutex_prevents_duplicate_instances_and_can_be_released(self):
        with patch.object(local_entry, "MUTEX_NAME", "Local\\CotrimBotTest-" + uuid.uuid4().hex):
            handle = local_entry._acquire_instance_mutex()
            self.assertIsNotNone(handle)
            try:
                self.assertIsNone(local_entry._acquire_instance_mutex())
            finally:
                local_entry.ctypes.windll.kernel32.CloseHandle(local_entry.ctypes.c_void_p(handle))
            second = local_entry._acquire_instance_mutex()
            self.assertIsNotNone(second)
            local_entry.ctypes.windll.kernel32.CloseHandle(local_entry.ctypes.c_void_p(second))

    def test_install_keeps_dependencies_and_starts_the_installed_copy_hidden(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "download" / "CotrimBotTranscritor.exe"
            source.parent.mkdir()
            source.write_bytes(b"exe")
            (source.parent / "_internal").mkdir()
            (source.parent / "_internal" / "dependency.dll").write_bytes(b"dependency")
            destination = root / "user data" / "Programs" / "CotrimBotTranscritor"
            with patch.dict(os.environ, {"LOCALAPPDATA": str(root / "user data")}), \
                    patch.object(windows_startup, "set_startup") as register, \
                    patch.object(subprocess, "Popen") as launch:
                windows_startup.install_and_start(source)
            self.assertEqual((destination / "_internal" / "dependency.dll").read_bytes(), b"dependency")
            register.assert_called_once_with(destination / source.name)
            self.assertEqual(launch.call_args.args[0], [str(destination / source.name), "--background"])
            self.assertEqual(launch.call_args.kwargs["creationflags"], subprocess.CREATE_NO_WINDOW)
            self.assertEqual(launch.call_args.kwargs["env"]["PYINSTALLER_RESET_ENVIRONMENT"], "1")

    def test_startup_is_per_user_and_quotes_paths_with_spaces(self):
        registry = MagicMock()
        with patch.dict(sys.modules, {"winreg": registry}):
            windows_startup.set_startup(Path(r"C:\User Data\CotrimBotTranscritor.exe"))
        registry.CreateKey.assert_called_once_with(registry.HKEY_CURRENT_USER, windows_startup.RUN_KEY)
        self.assertEqual(registry.SetValueEx.call_args.args[-1], '"C:\\User Data\\CotrimBotTranscritor.exe" --background')

    def test_disable_is_idempotent_and_only_removes_our_entry(self):
        registry = MagicMock()
        with patch.dict(sys.modules, {"winreg": registry}):
            windows_startup.disable_startup()
            self.assertEqual(registry.DeleteValue.call_args.args[-1], windows_startup.APP_NAME)
            registry.DeleteValue.side_effect = FileNotFoundError
            windows_startup.disable_startup()

    def test_login_runs_without_installing_or_showing_dialogs(self):
        with patch.object(sys, "argv", ["transcritor.exe", "--background"]), \
                patch.object(sys, "frozen", True, create=True), \
                patch.object(local_entry, "run_service", return_value=0) as run, \
                patch.object(windows_startup, "install_and_start") as install, \
                patch.object(local_entry, "_notify") as notify:
            self.assertEqual(local_entry.main(), 0)
            run.assert_called_once()
            install.assert_not_called()
            notify.assert_not_called()

    def test_first_launch_installs_then_exits_instead_of_running_in_foreground(self):
        with patch.object(sys, "argv", ["transcritor.exe"]), \
                patch.object(sys, "frozen", True, create=True), \
                patch.object(local_entry, "run_service") as run, \
                patch.object(windows_startup, "install_and_start") as install, \
                patch.object(local_entry, "_notify") as notify:
            self.assertEqual(local_entry.main(), 0)
            install.assert_called_once_with(Path(sys.executable))
            run.assert_not_called()
            notify.assert_called_once()

    def test_duplicate_background_launch_does_not_start_another_server(self):
        uvicorn = MagicMock()
        with patch.dict(sys.modules, {"uvicorn": uvicorn, "main": SimpleNamespace(app=object())}), \
                patch.object(local_entry, "_acquire_instance_mutex", return_value=None):
            self.assertEqual(local_entry.run_service(), 0)
            uvicorn.Server.assert_not_called()


if __name__ == "__main__":
    unittest.main()

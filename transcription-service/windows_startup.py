"""Per-user installation and Windows sign-in startup (no administrator needed)."""

import os
from pathlib import Path
import shutil
import subprocess


APP_NAME = "CotrimBotTranscritor"
RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"


def set_startup(executable: Path):
    import winreg

    command = subprocess.list2cmdline([str(executable), "--background"])
    if len(command) > 260:
        raise OSError("O caminho de instalação excede o limite de inicialização do Windows.")
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as key:
        winreg.SetValueEx(key, APP_NAME, 0, winreg.REG_SZ, command)


def disable_startup():
    import winreg

    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:
            winreg.DeleteValue(key, APP_NAME)
    except FileNotFoundError:
        pass


def install_and_start(source_executable: Path):
    destination = Path(os.environ["LOCALAPPDATA"]) / "Programs" / APP_NAME
    executable = destination / source_executable.name
    if source_executable.resolve() != executable.resolve():
        # Keep the executable and its complete PyInstaller dependency folder together.
        # The extracted ZIP can then be removed without breaking Windows startup.
        shutil.copytree(source_executable.parent, destination, dirs_exist_ok=True)
    set_startup(executable)
    environment = {**os.environ, "PYINSTALLER_RESET_ENVIRONMENT": "1"}
    subprocess.Popen(
        [str(executable), "--background"],
        cwd=destination,
        env=environment,
        creationflags=subprocess.CREATE_NO_WINDOW,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        close_fds=True,
    )

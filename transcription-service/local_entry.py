import ctypes
import logging
import os
from pathlib import Path
import socket
import sys


HOST = "127.0.0.1"
PORT = 8765
MUTEX_NAME = "Local\\CotrimBotTranscritor"
ERROR_ALREADY_EXISTS = 183
logger = logging.getLogger("cotrimbot.transcription")


def _acquire_instance_mutex():
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_wchar_p]
    kernel32.CreateMutexW.restype = ctypes.c_void_p
    kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
    kernel32.CloseHandle.restype = ctypes.c_int
    ctypes.set_last_error(0)
    mutex = kernel32.CreateMutexW(None, False, MUTEX_NAME)
    error = ctypes.get_last_error()
    if not mutex:
        raise OSError(f"CreateMutexW falhou com código {error}.")
    if error == ERROR_ALREADY_EXISTS:
        kernel32.CloseHandle(mutex)
        return None
    return mutex


def _port_is_available() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            probe.bind((HOST, PORT))
        except OSError:
            return False
    return True


def _notify(message: str, error: bool = False):
    ctypes.windll.user32.MessageBoxW(None, message, "CotrimBot Transcritor", 0x10 if error else 0x40)


def run_service() -> int:
    import uvicorn
    from main import app

    mutex = _acquire_instance_mutex()
    if mutex is None:
        logger.info("O transcritor já está em execução; ignorando segunda instância.")
        return 0

    try:
        if not _port_is_available():
            logger.error("A porta %s já está ocupada em %s.", PORT, HOST)
            return 1

        logger.info("Iniciando serviço em http://%s:%s", HOST, PORT)
        config = uvicorn.Config(app, host=HOST, port=PORT, log_config=None)
        server = uvicorn.Server(config)
        server.run()
        if not server.started:
            logger.error("O servidor não conseguiu concluir a inicialização.")
            return 1
        return 0
    except Exception:
        logger.exception("Falha de inicialização do serviço.")
        return 1
    finally:
        ctypes.windll.kernel32.CloseHandle(ctypes.c_void_p(mutex))


def main() -> int:
    if sys.platform != "win32":
        return 1

    # PyInstaller's windowed bootloader sets these streams to None. Some model
    # download and logging dependencies still expect writable streams.
    for name in ("stdout", "stderr"):
        if getattr(sys, name) is None:
            setattr(sys, name, open(os.devnull, "w"))

    background = "--background" in sys.argv
    try:
        from windows_startup import disable_startup, install_and_start

        if "--disable-startup" in sys.argv:
            disable_startup()
            _notify("Inicialização automática desativada. Para encerrar agora, finalize CotrimBotTranscritor no Gerenciador de Tarefas.")
            return 0
        if getattr(sys, "frozen", False) and not background:
            install_and_start(Path(sys.executable))
            _notify("Transcritor configurado para iniciar com o Windows e executar em segundo plano, sem janela.\n\nAguarde o primeiro download do modelo e clique em Verificar conexão no CotrimBot.\n\nVocê pode desativar a inicialização automática em Configurações do Windows > Aplicativos > Inicialização.")
            return 0
        return run_service()
    except Exception:
        log_dir = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "CotrimBot" / "Transcritor" / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        logging.basicConfig(filename=log_dir / "service.log", level=logging.INFO)
        logger.exception("Falha ao iniciar o transcritor.")
        if not background:
            _notify("Não foi possível configurar o transcritor. Se já estiver em execução, finalize CotrimBotTranscritor no Gerenciador de Tarefas e tente novamente. Consulte o log em %LOCALAPPDATA%\\CotrimBot\\Transcritor\\logs.", error=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

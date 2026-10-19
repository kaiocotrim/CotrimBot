import ctypes
import logging
import socket
import sys

import uvicorn

from main import app


HOST = "127.0.0.1"
PORT = 8765
MUTEX_NAME = "Local\\CotrimBotTranscritor"
ERROR_ALREADY_EXISTS = 183
logger = logging.getLogger("cotrimbot.transcription")


def _acquire_instance_mutex():
    kernel32 = ctypes.windll.kernel32
    kernel32.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_wchar_p]
    kernel32.CreateMutexW.restype = ctypes.c_void_p
    kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
    kernel32.CloseHandle.restype = ctypes.c_int
    mutex = kernel32.CreateMutexW(None, False, MUTEX_NAME)
    if not mutex:
        raise OSError(f"CreateMutexW falhou com código {kernel32.GetLastError()}.")
    if kernel32.GetLastError() == ERROR_ALREADY_EXISTS:
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


def main() -> int:
    if sys.platform != "win32":
        print("Este executável local deve ser executado no Windows.", file=sys.stderr)
        return 1

    mutex = _acquire_instance_mutex()
    if mutex is None:
        logger.error("Outra instância do CotrimBotTranscritor já está em execução.")
        print("O CotrimBotTranscritor já está em execução.", file=sys.stderr)
        return 1

    try:
        if not _port_is_available():
            logger.error("A porta %s já está ocupada em %s.", PORT, HOST)
            print(f"A porta {PORT} já está ocupada.", file=sys.stderr)
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
        ctypes.windll.kernel32.CloseHandle(mutex)


if __name__ == "__main__":
    raise SystemExit(main())

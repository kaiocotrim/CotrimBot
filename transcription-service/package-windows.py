"""Publish the complete PyInstaller folder as the website's Windows download."""

import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def main():
    project = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=project / "dist" / "CotrimBotTranscritor")
    source = parser.parse_args().source.resolve()
    if not (source / "CotrimBotTranscritor.exe").is_file():
        raise SystemExit("Executavel ausente. Execute build-windows.bat primeiro.")
    if not (source / "_internal").is_dir():
        raise SystemExit("Pasta _internal ausente. Gere novamente o executavel.")

    destination = project.parent / "frontend" / "public" / "downloads"
    destination.mkdir(parents=True, exist_ok=True)
    archive = destination / "CotrimBotTranscritor.zip"
    temporary = archive.with_suffix(".zip.tmp")
    try:
        with ZipFile(temporary, "w", ZIP_DEFLATED, compresslevel=6) as package:
            for file in sorted(source.rglob("*")):
                if file.is_file():
                    package.write(file, file.relative_to(source.parent))
            package.writestr(
                "CotrimBotTranscritor/LEIA-ME.txt",
                "CotrimBot Transcritor para Windows\n\n"
                "1. Extraia todos os arquivos do ZIP.\n"
                "2. Abra CotrimBotTranscritor.exe uma vez. Nao precisa executar como administrador.\n"
                "3. Aguarde a confirmacao de configuracao e o primeiro download do modelo.\n"
                "4. No CotrimBot, ative a transcricao local e clique em Verificar conexao.\n\n"
                "O programa fica em segundo plano, sem janela, e inicia ao entrar no Windows.\n"
                "A copia instalada fica em %LOCALAPPDATA%\\Programs\\CotrimBotTranscritor.\n"
                "Depois de configurar, voce pode remover esta pasta extraida.\n\n"
                "Desativar inicio automatico: Configuracoes do Windows > Aplicativos > Inicializacao.\n"
                "Encerrar agora: finalize CotrimBotTranscritor no Gerenciador de Tarefas.\n"
                "Atualizar: finalize o programa e abra o executavel do novo ZIP.\n"
                "Logs: %LOCALAPPDATA%\\CotrimBot\\Transcritor\\logs\\service.log\n",
            )
        temporary.replace(archive)
    finally:
        temporary.unlink(missing_ok=True)
    print(f"Download publicado: {archive} ({archive.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()

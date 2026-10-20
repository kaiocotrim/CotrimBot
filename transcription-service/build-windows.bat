@echo off
setlocal EnableExtensions

cd /d "%~dp0"
set "LOG_FILE=%CD%\log-build.txt"
set "VENV_DIR=%CD%\.build-venv"
set "DIST_DIR=%CD%\dist\CotrimBotTranscritor"
set "PYTHON="

call :build > "%LOG_FILE%" 2>&1
set "BUILD_EXIT=%ERRORLEVEL%"

type "%LOG_FILE%"
if not "%BUILD_EXIT%"=="0" (
    echo.
    echo BUILD FALHOU. Consulte "%LOG_FILE%".
    exit /b %BUILD_EXIT%
)

if not exist "%DIST_DIR%\CotrimBotTranscritor.exe" (
    echo.
    echo BUILD FALHOU: o executavel esperado nao foi encontrado.
    echo Consulte "%LOG_FILE%".
    exit /b 1
)

echo.
echo BUILD CONCLUIDO COM SUCESSO.
echo Executavel: "%DIST_DIR%\CotrimBotTranscritor.exe"
exit /b 0

:build
echo === CotrimBotTranscritor build iniciado em %DATE% %TIME% ===
where py
if errorlevel 1 (
    echo ERRO: o Python Launcher "py" nao foi encontrado.
    exit /b 1
)

for /f "delims=" %%P in ('py -3.12 -c "import struct,sys; assert sys.version_info[:2] == (3,12); assert struct.calcsize('P') * 8 == 64; print(sys.executable)"') do set "PYTHON=%%P"
if not defined PYTHON (
    echo ERRO: Python 3.12 de 64 bits nao foi encontrado.
    exit /b 1
)
echo Python selecionado: "%PYTHON%"
"%PYTHON%" --version

if not exist "%VENV_DIR%\Scripts\python.exe" (
    echo Criando ambiente virtual exclusivo: "%VENV_DIR%"
    "%PYTHON%" -m venv "%VENV_DIR%"
    if errorlevel 1 exit /b 1
)
set "VENV_PYTHON=%VENV_DIR%\Scripts\python.exe"

echo Atualizando ferramentas de empacotamento
"%VENV_PYTHON%" -m pip install --upgrade pip
if errorlevel 1 exit /b 1
"%VENV_PYTHON%" -m pip install -r requirements.txt
if errorlevel 1 exit /b 1
"%VENV_PYTHON%" -m pip install pyinstaller==6.11.1
if errorlevel 1 exit /b 1

echo Limpando saidas anteriores
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist

echo Executando PyInstaller
"%VENV_PYTHON%" -m PyInstaller --clean --noconfirm CotrimBotTranscritor.spec
if errorlevel 1 exit /b 1

echo Validando executavel
if not exist "%DIST_DIR%\CotrimBotTranscritor.exe" (
    echo ERRO: PyInstaller terminou sem gerar o executavel esperado.
    exit /b 1
)
echo Executavel validado: "%DIST_DIR%\CotrimBotTranscritor.exe"
echo Gerando ZIP para download no site
"%VENV_PYTHON%" package-windows.py
if errorlevel 1 exit /b 1
exit /b 0

# CotrimBot Desktop

Aplicativo Electron que abre **https://cotrim.infordoc.net/** em uma janela
própria. O servidor, o banco de dados e a Evolution API continuam hospedados.
É necessário acesso à internet. Atualizações publicadas no site aparecem
também no aplicativo, sem recompilar o instalador.

## Plataformas e releases

O workflow `.github/workflows/desktop-release.yml` gera pacotes para:

- Windows: `CotrimBot-Setup-<versão>-x64.exe` (NSIS)
- macOS: `.dmg` e `.zip` para x64 e arm64
- Linux: `.AppImage` e `.deb` para x64

Para publicar uma versão:

1. Altere `version` em `desktop/package.json`.
2. Crie e envie a tag correspondente: `git tag desktop-v<versão>` e `git push origin desktop-v<versão>`.
3. O workflow valida a tag, roda os testes e publica a release direto no GitHub Releases.

O aplicativo instalado verifica atualizações ao iniciar e a cada 4 horas. Quando
encontra uma versão nova, baixa e instala ao fechar. Atualização automática só
funciona em builds empacotadas.

Assinatura é opcional e configurada por secrets do repositório. Sem eles, o build
sai sem assinatura:

- Windows: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`
- macOS: `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`

Sem assinatura, o SmartScreen (Windows) e o Gatekeeper (macOS) exibem alertas.

## Instalar e gerar o executável

Na raiz do repositório, com Node.js >= 22.12 instalado:

```powershell
npm install
npm run desktop:test
npm run desktop:build
```

O build gera:

```text
desktop/dist/CotrimBot-Setup-1.0.0-x64.exe   # instalador Windows de 64 bits
desktop/dist/win-unpacked/CotrimBot.exe    # aplicativo sem instalador
```

Distribua o instalador `.exe`. Para executar a versão sem instalador, mantenha
toda a pasta `win-unpacked`, incluindo seus arquivos auxiliares. O instalador
é por usuário, permite escolher a pasta e cria atalhos no desktop e no menu
Iniciar. Não exige instalar Node.js no computador do atendente.

O executável não tem assinatura digital. Para distribuir com uma identidade
verificada pelo Windows, configure um certificado de assinatura no
electron-builder durante o build. O instalador não é publicado automaticamente.

## Desenvolvimento e testes

```powershell
npm run desktop:start
npm run test:smoke --workspace=@cotrimbot/desktop
```

Para testar um frontend local, a variável abaixo funciona somente em
desenvolvimento, nunca no executável empacotado:

```powershell
$env:COTRIMBOT_DESKTOP_URL = "http://localhost:3000"
npm run desktop:start
```

Para testar também a abertura do site pelo executável gerado:

```powershell
$env:COTRIMBOT_SMOKE_EXECUTABLE = (Resolve-Path "desktop/dist/win-unpacked/CotrimBot.exe").Path
npm run test:smoke --workspace=@cotrimbot/desktop
```

Para trocar o servidor de produção, edite `desktop/config.json` e gere outro
instalador. Use HTTPS. O pacote inclui somente o cliente Electron e o ícone;
não inclui `.env`, código do backend ou chaves do servidor.

## Comportamento

- Login, cookies e preferências ficam no perfil próprio do aplicativo.
- Uma segunda abertura traz a janela existente para frente.
- Enter, Ctrl + Enter e Shift + Enter seguem as preferências já disponíveis no chat.
- A janela usa isolamento de contexto e sandbox, sem acesso do site ao Node.js.
- Links externos abrem no navegador padrão. O acesso externo é limitado a HTTP,
  HTTPS e e-mail; links para arquivos locais e programas são bloqueados.
- Notificações e microfone exigem confirmação e só podem ser solicitados pelo
  servidor configurado. As permissões são mantidas durante a sessão.
- O menu fica oculto e pode ser acessado com Alt; inclui copiar, colar, zoom e recarregar.
- Fechar a janela encerra o aplicativo. Notificações são recebidas enquanto ele
  está aberto ou minimizado; não há processo em segundo plano depois de fechar.
- Use o login por e-mail e senha. Login social em navegador externo ainda exige
  implementar um fluxo de retorno ao aplicativo; não está integrado nesta versão.
- O aplicativo carrega a versão publicada. Alterações locais do frontend precisam
  ser publicadas no servidor para aparecer no executável de produção.

# CotrimBot Desktop

Aplicativo Electron que abre o servidor informado pelo usuário em uma janela
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
desktop/dist/CotrimBot-Setup-1.1.0-x64.exe   # instalador Windows de 64 bits
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

Para alterar somente o servidor padrão, edite `desktop/config.json` e gere outro
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
- Na primeira execução do pacote `.deb` ou `.AppImage`, sem URL salva, o aplicativo pede a
  URL HTTPS do servidor. Cancelar encerra o aplicativo. A escolha fica em `server-url.json` no
  perfil do usuário (`~/.config/CotrimBot` no Linux).
- O menu Aplicativo tem **Alterar servidor** no pacote instalado. A nova URL vale após reiniciar.
  No Windows, a URL salva no aplicativo tem prioridade sobre a do instalador.
- Fechar a janela encerra o aplicativo. Notificações são recebidas enquanto ele
  está aberto ou minimizado; não há processo em segundo plano depois de fechar.
- Use o login por e-mail e senha. Login social em navegador externo ainda exige
  implementar um fluxo de retorno ao aplicativo; não está integrado nesta versão.
- O aplicativo carrega a versão publicada. Alterações locais do frontend precisam
  ser publicadas no servidor para aparecer no executável de produção.

## Download com servidor personalizado (1.1.0)

No navegador de computador, **Baixar para Windows (.exe)** abre um formulário.
O usuário informa a origem HTTPS do servidor, por exemplo
`https://chat.cotrimdev.com.br`. Não são aceitos caminhos como `/login`, credenciais,
query ou fragmentos. O limite de origem é 110 caracteres.
No Electron e em celulares/tablets o botão não aparece; janelas abaixo de 900px
igualmente o ocultam, sem reservar espaço extra para o botão.

O formulário chama `HEAD /api/desktop/download?server=...` para verificar a
validade/disponibilidade e depois inicia o GET que baixa o instalador. Essa rota
é pública para permitir download antes do login e não acessa o endereço informado.
O conteúdo é sempre o mesmo instalador local; a URL é transportada em hexadecimal
no nome do arquivo, preservando os bytes e uma eventual assinatura do EXE.
Não renomeie o arquivo antes da instalação. Sufixos de download repetido como
` (1)` são aceitos. Se o nome for alterado, o instalador permite informar o servidor
na página de conferência antes de instalar.

O instalador salva a escolha em `resources/server-url.txt` e a registra por usuário
para futuras reinstalações. O aplicativo valida a URL ao carregar. Se não houver
URL salva, ele pede a URL ao abrir (ver Comportamento). Não se cria outra conexão
WhatsApp nem se move o banco de dados para o computador do atendente.

### Disponibilizar o instalador no servidor web

1. Gere `desktop/dist/CotrimBot-Setup-1.1.0-x64.exe` no Windows.
2. Transfira o arquivo para o servidor/container que executa o backend.
3. Configure `COTRIMBOT_DESKTOP_INSTALLER_PATH` com o caminho absoluto do arquivo
   naquele ambiente (por exemplo `/app/downloads/CotrimBot-Setup-1.1.0-x64.exe`).
   Use volume persistente se necessário. `desktop/dist` é ignorado no Git e no Docker.
4. Publique o frontend e o backend atualizados e reinicie o backend com a variável.
5. Abra o site no navegador de computador, informe o servidor e baixe o instalador.

Em desenvolvimento, a rota usa por padrão o arquivo gerado em `desktop/dist`.
Sem o instalador disponível, responde 503 e o formulário informa a indisponibilidade.
O link antigo do MediaFire não é usado: a versão antiga não lê a escolha do usuário.
Os EXEs já instalados precisam ser atualizados para permitir servidor personalizado.
A ocultação do botão também exige publicar o frontend atualizado.

### Testes adicionais

```powershell
npm.cmd run test:desktop --workspace=@cotrimbot/backend
npm.cmd run desktop:test
npm.cmd exec --workspace=@cotrimbot/frontend -- playwright test --config=playwright.config.ts desktop-download.spec.ts
```

O teste NSIS compila um executável mínimo e confere a decodificação de três
servidores, inclusive com porta e sufixo de download repetido, sem instalar o app
nem criar atalhos/entradas de desinstalação. Ele é pulado quando não há Windows
ou compilador NSIS no cache local do electron-builder.

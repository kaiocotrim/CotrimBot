# CotrimBot

Plataforma de atendimento multi-conversa para WhatsApp. Integra com a
[Evolution API](https://github.com/EvolutionAPI/evolution-api) para enviar e
receber mensagens, oferece transcrição automática de áudios e reformulação de
texto por IA, com um chat em tempo real construído em Next.js + Socket.IO.

## Arquitetura

```mermaid
flowchart LR
    subgraph Cliente
        FE[Frontend - Next.js]
    end

    subgraph CotrimBot
        BE[Backend - Express + Socket.IO]
        DB[(MySQL - Prisma)]
    end

    subgraph WhatsApp
        EVO[Evolution API]
        PG[(Postgres)]
        REDIS[(Redis)]
    end

    TRANS[transcription-service - FastAPI + faster-whisper]
    GEMINI[Gemini API]

    FE <-- HTTP + WebSocket --> BE
    BE <--> DB
    BE <-- webhook / REST --> EVO
    EVO <--> PG
    EVO <--> REDIS
    BE -- áudio recebido --> TRANS
    BE -- reformular texto --> GEMINI
```

## Estrutura do repositório

```
backend/                 # API Express + Socket.IO + Prisma (MySQL)
frontend/                # Chat web em Next.js
transcription-service/   # Microserviço Python (FastAPI + faster-whisper)
docker-compose.yml        # Orquestra app, MySQL, Postgres, Redis, Evolution API e transcription-service
Dockerfile                 # Build da imagem única do frontend + backend
```

## Principais tecnologias

| Parte | Tecnologias |
| --- | --- |
| Frontend | Next.js 16, React 19, Tailwind CSS 4, Socket.IO Client |
| Backend | Express 5, Socket.IO, Prisma 7, MySQL |
| Transcrição | Python 3.11 (Docker) / Python 3.12 (Windows), FastAPI, faster-whisper, ffmpeg |
| Infraestrutura | Docker Compose, Evolution API, Postgres, Redis |
| IA | Gemini API (reformulação de texto) |

## Funcionalidades

- Chat em tempo real (texto, imagem, figurinha, vídeo, áudio e documento) via Socket.IO.
- Envio e recebimento de mensagens do WhatsApp através da Evolution API.
- Reações a mensagens e avatares de contatos/grupos em cache.
- Arquivamento de contatos e grupos.
- Transcrição automática de áudios recebidos (microserviço Python com faster-whisper).
- Reformulação de texto com IA (Gemini) antes de enviar uma mensagem.
- Encerrar uma conversa devolvendo o atendimento ao bot.
- PWA instalável (celular e desktop) com notificações push, que chegam mesmo com o app fechado.

## Pré-requisitos

- Node.js >= 22 e npm
- Docker e Docker Compose (para rodar o ambiente completo)
- Python 3.11 (apenas para rodar o `transcription-service` diretamente em desenvolvimento)

## Variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto com as variáveis abaixo (os valores
reais — senhas, chaves de API — não devem ser commitados nem compartilhados).

| Variável | Descrição |
| --- | --- |
| `APP_PORT` / `PORT` | Porta do backend (e do app publicado no Docker). |
| `NEXT_PUBLIC_API_URL` | URL pública da API usada pelo frontend. |
| `DATABASE_URL` | Connection string do MySQL usada pelo Prisma. |
| `DATABASE_HOST` | Host do MySQL. |
| `DATABASE_PORT` | Porta do MySQL. |
| `DATABASE_USER` | Usuário do MySQL. |
| `DATABASE_PASSWORD` | Senha do MySQL. |
| `DATABASE_NAME` | Nome do banco MySQL. |
| `EVOLUTION_API_URL` | URL base da Evolution API. |
| `EVOLUTION_API_KEY` | Chave de autenticação da Evolution API. |
| `EVOLUTION_INSTANCE` | Nome da instância do WhatsApp na Evolution API. |
| `GEMINI_API_KEY` | Chave da API do Gemini usada para reformular texto. |
| `TRANSCRIPTION_SERVICE_URL` | URL do microserviço de transcrição. |
| `VAPID_PUBLIC_KEY` | Chave pública VAPID das notificações push (ver abaixo). |
| `VAPID_PRIVATE_KEY` | Chave privada VAPID das notificações push. Não compartilhe. |
| `VAPID_SUBJECT` | Contato do responsável pelo servidor de push, ex.: `mailto:suporte@exemplo.com`. |

Variáveis adicionais usadas apenas pelo `docker-compose.yml` (bancos internos
da Evolution API e portas expostas):

| Variável | Descrição |
| --- | --- |
| `MYSQL_ROOT_PASSWORD` | Senha root do container MySQL. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Credenciais do Postgres interno da Evolution API. |
| `POSTGRES_PORT` | Porta publicada do Postgres. |
| `REDIS_PORT` | Porta publicada do Redis. |
| `EVOLUTION_PORT` | Porta publicada da Evolution API. |

## PWA e notificações push

O frontend é um PWA instalável: `frontend/public/manifest.json` define nome,
ícones (`frontend/public/icons/`) e cores, e `frontend/public/sw.js` é o
service worker que faz um cache básico para uso offline e recebe as
notificações push. O service worker só é registrado no build de produção
(`npm run build`), para não interferir no recarregamento do `next dev`.

As notificações push complementam as notificações in-app (Socket.IO): sempre
que uma conversa é atribuída ao usuário ou uma conversa dele recebe mensagem,
o backend também envia um push (Web Push/VAPID) para cada dispositivo inscrito.
Cada usuário ativa o push em **Configurações → Notificações → Ativar
notificações push**. O navegador exige HTTPS (ou `localhost`) para isso.

Para gerar as chaves VAPID (uma única vez por ambiente):

```powershell
npm run push:generate-vapid-keys --workspace=@cotrimbot/backend
```

Copie as três linhas exibidas (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e
`VAPID_SUBJECT`, ajustando o e-mail) para o `.env` da raiz e reinicie o
backend. Sem essas variáveis o push fica desativado e o restante das
notificações continua funcionando. Trocar as chaves invalida as assinaturas
existentes: os usuários precisam ativar o push novamente.

## Rodando em desenvolvimento (sem Docker)

```powershell
npm install
npm run prisma:generate
npm run dev
```

`npm run dev` usa o Turborepo para subir o frontend (`http://localhost:3000`) e
o backend (`http://localhost:3333`) juntos. O MySQL e a Evolution API precisam
estar acessíveis (localmente ou via Docker) e configurados no `.env`.

O `transcription-service` roda à parte:

```powershell
cd transcription-service
pip install -r requirements.txt
uvicorn main:app --reload --port 5000
```

Para gerar o executável Windows (requer Python 3.12 de 64 bits instalado
somente na máquina de build), execute `build-windows.bat` dentro de
`transcription-service`. O script cria um ambiente virtual exclusivo, registra
toda a saída em `log-build.txt` e gera:

```text
transcription-service/dist/CotrimBotTranscritor/
  CotrimBotTranscritor.exe
  _internal/
```

O build também gera `frontend/public/downloads/CotrimBotTranscritor.zip`.
O botão **Baixar para Windows (.zip)** em **Configurações → Transcrição local**
abre o [download no MediaFire](https://www.mediafire.com/file/qq78n7yjcbg3tl8/CotrimBotTranscritor.zip/file)
em uma nova aba. O ZIP inclui o executável e toda a pasta `_internal`.
Para empacotar um executável já gerado, execute
`py -3.12 transcription-service/package-windows.py` na raiz do projeto.
O ZIP é um artefato gerado e não é versionado. Para publicar uma nova versão,
envie o ZIP atualizado ao MediaFire e atualize o link do botão se necessário.

Na máquina do usuário final, baixe e extraia o ZIP inteiro e execute
`CotrimBotTranscritor.exe` uma vez dentro da pasta extraída. Ele copia o
pacote para `%LOCALAPPDATA%\Programs\CotrimBotTranscritor`, registra a
inicialização automática apenas para o usuário atual e inicia em segundo
plano, sem console e sem exigir administrador. A pasta extraída pode ser
removida depois da configuração. O Windows inicia o transcritor ao entrar
na conta; não é necessário deixar uma janela aberta.

Para desativar, use **Configurações do Windows → Aplicativos → Inicialização
→ CotrimBotTranscritor** ou execute o programa com `--disable-startup`.
Para encerrá-lo imediatamente, finalize **CotrimBotTranscritor** no
Gerenciador de Tarefas. Para atualizar o pacote, encerre a versão atual e
abra o executável do novo ZIP. O argumento interno `--background` executa
somente o serviço, sem instalar nem modificar a inicialização automática.
O serviço
escuta apenas em `http://127.0.0.1:8765`. Na primeira execução, o modelo
configurado (`base`) pode ser baixado; ele fica persistido em
`%LOCALAPPDATA%\CotrimBot\Transcritor\models` e os logs ficam em
`%LOCALAPPDATA%\CotrimBot\Transcritor\logs`.

Em **Configurações → Transcrição local**, marque **Usar transcrição local
neste navegador** e clique em **Verificar conexão**. A preferência é salva
neste navegador e direciona os áudios (incluindo os do chat interno) e as
configurações do modelo para o serviço do computador. Permita o acesso à
rede local quando o navegador solicitar. O link **Abrir status do serviço**
consulta o serviço; para iniciá-lo, abra o executável no Windows.

O status retorna `loading` durante o carregamento do modelo, `ok` quando
está pronto e `error` se o carregamento falhar. Para acessar a partir de
outro endereço do frontend, defina `TRANSCRIPTION_ALLOWED_ORIGINS` no
ambiente do executável com as origens permitidas separadas por vírgula.
Por padrão, são aceitos `http://localhost:3000`, `http://127.0.0.1:3000`
e `http://127.0.0.1:3100`.

Teste do fluxo no navegador: `cd frontend` e
`node --test tests/local-transcription.test.mjs`.

## Rodando com Docker Compose (ambiente completo)

```powershell
docker compose up --build
```

Sobe todos os serviços: `cotrimbot` (frontend + backend), `mysql`, `postgres`
e `redis` (usados pela Evolution API), `evolution-api` e `transcription`. As
URLs internas entre os serviços já são configuradas pelo próprio
`docker-compose.yml` (por exemplo, `EVOLUTION_API_URL` e
`TRANSCRIPTION_SERVICE_URL` apontam para os nomes dos containers).

## Banco de dados

O schema fica em [backend/prisma/schema.prisma](backend/prisma/schema.prisma),
com os modelos `Contact` e `Message`. Para aplicar migrações em desenvolvimento:

```powershell
npm run prisma:migrate
```

## Rotas da API

Todas as rotas abaixo são servidas pelo backend sob o prefixo `/api`.

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/contacts` | Lista contatos. |
| GET | `/contacts/:id` | Busca um contato. |
| GET | `/contacts/:id/avatar` | Avatar em cache do contato. |
| POST | `/contacts` | Cria um contato. |
| PATCH | `/contacts/:id` | Atualiza um contato. |
| PATCH | `/contacts/:id/archived` | Arquiva/desarquiva um contato. |
| DELETE | `/contacts/:id` | Remove um contato. |
| GET | `/contacts/:id/messages` | Lista mensagens de um contato. |
| POST | `/contacts/:id/send` | Envia uma mensagem de texto. |
| POST | `/contacts/:id/send-media` | Envia um arquivo de mídia. |
| POST | `/contacts/:id/close-with-bot` | Encerra a conversa devolvendo ao bot. |
| PATCH | `/contacts/:id/messages/read` | Marca mensagens como lidas. |
| GET | `/messages/:id/media` | Baixa a mídia de uma mensagem. |
| GET | `/messages/:id/sender-avatar` | Avatar de quem enviou em um grupo. |
| PUT | `/messages/:id/reaction` | Reage a uma mensagem. |
| POST | `/messages/:id/transcribe` | Transcreve o áudio de uma mensagem. |
| GET | `/transcription/settings` | Consulta as configurações do Whisper. |
| PUT | `/transcription/settings` | Atualiza as configurações do Whisper. |
| POST | `/ai/rewrite` | Reformula um texto com o Gemini. |
| GET | `/push/public-key` | Chave pública VAPID para assinar o push. |
| POST | `/push/subscribe` | Salva a assinatura push do navegador (`{ endpoint, keys: { p256dh, auth } }`). |
| POST | `/push/unsubscribe` | Remove a assinatura push do navegador (`{ endpoint }`). |
| POST | `/webhook/whatsapp` | Webhook de eventos da Evolution API. |

O Socket.IO roda na mesma porta do backend, com CORS liberado para o frontend.

## Documentação por pacote

- [backend/README.md](backend/README.md) — estrutura e comandos do backend.
- [frontend/AGENTS.md](frontend/AGENTS.md) e [frontend/CLAUDE.md](frontend/CLAUDE.md) — convenções do frontend.

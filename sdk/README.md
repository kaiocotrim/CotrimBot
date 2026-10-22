# SDK TypeScript do CotrimBot

O `@cotrimbot/sdk` é um cliente TypeScript para aplicações que precisam integrar
com a API HTTP do backend CotrimBot. Ele fornece métodos agrupados por domínio,
tipos para os principais modelos e payloads, tratamento uniforme de erros e
suporte a cookies, uploads multipart e downloads de mídia.

## Instalação e requisitos

O SDK requer Node.js 22 ou superior, ou um navegador moderno com suporte a
`fetch`, `FormData` e `Blob`.

```sh
npm install @cotrimbot/sdk
```

No monorepo, também é possível instalá-lo como workspace:

```sh
npm install
npm run build --workspace=@cotrimbot/sdk
npm test --workspace=@cotrimbot/sdk
```

## Configuração

`baseUrl` deve apontar para a origem do backend; o SDK acrescenta `/api`
automaticamente. Uma URL já terminada em `/api` também é aceita.

```ts
import { CotrimBotClient } from "@cotrimbot/sdk";

const client = new CotrimBotClient({
  baseUrl: "http://localhost:3333",
  credentials: "include",
});
```

Para integrações backend-to-backend, crie um token na aplicação enquanto estiver
autenticado por sessão e use-o no SDK:

```ts
const criado = await client.apiTokens.create("Integração ERP");
// Armazene criado.token em um secret manager; ele só é exibido nesta resposta.

const integração = new CotrimBotClient({
  baseUrl: "https://backend.exemplo.com",
  token: process.env.COTRIMBOT_API_TOKEN,
});
await integração.contacts.list();
```

Tokens não expiram automaticamente e são vinculados ao usuário Better Auth que
os criou. A aplicação armazena apenas o hash, exibe o segredo uma única vez e
permite listar/revogar tokens em `client.apiTokens`. A criação, listagem e
revogação exigem a sessão por cookie; não é possível usar um token para criar ou
gerenciar outros tokens. Trate tokens como senhas, armazene-os em um secret
manager e revogue-os quando não forem mais necessários. O SDK usa
`credentials: "omit"` por padrão quando `token` é informado; é possível
sobrescrever em `credentials`. A rotação de `BETTER_AUTH_SECRET` invalida os
tokens existentes.

As opções são:

- `baseUrl` (obrigatória): origem do backend.
- `token`: token de API do usuário; enviado no cabeçalho `Authorization` com o
  esquema Bearer.
- `credentials`: encaminha credenciais de `fetch`. O padrão é `"include"` para
  sessões por cookie e `"omit"` ao configurar `token`.
- `headers`: cabeçalhos enviados em todas as chamadas, por exemplo um
  identificador próprio do seu gateway.
- `fetch`: implementação alternativa de `fetch`, útil para testes ou ambientes
  com transporte customizado.

O backend autentica a maioria das rotas por sessão em cookie Better Auth. O SDK
inclui `client.auth.signInEmail`, `client.auth.signOut`, `client.auth.getSession`
e `client.auth.setActiveOrganization`. O cadastro comum está desativado; contas
são criadas por convite. Convites podem ser consultados e aceitos sem sessão em
`client.invitations`. O método `setActiveOrganization` atualiza a organização
ativa da sessão, usada por rotas de bots e outras operações que dependem do
contexto da empresa. As rotas de organizações também recebem o ID explicitamente.
O token fornece autenticação para servidores sem depender de cookies; em
navegadores, as chamadas externas ainda precisam ser permitidas pela política
CORS do backend.

## Exemplos

### Listar contatos e mensagens

```ts
const { contacts } = await client.contacts.list();
const { messages } = await client.messages.list(contacts[0].id, {
  limit: 30,
});
```

`before` é o ID de uma mensagem para paginação por cursor, não um deslocamento.

### Enviar texto e mídia

```ts
await client.messages.sendText(contacts[0].id, { text: "Olá!" });

const arquivo = new File([conteudo], "documento.pdf", {
  type: "application/pdf",
});
await client.messages.sendMedia(contacts[0].id, {
  file: arquivo,
  fileName: arquivo.name,
  caption: "Documento solicitado",
});
```

Para executar em Node, o arquivo pode ser um `Blob` com `fileName` definido.
O SDK cria `FormData` e deixa o navegador/Node definir o boundary multipart.
**Limitação atual:** `POST /contacts/:id/send-media` recebe e valida o arquivo,
mas o backend ainda não o encaminha ao WhatsApp (consulte
[`backend/README.md`](../backend/README.md)).

### Reformular texto com IA e transcrever áudio

```ts
const revisado = await client.ai.rewrite("texto para melhorar");
const resultado = await client.messages.transcribe(123);
console.log(revisado.text, resultado.transcription);
```

A reformulação depende da configuração de IA no backend. A transcrição usa o
serviço de transcrição configurado pelo servidor.

### Criar um agendamento

```ts
const agendamento = await client.scheduledMessages.create({
  phone: "5511999999999",
  content: "Lembrete de atendimento",
  scheduledAt: "2026-12-01T14:00:00.000Z",
});
```

### Gerenciar bots

```ts
const { bots } = await client.bots.list();
const novoBot = await client.bots.create({
  name: "Boas-vindas",
  draft: fluxoDoBot,
});
await client.bots.update(novoBot.id, {
  name: novoBot.name,
  draft: fluxoAtualizado,
  revision: novoBot.revision,
});
await client.bots.publish(novoBot.id, novoBot.revision + 1);
```

As rotas de gerenciamento de bots exigem uma sessão e papel `owner` ou `admin`
na empresa ativa. A ativação também depende da configuração da Evolution e do
segredo do webhook no backend.

## Tratamento de erros

Respostas HTTP fora da faixa de sucesso lançam `CotrimBotApiError`. A exceção
expõe o status HTTP em `status`, o corpo decodificado em `body` e escolhe a
mensagem a partir de `{ error }`, `{ message }` ou de um texto padrão.
Respostas `204 No Content` retornam `undefined`.

```ts
import { CotrimBotApiError } from "@cotrimbot/sdk";

try {
  await client.contacts.get(999);
} catch (error) {
  if (error instanceof CotrimBotApiError) {
    console.error(error.status, error.message, error.body);
  }
}
```

Downloads retornam `Blob`. Uploads usam multipart com o campo `file`; no envio
de mídia para contatos há ainda o campo opcional `caption`. Para mídia de chat
interno, `client.internalConversations.media` aceita `download` e cabeçalho
`Range`.

## Referência de métodos

Todas as rotas abaixo são relativas a `/api`. A menos que indicado como pública,
as rotas exigem sessão válida. O backend também expõe Socket.IO na mesma origem
do backend para integrações realtime; esse transporte não faz parte deste SDK.

| Namespace | Método | Rota HTTP |
| --- | --- | --- |
| `auth` | `signInEmail`, `signOut`, `getSession`, `setActiveOrganization` | Better Auth: `/auth/sign-in/email`, `/auth/sign-out`, `/auth/get-session`, `/auth/organization/set-active` |
| `contacts` | `list`, `search`, `assignees`, `get`, `avatar`, `groupParticipants` | `GET /contacts`, `/contacts/search`, `/contacts/assignees`, `/contacts/:id`, `/contacts/:id/avatar`, `/contacts/:id/group-participants` |
| `contacts` | `create`, `startConversation`, `subscribePresence` | `POST /contacts`, `/contacts/conversation`, `/contacts/:id/presence-subscription` |
| `contacts` | `update`, `setSaved`, `setArchived`, `setPinned`, `setAssignment`, `setPriority` | `PATCH /contacts/:id`, `/contacts/:id/saved`, `/contacts/:id/archived`, `/contacts/:id/pinned`, `/contacts/:id/assignment`, `/contacts/:id/priority` |
| `contacts` | `delete` | `DELETE /contacts/:id` |
| `messages` | `mediaLibrary`, `list`, `favorites` | `GET /media-library`, `/contacts/:id/messages`, `/contacts/:id/messages/favorites` |
| `messages` | `sendText`, `sendPoll`, `closeWithBot`, `sendMedia` | `POST /contacts/:id/send`, `/contacts/:id/send-poll`, `/contacts/:id/close-with-bot`, `/contacts/:id/send-media` |
| `messages` | `poll`, `pollVoterAvatar`, `voteOnPoll` | `GET /messages/:id/poll`, `GET /messages/:id/poll/voter-avatar`, `PUT /messages/:id/poll/vote` |
| `messages` | `markRead`, `media`, `senderAvatar`, `info` | `PATCH /contacts/:id/messages/read`, `GET /messages/:id/media`, `/messages/:id/sender-avatar`, `/messages/:id/info` |
| `messages` | `react`, `updateFlags`, `delete`, `transcribe` | `PUT /messages/:id/reaction`, `PATCH /messages/:id/flags`, `DELETE /messages/:id`, `POST /messages/:id/transcribe` |
| `ai` | `translate`, `rewrite` | `POST /ai/translate`, `/ai/rewrite` |
| `transcription` | `getSettings`, `updateSettings` | `GET /transcription/settings`, `PUT /transcription/settings` |
| `notifications` | `list`, `markAllRead`, `markContactRead`, `markRead`, `clear` | `GET /notifications`, `PATCH /notifications/read-all`, `/notifications/contact/:contactId/read`, `/notifications/:id/read`, `DELETE /notifications` |
| `push` | `publicKey`, `subscribe`, `unsubscribe` | `GET /push/public-key`, `POST /push/subscribe`, `/push/unsubscribe` |
| `evolution` | `connection`, `qrcode`, `disconnect`, `callSettings`, `updateCallSettings` | `GET /evolution/connection`, `/evolution/qrcode`, `/evolution/call-settings`, `DELETE /evolution/connection`, `PUT /evolution/call-settings` |
| `bots` | `list`, `create`, `update`, `publish`, `setActivation`, `simulate` | `GET /bots`, `POST /bots`, `PUT /bots/:id`, `POST /bots/:id/publish`, `/bots/:id/activation`, `/bots/simulate` |
| `bots` | `uploadImage`, `image` | `POST /bots/images` (multipart), `GET /bots/images/:imageId` (Blob) |
| `organizations` | `workspace`, `internalMessages`, `sendInternalMessage`, `updateProfile` | `GET /organizations/:organizationId/workspace`, `GET|POST /organizations/:organizationId/internal-messages`, `PATCH /organizations/:organizationId/profile` |
| `organizations` | `createGroup`, `updateGroup`, `deleteGroup` | `POST /organizations/:organizationId/groups`, `PUT|DELETE /organizations/:organizationId/groups/:groupId` |
| `organizations` | `updateMemberProfile`, `updateInvitationProfile` | `PATCH /organizations/:organizationId/members/:memberId/profile`, `/organizations/:organizationId/invitations/:invitationId/profile` |
| `internalConversations` | `bootstrap`, `members`, `list`, `create`, `get` | `GET|POST /organizations/:organizationId/internal-conversations[/bootstrap|/members|/:conversationId]` |
| `internalConversations` | `updatePreferences`, `updateAvatar` | `PATCH /organizations/:organizationId/internal-conversations/:conversationId/preferences`, `/avatar` |
| `internalConversations` | `messages`, `sendMessage`, `sendMedia`, `sendImage` | `GET|POST /organizations/:organizationId/internal-conversations/:conversationId/messages`, `POST .../:conversationId/media`, `POST .../:conversationId/images` |
| `internalConversations` | `media`, `transcribe` | `GET .../:conversationId/messages/:messageId/media`, `POST .../:conversationId/messages/:messageId/transcribe` |
| `internalConversations` | `markRead`, `addReaction`, `removeReaction`, `updateMessageFlags`, `deleteMessage` | `PATCH .../:conversationId/read`, `POST|DELETE .../:conversationId/messages/:messageId/reactions`, `PATCH|DELETE .../:conversationId/messages/:messageId[/flags]` |
| `internalConversations` | `participants`, `addParticipants` | `GET|POST .../:conversationId/participants` |
| `invitations` | `get`, `accept` | `GET /invitations/:id`, `POST /invitations/:id/accept` (públicas) |
| `calendarEvents` | `list`, `create`, `setCompleted`, `delete` | `GET|POST /calendar-events`, `PATCH /calendar-events/:id/completed`, `DELETE /calendar-events/:id` |
| `scheduledMessages` | `list`, `create`, `delete` | `GET|POST /scheduled-messages`, `DELETE /scheduled-messages/:id` |
| `clients` | `list`, `create`, `update`, `delete` | `GET|POST /clients`, `PUT|DELETE /clients/:id` |
| `apiTokens` | `list`, `create`, `revoke` | `GET|POST /tokens`, `DELETE /tokens/:id` (gerenciamento exige sessão Better Auth) |

As rotas da Evolution que gerenciam conexão/QR Code e as rotas de bots exigem
perfil administrativo conforme as regras do backend. As rotas de organização,
mensagens internas e clientes também verificam associação/permissões da empresa.
O webhook `POST /webhook/whatsapp` é interno à Evolution e não é incluído no SDK.

## Build e testes

```sh
npm run build --workspace=@cotrimbot/sdk
npm test --workspace=@cotrimbot/sdk
```

O build gera JavaScript ESM e declarações TypeScript em `dist/`.

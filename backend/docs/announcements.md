# Notícias por empresa

## Uso no painel

1. Abra **Configurações → Notícias** (ícone de megafone).
2. Selecione uma empresa cadastrada na aba **Cliente** e escreva o texto.
3. Clique em **Revisar destinatários**. Confira a mensagem, os nomes e os números.
4. Clique em **Enviar para N contato(s)** para colocar o comunicado na fila.
5. Acompanhe **Seus últimos comunicados**. Expanda um item para conferir cada destinatário e eventual erro. O painel atualiza a cada sete segundos e tem atualização manual.

Cada pessoa recebe uma mensagem individual pelo WhatsApp conectado à Evolution API do CotrimBot. A primeira versão aceita somente texto (até 5.000 caracteres) e até 1.000 destinatários por comunicado. Os últimos 30 comunicados do usuário, na organização ativa, aparecem no histórico.

## Quem recebe

Na revisão, todos os contatos elegíveis começam selecionados. Desmarque quem não deve receber este comunicado; é possível reincluir contatos ou selecionar/desmarcar todos. A contagem e o botão de envio acompanham a seleção, e o envio é bloqueado quando ela fica vazia. Isso não altera o cadastro nem bloqueia o contato para outros comunicados.

A confirmação pode incluir `recipientIds` (IDs únicos dos contatos marcados). O servidor valida a prévia completa e aceita somente IDs elegíveis dessa lista; apenas os selecionados entram na fila. Reutilizar uma `requestKey` com uma seleção diferente retorna conflito, sem criar outro envio. Requisições legadas sem `recipientIds` continuam incluindo todos os contatos da prévia.

O cadastro atual associa o contato pelo campo `Contact.companyName`, selecionado nas informações do contato. A comparação ignora maiúsculas/minúsculas e espaços nas extremidades. Grupos, contatos bloqueados, números sem código de país ou inválidos e números duplicados não entram na fila. Empresas com nomes iguais impedem o envio, pois o vínculo antigo por nome não permite distinguir seus contatos com segurança.

Antes de transmitir cada mensagem, o worker confere novamente o contato, o telefone, a empresa e o acesso do autor. Se o contato for bloqueado, mudar de empresa ou perder o vínculo, aquela mensagem falha com a razão registrada.

## Como o código funciona

- `src/routes/announcement.routes.ts`: autenticação, acesso às empresas, prévia, confirmação e histórico. `POST /api/announcements/preview` não grava nem envia. `POST /api/announcements` confirma; `GET /api/announcements` lista o histórico do autor na organização ativa.
- `src/services/announcement-policy.ts`: seleção dos destinatários e hash da prévia. Se o texto ou os destinatários mudarem, a confirmação é recusada até uma nova revisão.
- `Announcement`: guarda autor, empresa, texto e chave da confirmação. A combinação única de autor e `requestKey` evita duplicar uma fila quando a mesma requisição é repetida.
- `ScheduledMessage`: guarda um registro por destinatário, ligado ao comunicado. A criação aninhada do Prisma grava comunicado e fila numa única transação. Esses registros ficam fora do calendário de mensagens programadas.
- `src/services/scheduled-message.service.ts`: aproveita o worker existente. Reclama cada registro atomicamente antes do envio, usa a Evolution e salva a mensagem na conversa com atribuição ao autor. Há três segundos de intervalo entre envios de comunicados dentro do worker. A fila persiste em reinícios.
- `frontend/components/chat/announcement-settings.tsx`: formulário, revisão, confirmação e acompanhamento no painel de Configurações.

Estados: `PENDING` (na fila), `PROCESSING` (enviando), `SENT` (API confirmou o ID), `FAILED` (falhou ou foi interrompido). **SENT não confirma leitura ou entrega ao aparelho.** Não há repetição automática de falhas: quando uma chamada expira, o provedor pode ter recebido a mensagem. Confira a conversa antes de criar outro comunicado. Envios em processamento há mais de 30 minutos são encerrados com falha para revisão manual.

## Banco e testes

Migração aditiva: `20261023190000_add_announcements`. O fluxo de implantação existente executa `prisma migrate deploy` no início do backend.

Na raiz do projeto:

```sh
npm run test:announcements --workspace=@cotrimbot/backend
npm exec --workspace=@cotrimbot/frontend -- playwright test --config=playwright.config.ts announcements.spec.ts
```

No PowerShell, use `npm.cmd` se a política local bloquear `npm.ps1`.

Os testes da API usam banco simulado; o teste do worker injeta um transporte que nunca envia. Os testes de navegador interceptam todas as APIs. O teste opcional de MySQL exige `RUN_ANNOUNCEMENT_DB_TESTS=1`, grava dentro de uma transação revertida ao final e programa a mensagem para 2099, sem chamar o WhatsApp.

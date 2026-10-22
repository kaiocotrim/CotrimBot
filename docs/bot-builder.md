# Central de Bots

Implementação administrativa em `/dashboard/bots/`, acessível em **Configurações → Central de Bots**, abaixo de Empresa. Usa Express, Prisma/MySQL, Better Auth, Lucide e o envio Evolution existente. Não usa IA generativa.

## Instalação

Na raiz do repositório (PowerShell: use `npm.cmd`):

```sh
npm run prisma:generate --workspace=@cotrimbot/backend
npm run prisma:deploy --workspace=@cotrimbot/backend
npm run build --workspace=@cotrimbot/backend
npm run build --workspace=@cotrimbot/frontend
```

A migration `backend/prisma/migrations/20261021120000_add_bot_builder/migration.sql` acrescenta `Bot`, `BotInstance`, `BotSession` e `BotExecutionLog`. Não remove tabelas nem modifica mensagens, contatos ou cadastros existentes. Aplique-a antes de iniciar a nova versão, inclusive para continuar usando atribuições e encerramento.

Mantenha `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` e `EVOLUTION_INSTANCE` no servidor. Acrescente um `BOT_WEBHOOK_SECRET` aleatório e configure a Evolution para enviar o mesmo valor no header `x-bot-webhook-secret`. Caso a instalação não permita headers personalizados, use a URL:

```text
https://SEU_BACKEND/api/webhook/whatsapp?botToken=SEGREDO_CODIFICADO_PARA_URL
```

Prefira o header; configure o proxy para não registrar o token quando usar a query string. O payload precisa incluir `instance` com o nome exato de `EVOLUTION_INSTANCE`. Eventos sem segredo válido continuam seguindo o processamento legado, mas não acionam automação. A ativação é bloqueada sem `BOT_WEBHOOK_SECRET`. Não exponha esse segredo no frontend.

## Configuração do Assistente Infordoc

1. Entre em uma empresa ativa como membro `owner` ou `admin`. Um administrador global também precisa dessa associação; a autorização é verificada no backend em todas as rotas `/api/bots`.
2. Abra **Central de Bots → Criar bot** e informe `Assistente Infordoc`.
3. No menu principal, configure a mensagem inicial, sem repetir a lista de opções (o motor acrescenta a lista):

```text
Assistente Infordoc

Olá! Bem-vindo ao suporte técnico.

Selecione uma das opções abaixo:
```

4. Adicione a opção `1`, nome `Ajuda para abrir chamado`, ação **Enviar mensagem**, com a resposta:

```text
Para abrir um chamado, acesse https://sac.infordoc.com.br/.

Caso ainda não tenha um login, clique na opção Criar cadastro.

Durante o cadastro, o sistema solicitará um CNPJ. É importante utilizar o CNPJ cadastrado no contrato com a Infordoc.
```

5. Cadastre as opções `2` e `3` com os textos desejados. Mantenha-as **inativas** enquanto não houver respostas aprovadas. Nenhuma orientação técnica é inventada pelo sistema.
6. Para um submenu, clique em **Componentes → Menu de opções**, configure nome, mensagem e opções. Volte ao menu principal pela lista **Menus do fluxo**, selecione a opção correspondente no canvas, escolha **Abrir submenu** e selecione o destino no editor. A lista mostra o caminho `Menu principal › Submenu`; menus sem conexão ficam identificados.
7. **Salvar rascunho** persiste o trabalho sem alterar a produção. **Testar bot** executa esse rascunho sem enviar mensagens reais. Uma opção sem resposta apresenta erro no simulador e impede publicação se estiver ativa.
8. **Publicar** valida e copia o fluxo para uma versão publicada. **Ativar** vincula a instância à empresa e seleciona o bot. A primeira ativação define a empresa proprietária da instância; outra empresa não pode assumir essa instância pela API. Apenas um bot pode estar ativo por instância. Publicar novamente um bot ativo atualiza sua produção; o próximo evento reinicia as sessões automáticas na nova versão.

Opções podem ser editadas, duplicadas, excluídas e reordenadas pelas setas. A ordem de exibição não altera o número que o cliente deve digitar. O número `0` é reservado para voltar: em submenus, retorna ao menu anterior; no principal ou depois de uma resposta, reapresenta o menu atual/principal conforme a pilha de navegação.

Para criar uma escolha **Voltar ao início**, use a ação **Abrir submenu** e selecione o menu principal em **Menu de destino**. Retornos a menus anteriores são permitidos: cada escolha exige uma nova mensagem do cliente. Ao retornar ao início, o histórico de navegação é limpo; o comando `0` permanece no menu principal. Ao voltar a outro menu anterior, o histórico é encurtado até esse ponto.

### Designer visual

O editor tem lista de bots e componentes à esquerda, canvas central, painel **Editar nó** e simulador de conversa à direita. Em telas menores, o teste abre em um painel; no celular, as áreas ficam empilhadas. O canvas tem zoom, ajuste automático, minimapa, arraste dos nós e navegação por arraste do fundo.

Selecione o nó de mensagem para editar a saudação; selecione o menu verde para organizar opções; selecione uma ramificação para editar seu número, resposta ou destino. Clique ou arraste **Mensagem**, **Transferir para humano** ou **Ir para outro menu** da biblioteca para adicionar uma opção ao menu aberto. No arraste, o novo nó aparece na posição em que foi solto. **Menu de opções** cria um submenu, conectado depois pela ação de uma opção.

As posições são guardadas em `Bot.draft.layout`, validadas no servidor e preservadas ao salvar/reabrir. O motor não usa as posições para decidir o atendimento: as conexões refletem as ações e destinos cadastrados. Não é necessária outra migration para o designer, pois `draft` e `published` já são JSON.

**Testar bot** executa o rascunho no motor existente. **Histórico do teste** mostra os passos daquela simulação; não é um relatório de conversas de produção. A interface oferece as ações já suportadas pelo motor: mensagem, submenu e transferência humana.

Limites: 50 menus, 50 opções por menu, números únicos de 1 a 999, mensagens de até 8.000 caracteres, nomes de opção de até 200 caracteres. Publicação rejeita destinos inexistentes, mensagens de menu vazias e opções ativas sem nome/resposta. Rascunhos permitem respostas vazias, mas precisam ter uma estrutura válida.

## Arquitetura e integração

### Atendimento atribuído ao Inforbot

Uma conversa atribuída ao membro Inforbot inicia o fluxo publicado na próxima mensagem recebida do cliente, inclusive quando a primeira mensagem é uma mídia. Depois do início, as escolhas do menu são processadas em mensagens de texto. Respostas automáticas preservam os responsáveis exibidos no chat.

Uma nova atribuição ao Inforbot limpa a sessão anterior sob o mesmo lock usado pelo runtime. Sessões antigas cuja atualização precede essa atribuição também são reiniciadas. Uma transferência para atendimento humano permanece pausada até a conversa ser devolvida ao bot; mensagens duplicadas não geram novos envios.

- `Bot.draft` e `Bot.published` guardam documentos JSON de menus/opções. A opção por snapshots substitui tabelas separadas para cada menu: publicação atômica, referências validadas no servidor e edição sem alterar produção. `revision` impede sobrescrita concorrente; `publishedRevision` muda apenas ao publicar.
- `BotInstance` vincula a instância Evolution global a uma organização e a um único bot ativo. As consultas administrativas sempre filtram pela empresa ativa e conferem a associação do usuário.
- `BotSession` identifica a conversa por instância e `Contact.id`, guardando menu, pilha de retorno, versão e estado. `BOT_ACTIVE`, `WAITING_HUMAN`, `HUMAN_ACTIVE` e `CLOSED` são suportados. `CLOSED` fica reservado a futuros encerramentos; o encerramento atual devolve a conversa ao bot.
- `bot-flow.ts` contém validação, renderização e transições puras. `/api/bots/simulate` reexecuta os comandos nesse mesmo motor, sem adaptador Evolution nem persistência de mensagens. O cliente não pode injetar ponteiros de sessão no simulador.
- O webhook existente continua resolvendo JIDs/contatos, persistindo mensagens e emitindo eventos. Depois disso, eventos autenticados, individuais, recebidos e de texto passam para `processBotMessage`. Mensagens próprias, grupos, contatos bloqueados, instâncias diferentes e conversas atribuídas são ignorados pelo bot.
- O runtime consulta exclusivamente a versão publicada, envia pelo `sendWhatsAppMessage` existente, persiste o retorno em `Message` usando o ID da Evolution e emite `new_message` pelo Socket.IO existente. A automação segue a arquitetura global de histórico e sockets do projeto.
- Locks MySQL no contato serializam mensagens e mudanças de responsáveis entre processos. Locks compartilhados na instância permitem conversas paralelas e fazem a desativação aguardar envios já em andamento. Assumir uma conversa aguarda um envio que já tenha começado; depois da atribuição efetivada, novas respostas automáticas são bloqueadas.
- A opção **Transferir para atendimento humano** envia a resposta cadastrada e grava `WAITING_HUMAN`. A atribuição existente grava `HUMAN_ACTIVE`. Retirar responsáveis mantém `WAITING_HUMAN`; o reinício exige o encerramento/devolução existente. `close-with-bot` preserva a pesquisa de satisfação e o evento de encerramento, remove os responsáveis e limpa a sessão. A próxima mensagem recebida inicia o menu uma única vez.
- A unicidade de `Message.externalId` bloqueia webhooks duplicados, inclusive concorrentes. `BotExecutionLog.messageId` faz uma reserva persistente antes do envio. Um timeout ou falha ambígua fica em `FAILED_OR_UNCERTAIN`, sem repetição automática. Os logs novos não guardam conteúdo, telefones ou credenciais.

## Testes

```sh
npm run test:bots --workspace=@cotrimbot/backend
```

O comando compila os testes com TypeScript e usa `node:test`, sem depender do problema de `os.userInfo` do `tsx` no Windows deste ambiente. Os testes cobrem navegação, edição, submenus, comando 0, entrada inválida, transferência, pausa, reinício, duplicação concorrente, falhas Evolution, instância/organização, autenticação do webhook, autorização administrativa, revisões e separação rascunho/publicado. API e runtime usam adaptadores de banco/envio de teste.

O teste MySQL é opt-in e usa uma transação revertida ao final, com organização própria de teste. Execute-o em um banco de testes com as migrations aplicadas e as variáveis `DATABASE_*` configuradas:

```powershell
$env:RUN_BOT_DB_TESTS = '1'
npm.cmd run test:bots --workspace=@cotrimbot/backend
Remove-Item Env:RUN_BOT_DB_TESTS
```

Frontend (após o build):

```sh
cd frontend
node ../node_modules/@playwright/test/cli.js test --config playwright.config.ts bots.spec.ts
```

O Playwright verifica edição, payload salvo, simulador e ausência de overflow em desktop e mobile. Intercepta a API para não alterar produção. Não representa uma validação real da Evolution.

Validação realizada nesta entrega:

- Schema Prisma válido e builds de backend e frontend concluídos.
- Suite do Bot Builder: 10 testes aprovados, incluindo validação das posições do designer; teste MySQL opt-in omitido na execução padrão.
- Ao executar explicitamente o teste MySQL, a conexão falhou antes de iniciar a transação (`Unable to start a transaction in the given time`). `prisma migrate status` também falhou. A migration não foi aplicada neste ambiente.
- Playwright do Bot Builder: 3 testes aprovados, cobrindo edição em 1440 px e 390 px e o designer em 1720 px, seleção de nós, arraste de nós e componentes, posições persistidas, minimapa e abertura de submenus. Screenshots desktop/mobile inspecionadas.
- Lint dos arquivos frontend desta implementação aprovado. O lint global encontra 2 erros preexistentes em `frontend/components/chat/chat-panel.tsx` (pureza de `Date.now` e atualização de estado em efeito), além de 3 avisos em outros arquivos.
- A suíte frontend existente de arquivos `*.test.mjs` foi tentada e falhou na preparação com esbuild por acesso negado/resolução de módulos no Windows, antes das verificações funcionais. Não foram alterados esses testes ou componentes para contornar o ambiente.
- Não foi realizado envio real ao WhatsApp. A validação ponta a ponta permanece pendente de banco acessível e configuração da Evolution/webhook.

No Windows, o encerramento do servidor estático iniciado pelo Playwright ficou pendente; a segunda execução usou o mesmo servidor com `PLAYWRIGHT_REUSE_SERVER=1` e terminou com sucesso. Esse modo agora é suportado na configuração; seu padrão continua sendo iniciar um servidor exclusivo para a suíte.

## Limites desta primeira versão

- O backend atual tem **uma instância Evolution por servidor** e contatos/histórico/sockets globais. Esta implementação isola configurações e a propriedade da instância por organização; não converte o inbox legado em uma plataforma com múltiplas instâncias ou isolamento global de histórico.
- Não há transferência de propriedade da instância pela interface, nem exclusão de bots (há desativação). Qualquer mudança de propriedade exige uma operação administrativa de infraestrutura.
- A Evolution não oferece aqui uma chave de idempotência de envio. Não há garantia absoluta de entrega exatamente uma vez entre sistemas. Se o processo cair depois da reserva e antes do envio, a resposta pode não ser entregue. Se a Evolution aceitar e o banco falhar, pode haver uma resposta enviada sem sessão atualizada. Registros `PROCESSING` antigos e `FAILED_OR_UNCERTAIN` precisam de inspeção operacional; não há retentativa automática nem painel de logs nesta versão.
- A primeira mensagem inicia o menu; a seleção numérica é processada nas mensagens seguintes. Não há timeout de sessão, mídia em respostas ou notificações específicas de fila humana; os atendentes usam o inbox e as atribuições existentes.
- A verificação ponta a ponta com MySQL e WhatsApp precisa ser executada em ambiente conectado antes da liberação.

## Arquivos desta implementação

Criados: `backend/src/services/bot-flow.ts`, `bot-runtime.service.ts`, `bot-webhook-auth.ts`; `backend/src/routes/bot.routes.ts`; `backend/prisma/migrations/20261021120000_add_bot_builder/migration.sql`; `backend/tests/bot-fixture.ts`, `bot-flow.test.ts`, `bot-runtime.test.ts`, `bot-api.test.ts`, `bot-database.test.ts`; `backend/tsconfig.bot-tests.json`; `frontend/lib/bot-api.ts`; `frontend/app/dashboard/bots/page.tsx`; `frontend/components/bots/bot-designer.tsx`, `flow-canvas.tsx`, `bot-designer.module.css`; `frontend/tests/bots.spec.ts`; `docs/bot-builder.md`.

Modificados: `backend/prisma/schema.prisma`; `backend/src/server.ts`; `backend/src/controllers/webhook.controller.ts`, `contact.controller.ts`, `message.controller.ts`; `backend/src/services/evolution.service.ts`; `backend/package.json`; `frontend/components/chat/chat-navigation-rail.tsx`; `frontend/playwright.config.ts`; `.gitignore`; `README.md`. Alterações locais que já existiam em outros arquivos foram preservadas.

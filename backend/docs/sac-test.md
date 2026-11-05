# Abertura de chamados de teste no InforBot

O fluxo reutiliza a ação `SAC_TEST`, o webhook, o runtime de bots, o catálogo de
demonstração no MySQL e a conexão Evolution existentes. Nenhuma chamada de criação
é feita ao SAC, nem é criado um registro em `SacTestTicket` nesta versão.
Os registros de teste antigos continuam disponíveis na consulta administrativa.

## Configuração e teste pelo WhatsApp

1. Configure `TICKET_FLOW_TEST_MODE=true` no ambiente do backend. O padrão é `true`.
   Qualquer outro valor desativa novas coletas; não habilita uma integração real.
   Coletas em andamento continuam disponíveis para conclusão ou cancelamento.
2. Compile e inicie o backend pelos comandos existentes. Não há nova migration.
   Em instalações novas, a migration `20261023130000_add_sac_test_flow` fornece o
   catálogo fictício. Não é necessário resetar o banco.
3. Na Central de Bots, configure a opção desejada com **Abrir chamado (teste)**.
   Use o simulador e publique pelo procedimento normal do editor.
4. Atribua sua conversa ao membro configurado no bot (ou ao Inforbot, conforme a
   convenção anterior). Grupos, bloqueados e contatos sem atribuição não acionam o bot.
5. Envie uma saudação, escolha a opção de abertura e informe, nesta ordem:
   - CNPJ de demonstração: `05.540.238/0001-23`.
   - `1` para confirmar (ou `2` para corrigir).
   - Nome, por exemplo `José da Silva`.
   - Telefone com DDD, por exemplo `(27) 99999-9999`.
   - Número de um dos endereços apresentados dinamicamente.
   - E-mail, por exemplo `teste@example.com`.
6. O bot confirma o recebimento e permanece em `nextStep`, com os dados guardados.
   Equipamento, assunto, descrição, anexos e confirmação final ainda não são coletados.
7. Experimente respostas inválidas: a etapa deve permanecer a mesma. Envie `0` ou
   `cancelar` em qualquer etapa para cancelar imediatamente. Depois, `0` apresenta
   o menu principal e permite uma nova coleta.

O catálogo é fictício e não representa uma consulta ao SAC. CNPJ não cadastrado
não recebe dados inventados. Endereço ausente mantém a etapa e orienta a corrigir
o cadastro e tentar novamente ou cancelar. Campos vazios entre vírgulas são removidos.
Telefones são salvos apenas com DDD e número; aceita-se também o prefixo `+55`.

## Arquitetura e persistência

O webhook em `src/controllers/webhook.controller.ts` já salva as mensagens e chama
`processBotMessage`. A unicidade de `Message.externalId` bloqueia reentregas do
mesmo evento antes do processamento. Nenhuma segunda conexão WhatsApp foi criada.

O runtime em `src/services/bot-runtime.service.ts` recupera `BotSession` pela chave
única `(instance, contactId)`, verifica empresa/bot e atribuição, e usa o bloqueio
`SELECT ... FOR UPDATE` do contato para serializar mensagens entre processos.
`BotExecutionLog.messageId` é único e impede uma segunda transição/envio para a
mesma mensagem. A sessão é gravada na transação existente após o envio da resposta.

`BotSession.id`, `contactId` e `updatedAt` já fornecem os metadados da sessão. Seu
JSON `state.sacTest` contém `startMessageId`, `step` e `data`, com CNPJ, identificador
da empresa, `requester` (nome), telefone, `addressId`, `addressLabel` e e-mail.
Mantiveram-se as convenções de chaves existentes:

| Estado solicitado | Valor persistido em `step` |
| --- | --- |
| WAITING_CNPJ | cnpj |
| CONFIRMING_CNPJ | confirmCnpj |
| WAITING_NAME | requester |
| WAITING_PHONE | phone |
| WAITING_ADDRESS | address |
| WAITING_EMAIL | email |
| WAITING_NEXT_STEP | nextStep |
| CANCELLED | coleta removida da sessão ativa |

O reinício do processo recupera o JSON salvo no MySQL. A coleta sobrevive a novas
revisões publicadas do mesmo bot. Uma nova atribuição reinicia o serviço, conforme
a arquitetura existente. Continua valendo a expiração por inatividade de 24 horas,
configurável por `SAC_TEST_SESSION_TTL_MINUTES` (inteiro positivo, padrão `1440`).
As etapas posteriores de sessões antigas passam a `nextStep` sem perder os dados.

Não há avanço quando uma consulta ao catálogo falha. O usuário recebe orientação
para reenviar a resposta, mantendo a coleta; cancelar dispensa essa consulta.
Se a própria conexão com o banco estiver indisponível, o runtime registra falha
pelo tratamento existente, mas não pode garantir uma resposta ao WhatsApp.

Falhas de envio conservam o último estado confirmado. O log fica com
`FAILED_OR_UNCERTAIN`; uma duplicata não dispara novo envio. Uma nova mensagem pode
retomar a etapa anterior. Como a Evolution não oferece envio exatamente uma vez,
um timeout pode significar que a resposta chegou ao WhatsApp sem confirmação local.
Não se repete esse envio automaticamente. Os logs técnicos não incluem dados pessoais.

## Responsabilidades dos arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `src/services/bot-sac-test.ts` | Estados e processamento das respostas. |
| `src/services/bot-sac-test-validation.ts` | CNPJ, nome, telefone e e-mail. |
| `src/services/bot-sac-test-messages.ts` | Perguntas e formatação de endereço. |
| `src/services/bot-sac-test-catalog.ts` | Catálogo fictício exclusivo do simulador. |
| `src/services/bot-flow.ts` | Encaminhamento pela ação existente dos menus. |
| `src/services/bot-runtime.service.ts` | Consultas MySQL, sessões, deduplicação e envio Evolution. |
| `src/routes/bot.routes.ts` | Simulador e respostas rápidas coerentes com cada etapa. |

O WhatsApp recebe o catálogo exclusivamente das tabelas `SacTestCompany` e
`SacTestAddress`. O simulador usa dados fictícios locais e não envia mensagens nem
persiste sessões. A consulta administrativa `GET /api/bots/sac-test/tickets`
continua protegida e lista somente registros antigos da empresa ativa; esta coleta
não preenche essa tabela.

## Verificações

Na raiz do repositório:

```powershell
npm.cmd run test:bots --workspace=@cotrimbot/backend
npm.cmd run build --workspace=@cotrimbot/backend
```

Os testes cobrem sequência, validações, correção de CNPJ, cancelamento, endereços
dinâmicos/ausentes, isolamento entre contatos, duplicatas, recuperação do JSON por
uma nova instância do processador, falhas de catálogo/envio, modo de teste e pausa
após o e-mail. Os testes do runtime usam um banco simulado: não equivalem a reiniciar
um servidor real com MySQL e Evolution.

O teste de integração MySQL existente é opcional (`RUN_BOT_DB_TESTS=1`) e usa rollback.
O teste manual de WhatsApp exige servidor, banco e instância Evolution configurados.
A futura integração com SAC permanece apenas na configuração existente de contratos:
nenhuma rota externa é executada por esta coleta.

# Presença WhatsApp — diagnóstico e patch da Evolution 2.3.7

## Resultado da investigação em 16/10/2026

O teste real informado confirmou: mensagens e Socket.IO funcionam, a assinatura
retorna sucesso e nenhum `presence.update` chega ao CotrimBot. A investigação
agora cobre o trecho anterior ao backend. A
[issue #2569](https://github.com/evolution-foundation/evolution-api/issues/2569)
relata o mesmo sintoma com LID, mas não apresenta uma causa confirmada ou um
patch oficial. A issue, sozinha, não identifica o defeito desta instalação.

Consultas somente de leitura à instância configurada `cotrimbot` confirmaram:

| Propriedade | Valor observado |
| --- | --- |
| Evolution | `2.3.7` |
| Conexão | `open` |
| Webhook da instância | habilitado |
| Evento | `PRESENCE_UPDATE` habilitado; `MESSAGES_UPSERT` também |
| Destino da instância | `http://cotrimbot:3333/api/webhook/whatsapp` |
| `webhookByEvents` | `false` |
| `alwaysOnline` | `false`, preservado |
| `groupsIgnore` | `false`, preservado |

O Compose já habilitava o webhook global e o evento. A consulta HTTP acima
confirma o webhook **da instância**. Os valores globais efetivamente carregados
no processo serão mostrados pelo novo log `webhook_startup`, mesmo sem evento
recebido. Não é correto deduzir o ambiente efetivo de um container apenas pelo
arquivo Compose.

## Código exato inspecionado

O Dockerfile usa `evoapicloud/evolution-api:v2.3.7` e reconstrói o commit
[`cd800f2976e1e5b682fbf86a01ee4d85ae61f370`](https://github.com/evolution-foundation/evolution-api/tree/cd800f2976e1e5b682fbf86a01ee4d85ae61f370).
Esse código fixa `baileys@7.0.0-rc.9`. Foram inspecionados também os métodos do
pacote npm exato, sem atualizar a dependência.

O [Baileys rc.9](https://github.com/WhiskeySockets/Baileys/blob/v7.0.0-rc.9/src/Socket/chats.ts)
recebe `CB:presence` e `CB:chatstate`, transforma áudio em `recording` e emite
`presence.update`. Nessa versão, um nó `paused` vira estado `available`, que o
frontend existente já trata como encerramento da atividade. O callback
`shouldIgnoreJid` da Evolution filtra grupos/broadcast/newsletter conforme as
configurações; não contém um descarte específico de `@lid`.

A Evolution encaminha a presença para `sendDataWebhook`, que chama o dispatcher
de integrações. O `WebhookController.emit` possui caminhos separados para
webhook da instância e webhook global. O global exige `GLOBAL.ENABLED` e
`EVENTS.PRESENCE_UPDATE`; se `WEBHOOK_BY_EVENTS` estiver ativo, acrescenta
`/presence-update` ao destino. Essa opção está desligada no Compose atual.

### Duas fragilidades reproduzidas

1. **Perda do identificador original na assinatura.** `sendPresence` chama
   `whatsappNumber`. Quando a entrada LID existe no cache, esse método devolve
   `cached.remoteJid`, que pode ser o PN. Depois, `sendPresence` assina apenas
   esse identificador. Portanto, `subscription_ok` pode significar que apenas
   o telefone foi assinado, apesar de a solicitação ter usado um LID. Um teste
   executa o método upstream com esse cenário de cache e reproduz a troca.
2. **Presença dependente da fila de mensagens.** A presença era encaminhada
   dentro de `eventProcessingQueue`, depois de handlers que aguardam histórico,
   mensagens e confirmações. Um handler lento retém presença que já chegou ao
   Baileys. O teste bloqueia essa fila e verifica que o patch entrega a presença
   imediatamente e uma única vez.

São defeitos corrigíveis no código, mas ainda não demonstram qual deles causou
**a ausência observada em produção**. Se nenhum nó chegar do WhatsApp após a
assinatura correta, os dois patches não podem fabricar esse evento.

## Patch aplicado à imagem personalizada

O patch de enquetes existente permanece em `patchEvolutionPolls`. O mesmo
build passa a executar `patchEvolutionPresence` depois dele, na mesma versão.
Os pontos de inserção são validados; uma fonte incompatível interrompe o build.

- Nova rota `POST /chat/subscribePresence/:instanceName`, sob os mesmos guards
  do `ChatRouter`. O parâmetro `:instanceName` segue o contrato upstream.
- Corpo `{ "number": "...@lid", "aliases": ["...@s.whatsapp.net"] }`, com no
  máximo um alias. O backend envia os identificadores já conhecidos do contato.
- Os identificadores fornecidos são preservados e normalizados sem converter
  os dígitos de um LID em telefone. Se um cadastro legado guarda os mesmos
  dígitos do LID em `phone`, o backend não envia esse valor como um PN inventado
  e não altera o cadastro. Com apenas um identificador, a extensão
  pode ler uma correspondência já existente em `authState.keys.get('lid-mapping')`.
- A extensão **não** chama USync, `onWhatsApp`, `getLIDForPN`, `keys.set`,
  `sendPresenceUpdate`, relay ou envio de mensagens. Nenhum vínculo é inventado
  ou gravado. A operação de rede é apenas `presenceSubscribe`.
- O backend usa essa nova rota. Não faz fallback para `sendPresence`, pois esse
  fallback voltaria a perder aliases e enviaria `paused` para o contato.
- Um listener do evento real `client.ev.on('presence.update')` encaminha o mesmo
  payload fora da fila de mensagens. O ramo antigo dessa presença na fila é
  removido. A ordem e o conteúdo dos outros handlers permanecem intactos.
- Os observadores são anexados uma vez por socket e removidos ao fechar a
  conexão. Os observadores de nós brutos apenas diagnosticam; **não geram
  eventos, não substituem o parser e não fazem forwarding alternativo**.
- A implementação atual do webhook, Socket.IO e frontend do CotrimBot é
  reutilizada. O frontend não precisou de outra alteração nesta etapa.

Um sucesso de assinatura confirma a escrita do pedido no socket, não um ACK
remoto nem a entrega futura de eventos. Não se forçou `alwaysOnline=true` nem
se modificou a privacidade ou a sessão para tentar produzir presença.

## Logs temporários seguros

Configure temporariamente `PRESENCE_DEBUG=true` no ambiente do Compose/Dokploy.
O serviço `cotrimbot` já recebe o arquivo de ambiente; agora `evolution-api`
também recebe explicitamente essa variável pelo Compose. Não é necessário
habilitar `LOG_LEVEL=WEBHOOKS`, que no upstream pode imprimir payloads.

Filtre `[evolution-presence]` e `[whatsapp-presence]`. Ambos ficam desligados
por padrão e limitam a saída a 120 linhas/minuto por processo. As referências
HMAC usam uma chave aleatória não registrada, válida apenas naquele processo.
As referências da Evolution e do CotrimBot são independentes; não são chaves
de correlação entre containers. Os logs novos não incluem identificadores
brutos, nomes, payloads, credenciais ou URLs.

| Etapa na Evolution | O que comprova |
| --- | --- |
| `webhook_startup` | Flags globais efetivamente carregadas no processo. |
| `observer_attached` | O socket foi instrumentado pela imagem nova. |
| `mapping_read` / `mapping_unavailable` | Leitura de vínculo existente quando só um identificador foi fornecido. |
| `subscription_attempt` / `subscription_written` / `subscription_failed` | Cada pedido de assinatura PN/LID e sua escrita no socket. |
| `socket_node` | Um nó de presença/chatstate chegou ao socket do Baileys. |
| `baileys_event` | O parser do Baileys emitiu `presence.update`. |
| `ignored` | Socket inativo, grupo ignorado ou payload inválido. |
| `evolution_forward` | O listener encaminhou o evento real ao dispatcher. |
| `webhook_enter` / `webhook_config` | O dispatcher alcançou o controller; flags local/global carregadas. |
| `webhook_http_attempt` | Tentativa HTTP, com `scope=local` ou `global`. |
| `webhook_http_response` | Resposta HTTP e código de status. |
| `webhook_http_failed` | Falha HTTP/rede/timeout, sem imprimir erro bruto. |
| `dispatch_returned` / `dispatch_failed` | Retorno/falha do dispatcher; retorno sozinho não comprova sucesso HTTP. |

No CotrimBot, continuam disponíveis `webhook_received`, `received`, `ignored`,
`contact_not_found`, `ambiguous_contact`, `emitted` e os logs de assinatura.
`emitted` comprova emissão no servidor Socket.IO, não recebimento no navegador.

Os callbacks de nós e eventos podem registrar linhas em ordem diferente da
ordem conceitual do fluxo, pois o parser do Baileys já tem listeners registrados.
O limite de logs pode omitir linhas em uma rajada; evite concluir pela ausência
de uma linha isolada quando houver saturação.

### Como localizar a interrupção

| Última evidência observada | Próxima investigação |
| --- | --- |
| `subscription_written`, mas nenhum `socket_node` durante atividade real | Entrega do WhatsApp, endereçamento, disponibilidade/privacidade da conta; não é perda no webhook do CotrimBot. |
| `socket_node` para chatstate, mas nenhum `baileys_event` | Parser/filtros do Baileys. Não criar um evento sintético para contornar. |
| `baileys_event` e `evolution_forward`, sem `webhook_enter` | Dispatcher e integrações anteriores ao webhook. |
| `webhook_config`, sem tentativa global | Conferir `globalEnabled`, `globalEvent` e filtros. |
| `webhook_http_failed` | Rede interna, destino e status HTTP. |
| HTTP 200, sem `received` no CotrimBot | Conferir destino efetivo, serviço/imagem atendendo e filtros dos logs. |
| `received` sem `emitted` | Motivo do descarte, vínculo PN/LID ou contato ausente/ambíguo. |
| `emitted`, sem indicador | Socket.IO do navegador e contato selecionado. |

Local e global podem apontar para o mesmo endereço e enviar duas requisições.
Isso já faz parte da configuração upstream. O listener de Baileys encaminha
uma vez; o teste confirma que os destinos existentes não geram dois listeners.
O caminho local upstream pode aguardar retries antes do global; as tentativas
com `scope` permitem identificar esse atraso. A política de entrega/retry não
foi substituída por outro webhook.

## Testes automatizados e seus limites

Os testes usam trechos originais da Evolution fixada e o parser/assinatura do
Baileys npm rc.9, com procedência e licenças em
`backend/tests/fixtures/evolution-presence/`. As cópias originais recebem o patch
em diretórios temporários. O teste integrado usa:

`nó de protocolo offline → parser Baileys → Evolution modificada → webhook
HTTP global → controller existente → Socket.IO real → hook/cabeçalho reais`.

HTTP, Socket.IO e Chrome são reais e locais. O banco, a infraestrutura de
conexão WhatsApp e o emitter não bufferizado de presença são fixtures. O Axios
é substituído por um adaptador fetch para o servidor local. Não há conexão ao
WhatsApp nem injeção de eventos em produção. O teste prova as etapas de software,
não a emissão do serviço remoto ou a disponibilidade do protocolo em cada conta.

Cobertura adicional: aliases PN/LID, leitura de mapeamentos sem escrita, ausência
de chatstates enviados pela assinatura, guards da rota, fila bloqueada,
encaminhamento único, fechamento de socket, configuração global, falha HTTP,
logs sem segredos, `recording`, fim da atividade e expiração no frontend. Os
testes existentes de votos nativos e do frontend também foram executados.

Comandos:

```sh
cd backend
npx tsx --test --experimental-test-module-mocks tests/*.test.ts
cd ..
node --test --test-concurrency=1 backend/tests/*.test.mjs frontend/tests/*.test.mjs
cd backend
npx tsc --noEmit
```

A suíte TypeScript do backend passou com **66 testes**. O comando `.mjs` passou
com **10 testes**: a rota de enquetes e nove suítes do frontend. O TypeScript do
backend e da extensão nova passou. O patch também foi aplicado com sucesso ao
checkout completo do commit fixado. Este ambiente não tem Docker/Podman/Buildah;
o build completo da imagem com as dependências da Evolution ainda precisa
acontecer no Dokploy. O Dockerfile já executa o type-check/build upstream.

Nesta etapa não houve nova execução do Playwright legado `*.spec.ts`: o frontend
não foi alterado. Na análise anterior, ele registrou 5 aprovações e 10 falhas
em expectativas de clientes, seletores do painel e mocks de autenticação.
Essas falhas não foram contornadas por alterações de funcionalidades.

## Publicação exata no Dokploy

Reconstruir e publicar **dois serviços**, nesta ordem:

1. **`evolution-api`** — inclui o patch de enquetes preservado, a rota de
   assinatura, o encaminhamento de presença e os logs novos.
2. **`cotrimbot`** — inclui o backend que usa `/chat/subscribePresence` com os
   aliases. O Dockerfile da aplicação também empacota o frontend existente.

Equivalente no host do Compose:

```sh
docker compose build evolution-api cotrimbot
docker compose up -d --no-deps evolution-api
docker compose up -d --no-deps cotrimbot
```

Preservar os volumes existentes. Não reconstruir MySQL, PostgreSQL, Redis ou
transcrição. Nenhuma migração, reset/recriação de sessão, novo QR code ou mudança
de autenticação faz parte deste ajuste. A versão base e o Baileys permanecem
fixados. A recriação do container naturalmente reconecta a sessão persistida.

### Verificação que ainda exige WhatsApp real

1. Confirmar `webhook_startup` e `observer_attached` após a publicação.
2. Abrir uma conversa individual no CotrimBot. Conferir HTTP 204 na assinatura
   do backend e `subscription_written` para os tipos PN/LID disponíveis.
3. Em outra conta WhatsApp, digitar sem enviar; depois gravar áudio sem enviar.
   Procurar os estágios desde `socket_node` até HTTP 200 e `emitted`; conferir
   `digitando...` e `gravando áudio...` no cabeçalho.
4. Parar a atividade e verificar limpeza imediata ou expiração em seis segundos.
5. Repetir em contatos PN e LID conhecidos. Se não houver nó no socket, coletar
   essa evidência e os tipos de identificador assinados, sem concluir que o
   backend possa recuperar um evento que o WhatsApp não entregou.

Depois da captura, desativar `PRESENCE_DEBUG` e recriar/republicar os dois
containers com as mesmas imagens. Mudança só de variável não exige rebuild.
Rollback deste ajuste deve restaurar a imagem personalizada anterior com suporte
a enquetes e o backend anterior juntos, pois a nova rota precisa de ambos.

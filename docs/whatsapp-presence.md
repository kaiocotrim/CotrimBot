# Diagnóstico de presença — Evolution API 2.3.7

## Verificação em 16/10/2026

Uma consulta somente de leitura à Evolution configurada no ambiente confirmou:

- Versão `2.3.7` e instância com estado `open`.
- Webhook da instância habilitado, `PRESENCE_UPDATE` presente e `webhookByEvents=false`.
- A URL configurada termina na rota existente `/api/webhook/whatsapp`.
- O Compose já habilita o webhook global e `WEBHOOK_EVENTS_PRESENCE_UPDATE=true`.

Isso comprova a configuração consultada, **não a chegada de um evento real**.
Este ambiente não dispõe do Docker nem dos logs do serviço no Dokploy. Os testes
HTTP usam eventos sintéticos e dependências simuladas; não geram presença na
instância de produção. Uma captura controlada no Dokploy ainda é necessária.

## Fluxo existente e ajustes

O fluxo continua sendo `Evolution → webhook.controller.ts → contact_presence
(Socket.IO) → useChat → ChatHeader`. Não foi criado outro webhook ou canal.

- O ramo de presença aceita `presence.update`, `PRESENCE_UPDATE` e
  `presence-update`, sem mudar o tratamento de outros eventos.
- O parser preserva a associação entre pessoa e status em mapas `presences`.
  Em eventos individuais, considera tanto o JID externo como a chave do mapa,
  permitindo identificar um telefone quando o identificador externo é um LID.
- Remove sufixos de dispositivo (`:0`, `:2` etc.) somente na identificação de
  presença. Telefones `@s.whatsapp.net` são consultados em `phone`; LIDs `@lid`
  são consultados em `whatsappLid`. Os dígitos de um LID nunca viram telefone.
- Contatos ausentes ou aliases que apontam para contatos diferentes são
  ignorados e diagnosticados. Nenhum contato é criado ou alterado por presença.
- Grupos continuam fora do indicador individual. Eventos explicitamente
  marcados como enviados pela própria conta são ignorados.
- `composing` mostra `digitando...`; `recording` mostra `gravando áudio...`, com
  as mesmas classes e posição do indicador anterior.
- `paused`, `available` e `unavailable` removem a atividade. Cada atualização
  renova o prazo de **6 segundos**, preservando o prazo anterior. O fim do prazo
  e a desconexão do Socket.IO também limpam o indicador.
- O campo legado `isTyping` continua compatível. Um `presence` explícito tem
  prioridade sobre ele. O componente de pontos usado no chat interno permanece
  inalterado.

A assinatura existente em `/contacts/:id/presence-subscription`, renovada a
cada 30 segundos enquanto a conversa individual está aberta, foi preservada.
Ela tenta o LID e mantém o telefone como fallback. O `sendPresence` da 2.3.7
chama `presenceSubscribe` antes de enviar `paused`. Uma resposta de sucesso
nesse endpoint confirma a tentativa de assinatura, não a emissão posterior
de presença pelo WhatsApp.

## Logs temporários no Dokploy

No ambiente do serviço **cotrimbot**, configure temporariamente:

```dotenv
PRESENCE_DEBUG=true
```

Recrie/republique o serviço para carregar a variável. Filtre os logs por
`[whatsapp-presence]`. Os registros são JSON, com estas etapas:

| Etapa | Significado |
| --- | --- |
| `subscription_attempt` / `subscription_ok` / `subscription_failed` | Tentativa de acompanhar o contato pela assinatura existente. |
| `webhook_received` com `event=other` | O endpoint recebe outros webhooks, sem registrar seu conteúdo. |
| `webhook_received` com `event=presence.update` / `received` | Presença chegou ao controller. |
| `ignored` | Payload inválido, evento próprio, grupo, status ou JID ausente. |
| `contact_not_found` | Identificadores válidos sem correspondência no cadastro. |
| `ambiguous_contact` | Telefone e LID apontam para contatos diferentes; não é seguro escolher um. |
| `emitted` | O evento `contact_presence` foi entregue ao servidor Socket.IO. Não comprova recebimento no navegador. |

São registrados apenas motivos enumerados, status conhecidos, contagens, ID
interno do contato e referências HMAC dos identificadores. As referências são
estáveis apenas durante o processo, com chave aleatória que não é registrada.
Não são registrados payloads, nomes, telefones, JIDs/LIDs brutos, URLs ou chaves
da Evolution. Há limite de **120 linhas/minuto por processo**; depois desse
limite os logs são omitidos até a próxima janela. Ausência de uma linha isolada
durante uma rajada não comprova ausência do evento.

Depois do diagnóstico, remova a variável ou use `PRESENCE_DEBUG=false` e
republique o serviço. Os logs ficam desligados por padrão.

## Teste controlado depois da publicação

1. Abra uma conversa individual no CotrimBot. No navegador, confira a chamada
   existente `POST /api/contacts/:id/presence-subscription` com resposta `204`.
2. Usando outra conta WhatsApp, digite **sem enviar**. Espere `received` e
   `emitted` com `presence=composing` e o texto `digitando...` no cabeçalho.
3. Grave áudio sem enviar: espere `recording` e `gravando áudio...`.
4. Pare a atividade: `paused` deve limpar o indicador. Sem evento de parada,
   ele some seis segundos após a última atualização recebida.
5. Troque de conversa e confira o isolamento por contato. Repita para um
   contato identificado por telefone e para outro com `whatsappLid` conhecido.

Se houver `received` seguido de `contact_not_found`, investigue o vínculo
JID/LID já armazenado. A presença não inventa nem grava esse vínculo.
Se houver `emitted`, mas nenhuma atualização no navegador, investigue a
conexão Socket.IO e o ID da conversa, sem mudar a integração de mensagens.

Se outros webhooks chegam, a assinatura responde e **nenhum** evento de
presença chega durante o teste, compare com os logs da Evolution. Falta do
evento em ambos os lados sugere falha anterior ao CotrimBot; não comprova,
sozinha, um defeito específico do Baileys ou da versão.

## Compatibilidade da Evolution 2.3.7

O [código da tag 2.3.7](https://github.com/evolution-foundation/evolution-api/blob/2.3.7/src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts)
contém o encaminhamento de `events['presence.update']` para `PRESENCE_UPDATE`
e a assinatura dentro de `sendPresence`. Portanto, a versão implementa o
recurso, mas depende de o Baileys/WhatsApp entregar a presença.

Existe o [relato upstream #2569](https://github.com/evolution-foundation/evolution-api/issues/2569)
sobre eventos que não são emitidos na 2.3.7 com endereçamento LID. É um relato
compatível com o sintoma, não uma confirmação de que essa instância sofre do
mesmo problema, nem garantia de correção em outra versão.

A [documentação de webhooks](https://github.com/evolution-foundation/evolution-docs/blob/main/docs/02-Configuration/Webhooks.md)
lista os estados `composing`, `recording`, `paused`, `available` e `unavailable`.
Não foi alterada a imagem da Evolution, a extensão de enquetes, as configurações
de mensagens, os bancos ou a autenticação.

## O que publicar no Dokploy

- **Rebuild/redeploy do serviço `cotrimbot`**: inclui o backend e o frontend
  estático no Dockerfile existente. Reiniciar a imagem antiga não inclui o código.
- Ative `PRESENCE_DEBUG=true` apenas durante a captura e desative ao finalizar.
- **Sem migração de banco, alteração de autenticação, atualização da Evolution
  ou modificação do Compose para este ajuste.**
- Se o teste real confirmar ausência na Evolution, registre a versão e os
  resultados da captura antes de decidir uma atualização da API. Essa decisão
  deve considerar as compatibilidades existentes de mensagens e enquetes.

Testes locais de presença:

```sh
cd backend
npx tsx --test tests/presence.test.ts tests/whatsapp-jid.test.ts
cd ..
node --test frontend/tests/whatsapp-presence.test.mjs
```

Os testes novos cobrem parsing, identificação, logs, a rota HTTP existente,
estados do cabeçalho, isolamento por contato, renovação, expiração e limpeza
na desconexão. Teste sintético não substitui a captura de presença real acima.

## Resultados locais desta análise

| Verificação | Resultado |
| --- | --- |
| `cd backend && npx tsx --test --experimental-test-module-mocks tests/*.test.ts` | 58 testes passaram, incluindo os cinco novos testes de presença. |
| `node --test backend/tests/*.test.mjs` | 1 teste passou. |
| `node --test --test-concurrency=1 frontend/tests/*.test.mjs` | 9 testes passaram, incluindo presença no WhatsApp e digitação interna. |
| `cd frontend && npm run build` | Build e exportação estática concluídos, com verificação TypeScript. |
| `cd backend && npx tsc --noEmit` | Passou. |
| ESLint de `use-chat.ts`, `chat-header.tsx`, `app/page.tsx` e `types/chat.ts` | Passou. |
| `cd frontend && npx playwright test --config=playwright.config.ts` | 5 passaram e 10 falharam na suíte existente, conforme abaixo. |

Falhas encontradas sem modificar esses testes ou suas funcionalidades:

- **Clientes (5):** quatro expectativas por `Cliente excluído com sucesso.`
  em `role=status` não encontram esse aviso; outro teste usa um seletor global
  `Cancelar` que encontra dois botões.
- **Responsividade (3):** o seletor `complementary` com nome `Informações do
  contato` não encontra o painel esperado nos tamanhos 320, 414 e 768 px.
- **Digitação (2):** o mock em `typing.spec.ts` rejeita a chamada
  `/api/auth/organization/list`, antes de concluir o cenário de digitação.

Os testes novos de presença executam o hook e o cabeçalho reais com os estados
do Socket.IO simulados; todos os seus cenários passaram. Não houve alteração
das funções de clientes, mensagens, enquetes, bancos ou autenticação para
contornar as falhas da suíte existente.

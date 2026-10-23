# Abertura de chamados de teste no bot

Para preparar as quatro rotas da integração futura, veja a
[aba Integrações da Central de Bots](sac-integrations.md).

O bot do CotrimBot agora aceita a ação `SAC_TEST` em uma opção dos menus existentes.
Ela executa a coleta pelo mesmo motor usado no WhatsApp e no simulador da Central
de Bots. As respostas reais continuam sendo enviadas pela integração Evolution
existente. Nenhum chamado é aberto na Infordoc.

## Cadastro disponível

| Campo | Valor |
| --- | --- |
| CNPJ | `05.540.238/0001-23` |
| Equipamento | `SCANNER C240 (40PPM)` |
| Série | `HD370664` |
| Endereço | `RODOVIA BR-262, S/N, 5030, , VILA CAPIXABA, 29145-901, CARIACICA - ES` |

Esses dados foram fornecidos para demonstração e não foram verificados no SAC.
O CNPJ é validado por formato/dígitos e comparado ao cadastro de teste no MySQL.

## Como testar pelo WhatsApp

1. Atualize o backend e o frontend no servidor com este código. Em Docker, o
   container precisa ser reconstruído com os arquivos novos; editar somente o
   banco não instala o código dentro de um container que já está rodando.
2. A inicialização existente do backend executa `prisma migrate deploy`. A migration
   `20261023130000_add_sac_test_flow` cria quatro tabelas e insere o cadastro acima.
   Não é necessário resetar o banco.
3. Na **Central de Bots**, abra o bot e selecione a opção que deve iniciar a coleta.
   Escolha **Tipo de ação → Abrir chamado (teste)** e salve o rascunho.
4. Use **Testar esta opção** para conferir a coleta antes de publicar.
5. Com o código novo já rodando no servidor, publique o rascunho.
6. No chat, atribua sua conversa ao membro **Inforbot**. Conversas de grupos,
   bloqueadas ou sem atribuição ao Inforbot não são processadas pelo runtime.
7. Envie uma mensagem para receber o menu. Selecione a opção de abertura e preencha
   os dados. Ao confirmar o resumo, um registro `TEST` é salvo no MySQL.

No bot **TEC** encontrado no banco desta instalação, a opção preparada no rascunho
é **1 — Suporte Técnico → 1 — Abrir chamado (teste)**. Os IDs e a numeração da
opção original foram mantidos. A preparação do rascunho não publica automaticamente.

Não publique a ação em um backend antigo: ele ainda não conhece `SAC_TEST`.
Se o servidor atualiza automaticamente por Git, os arquivos precisam chegar ao
repositório/branch acompanhado por esse processo, e o build precisa concluir.
Não há definição dessa automação de deploy neste repositório.

## Perguntas e comandos

```text
CNPJ → confirmar CNPJ → nome → telefone → endereço → e-mail
     → equipamento → descrição → resumo → confirmar e salvar teste
```

- Respostas inválidas mantêm a etapa e mostram como corrigir.
- `0` ou `cancelar` durante a coleta abre a confirmação de cancelamento.
- Na confirmação de cancelamento, `1` descarta o preenchimento e `2` continua da
  mesma etapa, mantendo os dados.
- No resumo, `2` abre a lista de campos editáveis; após corrigir, volta ao resumo.
- Na descrição, números são parte do texto, exceto o comando global `0`.
- Após concluir ou cancelar, `0` volta ao menu principal. É possível iniciar outro
  preenchimento sem precisar transferir a conversa para um humano.
- Arquivos recebem orientação para enviar texto. Este teste não inclui anexos,
  departamentos nem integração real com o SAC.

## Onde ficam os dados

| Tabela | Responsabilidade |
| --- | --- |
| `SacTestCompany` | CNPJ de demonstração. |
| `SacTestEquipment` | Scanner e série associados à empresa de demonstração. |
| `SacTestAddress` | Endereço associado à empresa de demonstração. |
| `SacTestTicket` | Registro final confirmado, sempre com `mode = TEST`. |
| `BotSession` | Etapa, dados parciais e confirmação de cancelamento, por instância/contato. |
| `BotExecutionLog` | Proteção e rastreio dos eventos já processados. |

O preenchimento em andamento continua usando o JSON de `BotSession`. Ao terminar
ou cancelar, os dados da coleta são removidos desse JSON. As mensagens do chat
continuam no histórico existente; cancelar não apaga mensagens do WhatsApp.

Cada execução guarda o ID da mensagem que iniciou a coleta. Esse ID é único em
`SacTestTicket`, para não criar dois registros da mesma execução. A gravação final
ocorre dentro da transação do runtime; se a inserção falhar, a revisão é mantida e
o cliente recebe orientação para tentar novamente, corrigir ou cancelar.

As sessões são recuperadas após reinício do backend e continuam ao publicar uma
nova revisão do mesmo bot. Uma nova atribuição ao Inforbot inicia um novo serviço,
conforme o comportamento existente. A coleta expira após 24 horas de inatividade.
Configure `SAC_TEST_SESSION_TTL_MINUTES` com um número positivo para outro prazo.
Sem configuração válida, o padrão é `1440` minutos.

## Consultar os registros

Com sessão de administrador da empresa, abra no backend:

```text
GET /api/bots/sac-test/tickets
```

A rota retorna até 100 registros recentes da empresa ativa. Usa a mesma proteção
administrativa das rotas de bots. Não é uma rota pública e não retorna registros
de outras empresas.

Também é possível usar o SDK em uma integração autenticada:

```ts
const resultado = await client.request('/bots/sac-test/tickets');
console.log(resultado);
```

No MySQL, uma consulta para conferência é:

```sql
SELECT id, organizationId, contactId, mode, data, createdAt
FROM SacTestTicket
WHERE organizationId = 'ID_DA_SUA_EMPRESA'
ORDER BY createdAt DESC;
```

Os registros deste fluxo ficam no MySQL, separados do SQLite da demonstração
`sdk/examples/sac-test`. O histórico anterior do terminal não é importado.

## Diferença em relação ao teste no terminal

No exemplo de terminal, o SDK enviava perguntas a um servidor HTTP simulado e a
entrada vinha do teclado. Dentro do bot, as entradas vêm do webhook existente e
o runtime já envia respostas pela Evolution. Não é necessário chamar o próprio
backend pelo SDK para enviar essas respostas internamente.

As consultas do catálogo são feitas pelo Prisma no MySQL, sem abrir outro serviço
ou fazer requisições HTTP do backend para ele mesmo. A futura integração com o
SAC deverá substituir a fonte dessas consultas e a gravação final por chamadas
autenticadas à API oficial. Não basta trocar uma URL: os contratos reais precisam
ser adaptados. O número do chamado só poderá ser informado após confirmação real
do SAC; o fluxo atual não inventa protocolo.

## Arquivos principais

| Arquivo | O que faz |
| --- | --- |
| `src/services/bot-sac-test.ts` | Tipos, perguntas, validações, revisão, correção e cancelamento. Funções sem I/O. |
| `src/services/bot-flow.ts` | Adiciona a ação aos menus e encaminha as respostas ao coletor. |
| `src/services/bot-runtime.service.ts` | Lê o catálogo, mantém a sessão e salva a confirmação no MySQL. |
| `src/routes/bot.routes.ts` | Simulador compartilhado e consulta administrativa de registros. |
| `../frontend/components/bots/bot-designer.tsx` | Seleção da ação e teste no editor existente. |
| `scripts/prepare-sac-test.ts` | Prepara um rascunho preservando a publicação e criando backup. |

O catálogo fixo em `bot-sac-test.ts` é usado somente pelo simulador. No WhatsApp,
o runtime injeta os registros carregados das tabelas do MySQL. O simulador não
grava `SacTestTicket` nem envia mensagens ao WhatsApp.

## Preparar um rascunho pelo terminal

Na raiz do repositório, pelo PowerShell:

```powershell
# Apenas listar bots/menus, sem alterações:
npm.cmd exec --workspace=@cotrimbot/backend -- tsx scripts/prepare-sac-test.ts

# Preparar uma opção específica, sem publicar:
npm.cmd exec --workspace=@cotrimbot/backend -- tsx scripts/prepare-sac-test.ts --apply --bot=ID_DO_BOT --option=ID_DA_OPCAO
```

O script salva o JSON anterior em `backend/.sac-test-backups/`, ignorado pelo Git,
e usa a revisão do bot para evitar sobrescrever uma alteração concorrente. Na
ausência de `--option`, tenta localizar uma única opção “Abrir chamado”; quando
não existe nenhuma, acrescenta uma opção livre ao menu principal. Havendo mais de
uma candidata, exige escolha pelo editor ou indicação explícita de `--option`.

## Verificações de desenvolvimento

```powershell
npm.cmd run test:bots --workspace=@cotrimbot/backend
npm.cmd run build --workspace=@cotrimbot/backend
npm.cmd run build --workspace=@cotrimbot/frontend
npm.cmd exec --workspace=@cotrimbot/frontend -- playwright test --config=playwright.config.ts bots.spec.ts
```

Para incluir o teste transacional no MySQL configurado, defina
`RUN_BOT_DB_TESTS=1` antes do teste do backend. Ele cria os dados de verificação
dentro de uma transação e força rollback ao terminar.

# SDK do SAC no backend

Configure no ambiente do servidor (arquivo `.env` na raiz em desenvolvimento):

```dotenv
SAC_BASE_URL=https://endereco-do-backend-sac
SAC_API_TOKEN=
```

Preencha o token somente no servidor. `SAC_TOKEN` também é aceito como alternativa;
`SAC_API_TOKEN` tem prioridade. Reinicie o backend depois de configurar as variáveis.
O SDK acrescenta `/api` à URL quando necessário e usa autenticação Bearer.

## Abertura de chamado

Com as variáveis configuradas, a etapa de CNPJ da ação `SAC_TEST` usa
`tenants.checkByCnpj` (GET `/api/check-tenant?cnpj=...`). A confirmação mostra
o nome retornado pelo SAC e a sessão mantém o `IdTenant`. Depois do telefone,
`clients.list(IdTenant)` carrega os endereços do cadastro ativo com o mesmo CNPJ.
Falhas mantêm a etapa para uma nova tentativa; cancelar não consulta a API.
As consultas não criam chamados e não consultam faturas automaticamente.
Para envio definitivo, use a nova ação **Abrir chamado no SAC** (`SAC_TICKET`).
Veja [Abertura real pelo WhatsApp](sac-real-tickets.md). A ação `SAC_TEST` mantém
a coleta de teste sem envio.

Sem configuração SAC, o modo de demonstração existente continua usando MySQL.
Com SAC configurado, o simulador também consulta CNPJ e endereços reais pelo
backend, sem expor o token no navegador. Sem configuração, usa dados fictícios.
O histórico é reconstruído no servidor, com reutilização de consultas repetidas
dentro de cada requisição. Falhas de consulta mantêm a etapa para nova tentativa.
O simulador não grava chamados nem envia mensagens ao WhatsApp.

`src/services/bot-sac.service.ts` disponibiliza `listSacInvoicesByCnpj(cnpj)`.
A consulta valida e normaliza o CNPJ, chama `tenants.checkByCnpj` e usa o
`IdTenant` válido em uma única chamada a `invoices.list`. Resultados sem tenant,
inválidos ou com mais de um tenant distinto não consultam faturas. Erros da API
são propagados para o fluxo tratar sem mostrar detalhes internos ao contato.
As requisições têm limite de dez segundos por chamada.

Teste isolado, sem credenciais nem chamadas ao SAC real:

```powershell
node --import tsx --test backend/tests/bot-sac-sdk.test.ts
```

O compilador inclui o JavaScript do SDK em `dist/src/lib/sac/` e na saída dos
testes, para que os mesmos imports funcionem no backend compilado.

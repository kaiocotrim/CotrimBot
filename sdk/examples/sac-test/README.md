# Teste local de chamados com o SDK

Esta demonstração usa o `CotrimBotClient` real para enviar mensagens por HTTP a uma **API local simulada do CotrimBot**. As respostas são digitadas no terminal. Não conecta ao WhatsApp, ao SAC Infordoc nem ao MySQL da aplicação. Não altera os fluxos existentes.

## Onde executar no Windows

Use o **PowerShell**, o **Windows Terminal com uma aba PowerShell** ou o **terminal integrado do VS Code**. Se usar VS Code, abra a pasta `cotrimbot` e acesse **Terminal > Novo Terminal**. Os comandos são executados no seu computador, na mesma pasta que contém o `package.json` principal.

Não digite os comandos no WhatsApp, no console do navegador ou dentro do prompt interativo do Node (aquele que mostra apenas `>`).

Requer Node.js 24 (usa `node:sqlite`, que pode exibir aviso experimental). No computador em que o exemplo foi criado, a versão encontrada foi `v24.19.0`.

Execute uma linha por vez no PowerShell:

```powershell
cd "C:\Users\kaio.cotrim\Documents\cotrimbot"
node --version
npm.cmd run build --workspace=@cotrimbot/sdk
node sdk/examples/sac-test/demo.mjs
```

O comando de build prepara o JavaScript do SDK em `sdk/dist`. Usamos `npm.cmd` porque este Windows bloqueou a execução do atalho `npm.ps1` do PowerShell. Não é necessário mudar a política de execução.

Quando aparecer `Cliente:`, você assume o papel do cliente: digite uma resposta e pressione **Enter**. O texto `Bot:` é a pergunta da automação. Enquanto a conversa estiver aberta, o terminal está recebendo respostas do cliente, não comandos PowerShell.

Exemplo de respostas, uma por pergunta:

| Pergunta | Resposta de exemplo |
| --- | --- |
| CNPJ | `05.540.238/0001-23` |
| Equipamento | `1` |
| Endereço | `1` |
| Nome completo | `Pessoa Teste` |
| Telefone | `27999999999` |
| E-mail | `teste@example.com` |
| Problema | `O scanner não está ligando.` |
| Confirmar resumo | `1` |

Ao final, será exibido `Registro de teste #... salvo no SQLite. Nenhum chamado foi aberto no SAC.` e o terminal voltará ao PowerShell. Execute novamente o comando `node .../demo.mjs` para iniciar outra conversa. Se uma execução anterior foi interrompida com uma sessão salva, ela será retomada.

## Se eu testar pelo WhatsApp agora?

**Este novo fluxo não aparecerá no WhatsApp.** O exemplo só recebe respostas digitadas no terminal. O bot existente não foi alterado e seu funcionamento continua dependendo da configuração e dos serviços que já estavam em execução.

Para levar a automação ao WhatsApp será necessário conectar a entrada de mensagens do backend, enviar respostas ao backend real com o SDK, isolar o estado por contato e coordenar a execução com o bot existente. Trocar apenas a URL do SDK não completa essa integração: a entrada ainda viria do teclado e o contato `1` continuaria fictício.

## Como as partes conversam

```text
Você responde no terminal
        |
        v
demo.mjs — controla a pergunta atual e valida a resposta
        |
        +--> sac-api.mjs --> HTTP /sac/* --> server.mjs --> SQLite
        |      Consulta empresa, equipamentos e endereços; cria chamado de teste
        |
        +--> CotrimBotClient --> HTTP /api/contacts/1/send --> server.mjs
                 Envia a pergunta                Grava e imprime "Bot: ..."
```

O SDK é a biblioteca real do projeto e as requisições HTTP realmente acontecem. O servidor de destino foi escrito para simular os serviços: não é uma conexão com a API de produção do CotrimBot ou com a Infordoc. A demonstração verifica esse caminho local; não comprova o envio real no WhatsApp nem compatibilidade com a futura API do SAC.

## Cadastros iniciais

Dados fornecidos, sem consulta ou confirmação externa:

- CNPJ: `05.540.238/0001-23`.
- Equipamento: `SCANNER C240 (40PPM)`, série `HD370664`.
- Endereço: `RODOVIA BR-262, S/N, 5030, , VILA CAPIXABA, 29145-901, CARIACICA - ES`.

O servidor escuta somente em `127.0.0.1`, em porta temporária, e fecha ao terminar. As rotas não têm autenticação e são exclusivas desta demonstração local.

## Sequência real de chamadas HTTP no teste

1. `GET /sac/companies?cnpj=...` consulta a empresa no SQLite.
2. `GET /sac/companies/1/equipment` consulta o equipamento.
3. `GET /sac/companies/1/addresses` consulta o endereço.
4. `POST /sac/tickets` grava o chamado de teste após confirmação. A chave `requestId` evita criar outro registro ao repetir o mesmo POST.
5. Cada mensagem usa `sdk.messages.sendText(1, { text })`, chamando `POST /api/contacts/1/send` no servidor simulado. O contato `1` é apenas um identificador local fictício.

As consultas ao SAC usam `sac-api.mjs`; o SDK CotrimBot cuida das mensagens. Para integrar ao SAC real, adapte essa interface à documentação, autenticação e regras reais. Para WhatsApp real, será necessário conectar as mensagens recebidas do backend e coordenar o atendimento com o bot existente.

## Banco e consulta dos resultados

O arquivo `data/sac-test.sqlite` é criado automaticamente e ignorado pelo Git. As tabelas são `companies`, `equipment`, `addresses`, `sessions`, `tickets` e `sdk_messages`. Todos os chamados têm `test_mode = 1`. O ID exibido é local e não é protocolo do SAC.

Quando a conversa terminar, execute no mesmo PowerShell, ainda na raiz do projeto (ou use outro terminal nessa pasta):

```powershell
node sdk/examples/sac-test/demo.mjs --list
```

O `--list` seleciona o modo de consulta: ele mostra os chamados já salvos, sem iniciar perguntas. Se nenhum chamado foi confirmado, a tabela estará vazia. A opção não limpa os registros.

Local completo do banco neste computador:

```text
C:\Users\kaio.cotrim\Documents\cotrimbot\sdk\examples\sac-test\data\sac-test.sqlite
```

SQLite guarda as tabelas em um arquivo: não precisa iniciar um servidor de banco separado. Também é possível abrir esse arquivo com um visualizador SQLite. Ele é independente do MySQL do CotrimBot.

| Tabela | Conteúdo |
| --- | --- |
| `companies` | Empresa identificada pelo CNPJ informado. |
| `equipment` | Scanner e número de série, ligados à empresa. |
| `addresses` | Endereço ligado à empresa. |
| `sessions` | Etapa e respostas do preenchimento em andamento. |
| `tickets` | Chamados de teste confirmados, com os IDs dos cadastros e dados do solicitante. |
| `sdk_messages` | Textos enviados pelo SDK ao servidor simulado, inclusive perguntas. |

O progresso é salvo a cada etapa e retomado ao executar novamente. Existe uma única sessão de terminal local; esta demonstração não é um processador de múltiplos clientes. Digite `0` ou `cancelar` para confirmar cancelamento e descartar a sessão. Isso não apaga o histórico de mensagens do teste. No resumo, `2` reinicia o preenchimento para correção. Ctrl+C mantém o último progresso salvo.

Este primeiro teste cobre CNPJ, equipamento, endereço, nome, telefone, e-mail, descrição e gravação. Não implementa anexos, departamentos, editor visual, confirmação separada de CNPJ ou correção individual de campos do escopo completo anterior.

## Guia dos arquivos e do código

| Arquivo | Responsabilidade |
| --- | --- |
| `demo.mjs` | Inicia o banco e a API local; lê o teclado; decide as etapas; usa o SDK para responder. |
| `store.mjs` | Cria as tabelas e os cadastros iniciais; valida CNPJ/telefone; salva a sessão. |
| `sac-api.mjs` | Encapsula os GETs e o POST da API SAC simulada em funções fáceis de chamar. |
| `server.mjs` | Recebe as requisições HTTP, valida os dados e executa as consultas SQL. |
| `test.mjs` | Verifica automaticamente o caminho HTTP, as validações e a persistência. |

### Estado da conversa

No `demo.mjs`, `state` contém a memória da conversa:

```js
{
  step: 'equipment',           // Pergunta atual: escolher equipamento.
  data: {                     // Dados obtidos até aqui.
    companyId: 1,
    cnpj: '05540238000123'
  },
  requestId: 'identificador-unico-da-execucao'
}
```

O `while` repete a conversa: salva o estado, envia a pergunta, espera a resposta, valida e muda `step`. Uma resposta inválida mantém a etapa. As etapas são `cnpj → equipment → address → requester → phone → email → description → review`.

### Consultar não é criar um chamado

```js
const company = await sac.company(input);                  // GET da empresa.
const equipment = await sac.equipment(company.id);         // GET dos equipamentos.
const addresses = await sac.addresses(company.id);         // GET dos endereços.
const ticket = await sac.createTicket({ ...dados, requestId }); // POST após confirmar.
```

Essas chamadas passam pelo `fetch` no `sac-api.mjs`. O `server.mjs` traduz as rotas em `SELECT` ou `INSERT` no SQLite. Os IDs selecionados são enviados no POST; o servidor confere se equipamento e endereço pertencem à empresa.

### Onde o SDK entra

```js
const sdk = new CotrimBotClient({ baseUrl: server.baseUrl });
await sdk.messages.sendText(1, { text: 'Informe o CNPJ da empresa.' });
```

`baseUrl` aponta para o servidor local temporário. O SDK monta o `POST /api/contacts/1/send`. O servidor simulado grava a mensagem em `sdk_messages` e a exibe no terminal. Na versão conectada, esse destino seria o backend real, com autenticação e o ID correto do contato.

### O que seria adaptado para o SAC real

As funções em `sac-api.mjs` seriam ajustadas às rotas, autenticação, campos e respostas oficiais. O cadastro local deixaria de ser a fonte dessas consultas. A finalização só poderia informar um protocolo do SAC depois de receber uma confirmação real da API. A integração ao WhatsApp é uma etapa adicional à conexão com o SAC.

## Problemas comuns

| Mensagem ou situação | Como resolver |
| --- | --- |
| `node` não é reconhecido | Instale/configure Node.js 24 e reabra o terminal. |
| Não encontra `demo.mjs` | Execute o `cd` indicado acima antes do comando. |
| Não encontra `sdk/dist/index.js` | Rode `npm.cmd run build --workspace=@cotrimbot/sdk`. |
| `Cliente:` continua aparecendo | Você está dentro da conversa; responda ou use `0` e confirme `1` para encerrar. |
| Abriu direto em uma pergunta intermediária | Existe progresso salvo de uma execução anterior; continue ou cancele para começar novamente. |
| Não aparece nada no WhatsApp | Esperado nesta versão: a conversa acontece no terminal. |

## Verificação automatizada

```powershell
npm.cmd run build --workspace=@cotrimbot/sdk
node --test sdk/examples/sac-test/test.mjs
```

Os testes usam bancos temporários: verificam consultas, rejeição de dados inválidos, relacionamento entre cadastros, gravação idempotente, envio HTTP pelo SDK e persistência de sessão ao reabrir o SQLite.

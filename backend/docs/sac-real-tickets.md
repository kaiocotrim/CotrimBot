# Abertura de chamados no SAC pelo WhatsApp

Na Central de Bots, adicione o componente **Abrir chamado no SAC** ou altere o
tipo de ação da opção existente para esse valor. Salve e publique o bot para
usar a nova ação no WhatsApp. A ação `SAC_TICKET` é independente de `SAC_TEST`,
que mantém a coleta de demonstração anterior.

Configure `SAC_BASE_URL`, `SAC_API_TOKEN`, a instância Evolution e o segredo do
webhook conforme a instalação existente. Aplique as migrations e gere o cliente
Prisma antes de compilar. A migration `20261105193000_add_bot_sac_submission`
cria o controle de envio, sem modificar os cadastros existentes.

O bot consulta a empresa pelo CNPJ, confirma o cadastro e coleta nome, telefone,
endereço, e-mail, equipamento, setor e descrição do problema. Endereços e
equipamentos vêm do tenant retornado pelo SAC. O cliente pode cancelar com `0`
ou `cancelar` antes da abertura. Na revisão, `2` permite corrigir os dados e
`1` confirma o envio ao SAC.

O runtime chama `tickets.create` (POST `/api/newTicket`) usando o equipamento e
tenant selecionados e retorna o `Protocolo` da resposta. Não há criação antes da
confirmação. O simulador permite percorrer o mesmo fluxo, mas sua confirmação
final apenas informa que o teste terminou: nunca envia POST de criação.

Antes do POST, uma linha em `BotSacSubmission`, identificada pela mensagem que
iniciou a coleta, é gravada em uma conexão independente. O protocolo fica salvo
nessa linha antes de enviar a resposta no WhatsApp. Uma nova confirmação após
falha de envio reutiliza o protocolo, sem criar outro chamado.

Sem suporte de idempotência no SAC, um timeout ou resposta sem protocolo pode
deixar o resultado incerto. Nesse caso, o bot não repete o POST e encaminha o
atendimento para a equipe conferir no SAC. Uma recusa explícita (por exemplo,
403 por bloqueio financeiro) também encaminha o atendimento. Erros e tokens
internos não são exibidos ao cliente. Registros pendentes ou incertos precisam
de conferência manual antes de uma nova solicitação.

Validação automatizada: `npm run test:bots --workspace=@cotrimbot/backend`.
Os testes de criação usam uma API simulada, sem abrir chamados reais.

# Consulta de chamados e encaminhamento

A ação `SAC_LOOKUP` solicita somente o número do chamado. Após a consulta, mostra
o status e o nome do responsável retornados pelo SAC, seguidos de **1 — Solicitar
atendimento**, **2 — Consultar outro chamado** e **0 — Cancelar consulta**.
O comportamento é o mesmo para o telefone original e para outro número.

Para status **Atendido**, o bot informa que o chamado já foi atendido e está
finalizado, com somente **1 — Consultar outro chamado** e **0 — Voltar ao menu
principal**. Não oferece nem executa encaminhamento. Essa condição é conferida
novamente na confirmação, para evitar transferir um chamado finalizado depois da
consulta inicial. O status **Em atendimento** continua permitindo encaminhamento.

Como o SDK não oferece uma busca direta documentada por protocolo, o serviço
consulta `tenants.list()` para identificar as empresas acessíveis ao token.
Primeiro procura na visão agregada da Infordoc, quando disponível. Se não achar,
procura nas demais empresas usando `tickets.list(IdTenant)`, com até seis consultas
simultâneas, parando de iniciar consultas quando encontra o protocolo. O prazo
total é de 15 segundos. Não há consulta de chamados sem filtro de tenant.
Respostas repetidas recebidas na busca são aceitas somente quando o status e o
responsável coincidem. Falhas ou divergências nas consultas executadas interrompem
a busca em vez de mostrar um resultado possivelmente incorreto.

A API atual lista chamados por empresa, sem busca documentada por protocolo nem
paginação no SDK. Portanto um chamado ausente na resposta pode ser antigo e não
significa que não existe. A mensagem explica essa limitação e oferece solicitar
ajuda ao suporte (com o mesmo destino de apoio) ou iniciar outra consulta. Não há consulta
global sem filtro como alternativa, nem criação, reabertura ou alteração do chamado.

O resumo mostra somente status e responsável, conforme o fluxo definido para o
bot. Não expõe equipamento, série, observações internas, anexos, endereço, e-mail
nem motivo. A comparação do telefone é usada apenas para a nota interna: outro
número pode solicitar encaminhamento, mas a equipe deve confirmar sua autorização
antes de compartilhar detalhes adicionais. Saber o protocolo não autentica o
contato para acesso a esses outros dados.

Após consentimento, a consulta é refeita para usar o responsável atual. Na própria
opção **Consultar chamado**, o administrador informa o nome do técnico no SAC e
seleciona, na lista de membros da empresa, quem receberá a conversa. Exemplo:
**BRUNO ODORISSI CAMPANER → membro Bruno**. As mesmas regras ficam acessíveis em
Configurações e são compartilhadas por todas as consultas deste bot.

O destino vem desse vínculo explícito, mesmo se o nome da conta for diferente.
O bot não escolhe um membro por semelhança de nome. A comparação do nome do SAC
com o nome configurado ignora acentos, maiúsculas e espaços repetidos. Também é
possível configurar somente o primeiro nome, como **Bruno**, que identifica
**BRUNO ODORISSI CAMPANER**. A comparação é pelo primeiro nome inteiro, nunca por
substring. Um vínculo com o nome completo sempre tem prioridade sobre o apelido,
inclusive quando está desabilitado. Mais de um vínculo correspondente não gera
uma escolha presumida.
`Receber transferências` permite desabilitar um vínculo. A regra não depende de
a tela estar aberta ou de presença no WhatsApp. O simulador usa o mesmo vínculo
e valida o membro na organização do usuário autenticado, sem atribuir conversas
reais. A mensagem **InforBot | Atendimento Solicitado** confirma o encaminhamento
ao técnico responsável, quando esse destino está habilitado. A tecla 0 retorna
diretamente ao menu principal. O status e o nome do responsável nos detalhes são
preenchidos com os dados do chamado, sem fixar o protocolo do exemplo.

O destino é novamente validado na organização do bot. Membro removido, banido,
de outra organização ou o próprio bot não recebe a transferência. Sem destino
elegível, usa-se o membro de apoio configurado ou **Não atribuído** quando vazio.
O encaminhamento substitui as atribuições da conversa, pausa o bot e registra
uma nota privada com protocolo, técnico e necessidade de conferir
a autorização do contato. A nota não é enviada pelo WhatsApp. A confirmação
duplicada da mesma mensagem não cria outra nota nem outro encaminhamento.

Exemplo de configuração do fluxo:

```json
{
  "sacLookup": {
    "fallbackUserId": "",
    "technicians": [
      { "name": "Nome exato no SAC", "userId": "membro-local", "available": true }
    ]
  }
}
```

Na Central de Bots, selecione a opção **Consultar chamado** e configure os
vínculos no painel **Editar nó → Consulta de chamados no SAC**. Também é possível
usar **Configurações → Consulta de chamados no SAC**. Salve, teste e publique.
O botão **Preencher Kaio, Felype, Bruno e Thiago** adiciona os nomes ausentes e
pré-seleciona um membro somente se houver uma única correspondência pelo primeiro
nome na lista da empresa. Seleções existentes são preservadas. Se houver dois
membros com o mesmo primeiro nome, a seleção fica vazia para escolha manual.
Importação/exportação preserva as regras e remove vínculos com membros ausentes
na organização de destino. Se não houver um membro configurado e habilitado, o
atendimento segue para o destino de apoio, por padrão Não atribuído. O técnico
precisa ter um usuário no CotrimBot; a integração não cria contas automaticamente.
A configuração do membro que executa o bot continua independente.

O simulador usa o mesmo serviço de consulta, mas não atribui conversas, não grava
notas e não envia mensagens reais. Mostra o mesmo status e responsável que o
WhatsApp e permite conferir a oferta de encaminhamento. Sessões antigas que
estavam aguardando CNPJ voltam à pergunta do número do chamado.

Validação: `npm run test:bots --workspace=@cotrimbot/backend`. Os testes usam
respostas simuladas e cobrem consulta restrita às empresas acessíveis, retorno
mínimo para outro número, consentimento, atualização do técnico, fila sem atribuição, isolamento de
membros e confirmação duplicada.

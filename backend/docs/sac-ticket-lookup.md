# Consulta de chamados e encaminhamento

A ação `SAC_LOOKUP` solicita protocolo e CNPJ. Usa `check-tenant` para resolver
um único tenant e `tickets.list(IdTenant)` para localizar o protocolo na resposta.
Nenhuma consulta é feita sem tenant ou para vários tenants ao mesmo tempo.

A API atual lista chamados por empresa, sem busca documentada por protocolo nem
paginação no SDK. Portanto um chamado ausente na resposta pode ser antigo e não
significa que não existe. A mensagem explica essa limitação e oferece solicitar
ajuda ao suporte (com o mesmo destino de apoio) ou iniciar outra consulta. Não há consulta
global como alternativa, nem criação, reabertura ou alteração do chamado.

O resumo (situação, equipamento, série e técnico) aparece somente quando o telefone
da conversa coincide com o telefone registrado no chamado. O prefixo brasileiro
55 e a pontuação são normalizados; não se aceitam comparações por sufixo. O resumo
não mostra observações internas, anexos, endereço, e-mail nem motivo. Outro número
pode solicitar encaminhamento, mas a equipe deve confirmar sua autorização antes
de compartilhar dados. CNPJ e protocolo, isoladamente, não autenticam um contato.

Após consentimento, a consulta é refeita para usar o responsável atual. O nome do
técnico no SAC precisa estar associado explicitamente a um membro do CotrimBot,
nas configurações do bot. A disponibilidade é manual: `Receber transferências`.
Não depende de a tela estar aberta ou de presença no WhatsApp. A comparação de
nomes ignora acentos, maiúsculas e espaços nas extremidades, sem aproximações.
Nomes duplicados são rejeitados para evitar encaminhar à pessoa errada.

O destino é novamente validado na organização do bot. Membro removido, banido,
de outra organização ou o próprio bot não recebe a transferência. Sem destino
elegível, usa-se o membro de apoio configurado ou **Não atribuído** quando vazio.
O encaminhamento substitui as atribuições da conversa, pausa o bot e registra
uma nota privada com protocolo, CNPJ informado, técnico e necessidade de conferir
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

Na Central de Bots, adicione **Consultar chamado** e configure os vínculos em
**Configurações → Consulta de chamados no SAC**. Salve, teste e publique.
Importação/exportação preserva as regras e remove vínculos com membros ausentes
na organização de destino. Sem vínculos configurados, o atendimento segue para
Não atribuído. A configuração do membro que executa o bot continua independente.

O simulador usa o mesmo serviço de consulta, mas não atribui conversas, não grava
notas e não envia mensagens reais. Como não assume um telefone de cliente, não
exibe o resumo privado. O resultado permite conferir a oferta de encaminhamento.

Validação: `npm run test:bots --workspace=@cotrimbot/backend`. Os testes usam
respostas simuladas e cobrem consulta restrita ao tenant, proteção para outro
número, consentimento, atualização do técnico, fila sem atribuição, isolamento de
membros e confirmação duplicada.

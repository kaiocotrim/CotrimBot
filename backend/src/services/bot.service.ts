const SATISFACTION_SURVEY = `Olá! 😊

Queremos saber como foi sua experiência com o nosso atendimento.

De 0 a 10, qual nota você daria para o atendimento recebido?

😡 0
😠 1
😠 2
🙁 3
😕 4
😐 5
🙂 6
😊 7
😄 8
😁 9
😍 10

Responda apenas com o número da sua nota.

Sua opinião é muito importante para nós. 💙`;

// Fornece a pesquisa usada ao encerrar um atendimento com o bot.
export function getSatisfactionSurvey(): string {
  return SATISFACTION_SURVEY;
}

// Recebe a mensagem do usuário e decide qual resposta automática enviar.
export function getAutomaticReply(message: string): string | null {
  const text = message.toLowerCase().trim();

  if (text === "oi" || text === "olá" || text === "ola") {
    return "Olá! 👋 Como posso ajudar?";
  }

  if (text === "bom dia") {
    return SATISFACTION_SURVEY;
  }

  if (text === "boa tarde") {
    return "Boa tarde! 😄 Como posso ajudar?";
  }

  if (text === "avaliação" || text === "avaliacao") {
    return SATISFACTION_SURVEY;
  }

  // Se não reconhecer a mensagem, NÃO responde.
  return null;
}

export function isInforbotName(name: string | null | undefined): boolean {
  return name?.trim().toLocaleLowerCase("pt-BR") === "inforbot";
}

const SATISFACTION_SURVEY = `Olá! 😊

Como você avalia o atendimento que recebeu?

1 - Muito insatisfeito 😡
2 - Insatisfeito 🙁
3 - Neutro 😐
4 - Satisfeito 🙂
5 - Muito satisfeito 😍

Responda apenas com o número da sua nota (de 1 a 5).
Se quiser, pode incluir um comentário após a nota, por exemplo: "4 atendimento rápido".

Sua opinião é muito importante para nós. 💙`;

// Fornece a pesquisa usada ao encerrar um atendimento com o bot.
export function getSatisfactionSurvey(): string {
  return SATISFACTION_SURVEY;
}

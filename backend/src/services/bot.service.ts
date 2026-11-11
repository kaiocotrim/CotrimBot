import type { Prisma } from "../../generated/prisma/client.js";

export function isInforbotName(name: string | null | undefined): boolean {
  return name?.trim().toLocaleLowerCase("pt-BR") === "inforbot";
}

type BotUserDatabase = Pick<Prisma.TransactionClient, "member" | "user">;

export async function findInforbotUserId(
  database: BotUserDatabase,
  organizationId?: string | null,
): Promise<string | undefined> {
  if (organizationId) {
    const member = await database.member.findFirst({
      where: {
        organizationId,
        OR: [
          { displayName: "Inforbot" },
          { user: { name: "Inforbot" } },
        ],
      },
      select: { userId: true },
    });
    return member?.userId;
  }

  const user = await database.user.findFirst({
    where: { name: "Inforbot" },
    select: { id: true },
  });
  return user?.id;
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

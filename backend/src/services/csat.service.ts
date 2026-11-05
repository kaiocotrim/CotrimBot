import type { Prisma } from "../../generated/prisma/client.js";

// Modelo do Chatwoot: nota de 1 a 5, pontuação CSAT = % de notas 4 e 5.
export const CSAT_MIN_RATING = 1;
export const CSAT_MAX_RATING = 5;
export const CSAT_SATISFIED_MIN_RATING = 4;
export const CSAT_COMMENT_WINDOW_MS = 10 * 60 * 1000;

export type CsatDatabase = Pick<Prisma.TransactionClient, "csatSurvey">;

export type CsatReply = { rating: number; comment: string | null };

// Aceita "4" ou "4 ótimo atendimento". Outras mensagens seguem para o bot.
export function parseCsatRating(text: string): CsatReply | null {
  const match = /^\s*([1-5])(?:\s+([\s\S]*))?$/.exec(text);
  if (!match) return null;
  return { rating: Number(match[1]), comment: match[2]?.trim() || null };
}

// Um novo envio substitui a pesquisa pendente anterior do mesmo contato.
export async function createCsatSurvey(
  database: CsatDatabase,
  input: { contactId: number; messageId: number; sentByUserId: string },
) {
  await database.csatSurvey.updateMany({
    where: { contactId: input.contactId, status: "PENDING" },
    data: { status: "EXPIRED" },
  });
  return database.csatSurvey.create({ data: input });
}

// Retorna true quando a mensagem foi usada como nota ou comentário da pesquisa.
export async function recordCsatReply(
  database: CsatDatabase,
  input: { contactId: number; text: string; now?: Date },
): Promise<{ handled: boolean; rating?: number }> {
  const now = input.now ?? new Date();
  const survey = await database.csatSurvey.findFirst({
    where: { contactId: input.contactId, status: { in: ["PENDING", "ANSWERED"] } },
    orderBy: { sentAt: "desc" },
  });
  if (!survey) return { handled: false };

  if (survey.status === "PENDING") {
    const reply = parseCsatRating(input.text);
    if (!reply) return { handled: false };
    const updated = await database.csatSurvey.updateMany({
      where: { id: survey.id, status: "PENDING" },
      data: {
        status: "ANSWERED",
        rating: reply.rating,
        comment: reply.comment,
        answeredAt: now,
        commentUntil: reply.comment ? null : new Date(now.getTime() + CSAT_COMMENT_WINDOW_MS),
      },
    });
    return updated.count ? { handled: true, rating: reply.rating } : { handled: false };
  }

  const comment = input.text.trim();
  if (survey.comment !== null || !survey.commentUntil || survey.commentUntil <= now || !comment) {
    return { handled: false };
  }
  const updated = await database.csatSurvey.updateMany({
    where: { id: survey.id, comment: null },
    data: { comment, commentUntil: null },
  });
  return updated.count ? { handled: true } : { handled: false };
}

export type CsatSurveyRecord = {
  status: "PENDING" | "ANSWERED" | "EXPIRED";
  rating: number | null;
  comment: string | null;
};

export type CsatSummary = {
  sent: number;
  answered: number;
  pending: number;
  expired: number;
  responseRate: number;
  averageRating: number | null;
  satisfactionScore: number | null;
  commentsCount: number;
  distribution: Record<string, number>;
};

const percent = (part: number, total: number) => (total ? Math.round((part / total) * 1000) / 10 : 0);

// Calcula as métricas CSAT a partir das pesquisas enviadas.
export function summarizeCsat(surveys: CsatSurveyRecord[]): CsatSummary {
  const distribution: Record<string, number> = {};
  for (let rating = CSAT_MIN_RATING; rating <= CSAT_MAX_RATING; rating++) distribution[rating] = 0;

  let ratingSum = 0;
  let satisfied = 0;
  let commentsCount = 0;
  let answered = 0;
  let pending = 0;
  let expired = 0;

  for (const survey of surveys) {
    if (survey.status === "PENDING") pending++;
    if (survey.status === "EXPIRED") expired++;
    if (survey.status !== "ANSWERED" || survey.rating === null) continue;
    answered++;
    ratingSum += survey.rating;
    distribution[survey.rating] = (distribution[survey.rating] ?? 0) + 1;
    if (survey.rating >= CSAT_SATISFIED_MIN_RATING) satisfied++;
    if (survey.comment) commentsCount++;
  }

  return {
    sent: surveys.length,
    answered,
    pending,
    expired,
    responseRate: percent(answered, surveys.length),
    averageRating: answered ? Math.round((ratingSum / answered) * 100) / 100 : null,
    satisfactionScore: answered ? percent(satisfied, answered) : null,
    commentsCount,
    distribution,
  };
}

export async function getCsatMetrics(
  database: CsatDatabase,
  input: { from: Date; to: Date; recentLimit?: number },
) {
  const surveys = await database.csatSurvey.findMany({
    where: { sentAt: { gte: input.from, lte: input.to } },
    orderBy: { sentAt: "desc" },
    select: {
      id: true,
      status: true,
      rating: true,
      comment: true,
      sentAt: true,
      answeredAt: true,
      contact: { select: { id: true, name: true, phone: true, isGroup: true, isSaved: true } },
    },
  });

  const recentResponses = surveys
    .filter((survey) => survey.status === "ANSWERED")
    .slice(0, input.recentLimit ?? 20);

  return {
    period: { from: input.from, to: input.to },
    ...summarizeCsat(surveys),
    recentResponses,
  };
}

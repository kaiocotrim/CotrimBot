export type PollVote = { voterId: string; voterName: string | null; optionIndexes: number[]; updatedAt: string; voterAliases?: string[] };
export type Poll = { question: string; options: string[]; selectableCount: number; votes?: PollVote[] };

export function normalizePoll(value: unknown): Poll | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.question !== "string" || !Array.isArray(input.options)
    || input.options.some((option) => typeof option !== "string")) return null;
  const question = input.question.trim();
  const options = (input.options as string[]).map((option) => option.trim());
  const count = input.selectableCount;
  if (!question || question.length > 255 || options.length < 2 || options.length > 12
    || options.some((option) => !option || option.length > 100)
    || new Set(options.map((option) => option.toLocaleLowerCase("pt-BR"))).size !== options.length
    || typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > options.length) return null;
  return { question, options, selectableCount: count };
}

export function extractPoll(message: Record<string, any>): Poll | null {
  const poll = message.pollCreationMessageV3 ?? message.pollCreationMessageV2 ?? message.pollCreationMessage;
  if (!poll || !Array.isArray(poll.options)) return null;
  return normalizePoll({ question: poll.name, options: poll.options.map((option: any) => option?.optionName), selectableCount: poll.selectableOptionsCount || poll.options.length });
}

export function pollSummary(poll: Poll) {
  return `📊 ${poll.question}\n${poll.options.map((option) => `○ ${option}`).join("\n")}`;
}

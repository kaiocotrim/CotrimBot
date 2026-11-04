type ChatCompletionResponse = {
  choices?: Array<{
    finish_reason?: string | null;
    message?: { content?: string | null };
  }>;
};

export type ChatCompletion = {
  text: string;
  finishReason: string | null;
};

export function isAiConfigured() {
  return Boolean(process.env.AI_BASE_URL && process.env.AI_MODEL);
}

export async function chatCompletion(
  system: string,
  user: string,
  options: { temperature: number; maxTokens: number },
): Promise<ChatCompletion> {
  const baseUrl = process.env.AI_BASE_URL?.replace(/\/+$/, "");
  const model = process.env.AI_MODEL;
  if (!baseUrl || !model) throw new Error("A integração de IA ainda não foi configurada.");

  const apiKey = process.env.AI_API_KEY;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`O provedor de IA respondeu com status ${response.status}.`);

  const body = await response.json() as ChatCompletionResponse;
  const choice = body.choices?.[0];
  return {
    text: choice?.message?.content?.trim() ?? "",
    finishReason: choice?.finish_reason ?? null,
  };
}

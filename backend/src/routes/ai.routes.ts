import { Router } from "express";

export const aiRouter = Router();

type OpenAIResponse = {
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};

aiRouter.post("/ai/rewrite", async (request, response) => {
  const text = typeof request.body?.text === "string" ? request.body.text.trim() : "";

  if (!text) {
    response.status(400).json({ error: "Digite um texto para reformular." });
    return;
  }

  if (text.length > 5000) {
    response.status(400).json({ error: "O texto deve ter no máximo 5.000 caracteres." });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    response.status(503).json({ error: "A integração de IA ainda não foi configurada." });
    return;
  }

  try {
    const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
        instructions: "Reformule a mensagem em português do Brasil de forma clara, natural e resumida. Preserve o sentido, nomes e informações importantes. Retorne somente a mensagem final, sem explicações e sem aspas.",
        input: text,
        max_output_tokens: 500,
      }),
    });

    if (!openAIResponse.ok) {
      const details = await openAIResponse.text();
      console.error("Erro da OpenAI:", openAIResponse.status, details);
      response.status(502).json({ error: "Não foi possível reformular o texto agora." });
      return;
    }

    const result = await openAIResponse.json() as OpenAIResponse;
    const rewritten = result.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === "output_text")
      ?.text?.trim();

    if (!rewritten) {
      response.status(502).json({ error: "A IA não retornou um texto válido." });
      return;
    }

    response.json({ text: rewritten });
  } catch (error) {
    console.error("Erro ao reformular texto:", error);
    response.status(502).json({ error: "Não foi possível conectar ao serviço de IA." });
  }
});

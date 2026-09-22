import { Router } from "express";

export const aiRouter = Router();

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    response.status(503).json({ error: "A integração de IA ainda não foi configurada." });
    return;
  }

  try {
    const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
    const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: "Reformule a mensagem em português do Brasil de forma clara, natural e resumida. Preserve o sentido, nomes e informações importantes. Retorne somente a mensagem final, sem explicações e sem aspas." }],
        },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: { maxOutputTokens: 500, temperature: 0.3 },
      }),
    });

    if (!aiResponse.ok) {
      const details = await aiResponse.text();
      console.error("Erro do Gemini:", aiResponse.status, details);
      response.status(502).json({ error: "Não foi possível reformular o texto agora." });
      return;
    }

    const result = await aiResponse.json() as GeminiResponse;
    const rewritten = result.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();

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

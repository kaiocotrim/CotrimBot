import { Router } from "express";

export const aiRouter = Router();

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

const professionalRewriteInstruction = `Você é especialista em comunicação profissional para atendimento por WhatsApp.
Reescreva a mensagem em português do Brasil com clareza, cordialidade e profissionalismo, mantendo um tom humano e natural.

Regras:
- Corrija gramática, ortografia, pontuação e organização das ideias.
- Preserve a intenção e todos os dados do texto original, incluindo nomes, datas, horários, valores, links, números e compromissos.
- Seja objetivo, mas não resuma nem remova informações relevantes.
- Não invente informações, promessas, prazos, saudações ou despedidas que não estejam implícitos no texto.
- Evite formalidade excessiva, jargões, clichês e linguagem robótica.
- Preserve parágrafos ou listas quando eles ajudarem na leitura.
- Retorne somente a mensagem final, sem explicações, títulos, comentários ou aspas.`;

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
          parts: [{ text: professionalRewriteInstruction }],
        },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: { maxOutputTokens: 1500, temperature: 0.2 },
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

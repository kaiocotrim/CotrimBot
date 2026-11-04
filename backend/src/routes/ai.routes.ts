import { Router } from "express";
import { translateMessage } from "../controllers/translation.controller.js";
import { chatCompletion, isAiConfigured } from "../lib/ai-client.js";

export const aiRouter = Router();
aiRouter.post("/ai/translate", translateMessage);

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

  if (!isAiConfigured()) {
    response.status(503).json({ error: "A integração de IA ainda não foi configurada." });
    return;
  }

  try {
    const rewritten = (await chatCompletion(professionalRewriteInstruction, text, { temperature: 0.2, maxTokens: 1500 })).text;

    if (!rewritten) {
      response.status(502).json({ error: "A IA não retornou um texto válido." });
      return;
    }

    response.json({ text: rewritten });
  } catch (error) {
    console.error("Erro ao reformular texto:", error);
    response.status(502).json({ error: "Não foi possível reformular o texto agora." });
  }
});

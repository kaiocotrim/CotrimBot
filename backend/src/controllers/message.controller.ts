// Importa somente os tipos HTTP do Express usados nas assinaturas dos controllers.
import type { Request, Response } from "express";

// Importa a instância do Prisma usada para consultar contatos e salvar mensagens.
import { prisma } from "../lib/prisma.js";

// Importa o service que concentra toda a comunicação HTTP com a Evolution API.
import { sendWhatsAppMessage } from "../services/evolution.service.js";
import { getSatisfactionSurvey } from "../services/bot.service.js";

// GET /contacts/:id/messages - Retorna as mensagens de um contato
export async function getMessages(req: Request, res: Response) {
  const contactId = Number(req.params.id);

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
  });

  if (!contact) {
    return res.status(404).json({ message: "Contato não encontrado" });
  }

  const messages = await prisma.message.findMany({
    where: { contactId },
    orderBy: { createdAt: "asc" },
  });

  res.json(messages);
}

/**
 * Controller do POST /contacts/:id/send.
 *
 * Coordena o fluxo de envio sem conhecer os detalhes da requisição HTTP feita à
 * Evolution API: route -> controller -> service -> Evolution API. Depois que a
 * Evolution confirma o envio, o controller usa o Prisma para persistir a mensagem.
 */
export async function sendMessageToContact(req: Request, res: Response) {
  // O parâmetro :id identifica no banco qual contato receberá a mensagem.
  const contactId = Number(req.params.id);

  // O texto enviado pelo cliente da API é recebido no corpo JSON da requisição.
  const { text } = req.body;

  // Procuramos o contato antes do envio porque precisamos do telefone cadastrado.
  // Isso também impede uma chamada desnecessária à Evolution para um contato
  // inexistente e mantém a resposta 404 já utilizada pela aplicação.
  const contact = await prisma.contact.findUnique({
    where: {
      id: contactId,
    },
  });

  if (!contact) {
    return res.status(404).json({
      message: "Contato não encontrado",
    });
  }

  // Não tentamos enviar uma mensagem quando o texto não foi informado.
  if (!text) {
    return res.status(400).json({
      message: "Texto da mensagem é obrigatório",
    });
  }

  try {
    // O service recebe apenas telefone e texto e cuida de toda a comunicação HTTP
    // com a Evolution API, mantendo esse detalhe fora do controller.
    const evolutionResponse = await sendWhatsAppMessage(contact.phone, text);

    // externalId é o identificador único criado pelo WhatsApp/Evolution para a
    // mensagem. Ele permite relacionar o registro local ao envio externo.
    const externalId = evolutionResponse.key?.id;

    // Salvamos como OUTGOING porque a mensagem saiu do CotrimBot em direção ao
    // WhatsApp do contato, em vez de ter sido recebida pelo webhook.
    const message = await prisma.message.create({
      data: {
        externalId,
        content: text,
        direction: "OUTGOING",
        contactId: contact.id,
      },
    });

    // Mantém a resposta atual: registro local e resposta original da Evolution.
    return res.status(201).json({
      message,
      evolution: evolutionResponse,
    });
  } catch (error) {
    // Registra o erro técnico no backend, mas devolve ao cliente uma mensagem
    // estável sem expor detalhes internos da Evolution API ou do banco.
    console.error(error);

    return res.status(500).json({
      message: "Erro ao enviar mensagem",
    });
  }
}

// Envia a pesquisa de satisfação ao encerrar o atendimento com o bot.
export async function closeConversationWithBot(req: Request, res: Response) {
  const contactId = Number(req.params.id);
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });

  if (!contact) {
    return res.status(404).json({ message: "Contato não encontrado" });
  }

  try {
    const survey = getSatisfactionSurvey();
    const evolutionResponse = await sendWhatsAppMessage(contact.phone, survey);
    const externalId = evolutionResponse?.key?.id;

    if (!externalId) {
      throw new Error("A Evolution API não retornou o ID da mensagem");
    }

    const message = await prisma.message.create({
      data: {
        externalId,
        content: survey,
        direction: "OUTGOING",
        contactId,
      },
    });

    return res.status(201).json({ message, evolution: evolutionResponse });
  } catch (error) {
    console.error("Erro ao encerrar chamado com o bot:", error);
    return res.status(500).json({ message: "Erro ao enviar pesquisa de satisfação" });
  }
}

// PATCH /contacts/:id/messages/read - Marca as mensagens recebidas como lidas

export async function markMessagesAsRead(
  req: Request,
  res: Response
) {
  const contactId = Number(req.params.id);

  await prisma.message.updateMany({
    where: {
      contactId,
      direction: "INCOMING",
      readAt: null,
    },

    data: {
      readAt: new Date(),
    },
  });

  return res.status(200).json({
    message: "Mensagens marcadas como lidas",
  });
}

import {
  getMessageMedia,
  // seus outros controllers...
} from "../controllers/message.controller.js";


// Importa o Router do Express para agrupar as rotas relacionadas a mensagens.
import { Router } from "express";

// Importa os controllers responsáveis pelas regras executadas em cada rota.
// A rota apenas recebe a URL e direciona a requisição para o controller correto.
import {
  closeConversationWithBot,
  getMessages,
  sendMessageToContact,
  markMessagesAsRead,
} from "../controllers/message.controller.js";

// Cria o agrupador das rotas de mensagens.
// Esse router será registrado posteriormente no server.ts.
export const messageRouter = Router();

/**
 * GET /contacts/:id/messages
 *
 * Retorna todas as mensagens relacionadas a um contato,
 * normalmente em ordem cronológica.
 */
messageRouter.get(
  "/contacts/:id/messages",
  getMessages
);

/**
 * POST /contacts/:id/send
 *
 * Envia uma nova mensagem para o WhatsApp do contato
 * através da Evolution API e salva a mensagem no banco
 * como OUTGOING.
 */
messageRouter.post(
  "/contacts/:id/send",
  sendMessageToContact
);

// Encerra o atendimento enviando a pesquisa de satisfação do bot.
messageRouter.post(
  "/contacts/:id/close-with-bot",
  closeConversationWithBot
);

/**
 * PATCH /contacts/:id/messages/read
 *
 * Marca como lidas todas as mensagens INCOMING
 * desse contato que ainda possuem readAt = null.
 */
messageRouter.patch(
  "/contacts/:id/messages/read",
  markMessagesAsRead
);



// GET /messages/:id/media - Retorna o conteúdo de mídia de uma mensagem

messageRouter.get(
  "/messages/:id/media",
  getMessageMedia
);
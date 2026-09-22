// Router organiza os endpoints registrados por app.use(messageRouter) em server.ts.
import { Router } from "express";

// Multer processa multipart/form-data e disponibiliza o arquivo em req.file.
import { upload } from "../middlewares/upload.js";

// Cada controller recebe req e res, executa a operação e responde ao frontend.
// A extensão .js nos imports é necessária para os módulos ESM/NodeNext do projeto.
import {
  closeConversationWithBot,
  getMessageMedia,
  getGroupSenderAvatar,
  getMessages,
  markMessagesAsRead,
  reactToMessage,
  sendMediaToContact,
  sendMessageToContact,
  transcribeMessage,
} from "../controllers/message.controller.js";

export const messageRouter = Router();

// :id é um parâmetro da URL, recebido pelo controller em req.params.id.
// Em /contacts ele identifica o contato; em /messages identifica a mensagem.
// São IDs do banco do CotrimBot, não os IDs externos da Evolution API.

/**
 * GET /contacts/:id/messages
 * Consulta as mensagens do contato em páginas, da mais antiga para a mais recente.
 * Exemplo: /contacts/15/messages?limit=30&before=120.
 */
messageRouter.get("/contacts/:id/messages", getMessages);

/**
 * POST /contacts/:id/send
 * Recebe JSON: { "text": "Olá!" }.
 * Envia o texto pela Evolution API, salva como OUTGOING e notifica o frontend.
 */
messageRouter.post("/contacts/:id/send", sendMessageToContact);

/**
 * POST /contacts/:id/close-with-bot
 * Envia a pesquisa de satisfação do bot para encerrar o atendimento do contato.
 */
messageRouter.post("/contacts/:id/close-with-bot", closeConversationWithBot);

/**
 * PATCH /contacts/:id/messages/read
 * Marca as mensagens INCOMING ainda não lidas, preenchendo o campo readAt.
 */
messageRouter.patch("/contacts/:id/messages/read", markMessagesAsRead);

/**
 * GET /messages/:id/media
 * Busca a mídia original na Evolution usando o externalId da mensagem salva.
 * Devolve os bytes e o Content-Type para o navegador exibir ou tocar o arquivo.
 * O controller rejeita mensagens de texto, pois não possuem arquivo de mídia.
 */
messageRouter.get("/messages/:id/media", getMessageMedia);
messageRouter.get("/messages/:id/sender-avatar", getGroupSenderAvatar);
messageRouter.put("/messages/:id/reaction", reactToMessage);

/**
 * POST /messages/:id/transcribe
 * Busca o áudio de uma mensagem já salva e o envia ao microserviço Python.
 * Retorna { messageId, transcription }. Esta rota não recebe upload.
 */
messageRouter.post("/messages/:id/transcribe", transcribeMessage);

/**
 * POST /contacts/:id/send-media
 * Recebe multipart/form-data: um arquivo no campo "file" e "caption" opcional.
 * upload.single("file") executa antes do controller e preenche req.file.
 * Os campos de texto ficam em req.body; os bytes ficam em req.file.buffer.
 *
 * Implementação atual: valida a presença do arquivo e a existência do contato,
 * e retorna os dados do arquivo recebido. Ainda não envia à Evolution/WhatsApp.
 */
messageRouter.post(
  "/contacts/:id/send-media",
  upload.single("file"),
  sendMediaToContact
);

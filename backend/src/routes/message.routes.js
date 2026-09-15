// Importa o Router do Express para agrupar as rotas relacionadas a mensagens.
import { Router } from "express";
// Os controllers recebem a requisição, executam o fluxo necessário e produzem
// a resposta HTTP. A rota apenas escolhe qual controller será executado.
import { createMessage, getMessages, sendMessageToContact, } from "../controllers/message.controller.js";
// Cria o agrupador das rotas de mensagens registrado posteriormente no server.ts.
export const messageRouter = Router();
// Lista, em ordem cronológica, as mensagens pertencentes a um contato.
messageRouter.get("/contacts/:id/messages", getMessages);
// Registra manualmente uma mensagem para um contato existente.
messageRouter.post("/contacts/:id/messages", createMessage);
// Envia uma mensagem ao WhatsApp do contato pela Evolution API e, após o envio,
// registra essa mensagem no banco de dados.
messageRouter.post("/contacts/:id/send", sendMessageToContact);
//# sourceMappingURL=message.routes.js.map
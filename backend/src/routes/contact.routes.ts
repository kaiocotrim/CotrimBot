import { Router } from "express";
import {
  createContact,
  deleteContact,
  getContactAvatar,
  getContactById,
  getContacts,
  setContactArchived,
  subscribeContactPresence,
  updateContact,
} from "../controllers/contact.controller.js";

export const contactRouter = Router();

// GET /contacts - Retorna todos os contatos
contactRouter.get("/contacts", getContacts);

// GET /contacts/:id/avatar - Busca a foto do contato na Evolution API
contactRouter.get("/contacts/:id/avatar", getContactAvatar);

// POST /contacts/:id/presence-subscription - Assina o status de digitação no WhatsApp
contactRouter.post("/contacts/:id/presence-subscription", subscribeContactPresence);

// GET /contacts/:id - Retorna um contato especifico pelo ID
contactRouter.get("/contacts/:id", getContactById);

// POST /contacts - Cria um novo contato
contactRouter.post("/contacts", createContact);

// PATCH /contacts/:id - Atualiza um contato especifico pelo ID
contactRouter.patch("/contacts/:id", updateContact);
contactRouter.patch("/contacts/:id/archived", setContactArchived);

// DELETE /contacts/:id - Exclui um contato especifico pelo ID
contactRouter.delete("/contacts/:id", deleteContact);

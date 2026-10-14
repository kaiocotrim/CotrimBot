import { Router } from "express";
import {
  createContact,
  deleteContact,
  getContactAvatar,
  getContactAssignees,
  getContactById,
  getContactGroupParticipants,
  getContacts,
  setContactArchived,
  setContactPinned,
  setContactAssignment,
  setContactSaved,
  setContactPriority,
  subscribeContactPresence,
  updateContact,
} from "../controllers/contact.controller.js";

export const contactRouter = Router();

// GET /contacts - Retorna todos os contatos
contactRouter.get("/contacts", getContacts);
contactRouter.get("/contacts/assignees", getContactAssignees);

// GET /contacts/:id/avatar - Busca a foto do contato na Evolution API
contactRouter.get("/contacts/:id/avatar", getContactAvatar);
contactRouter.get("/contacts/:id/group-participants", getContactGroupParticipants);

// POST /contacts/:id/presence-subscription - Assina o status de digitação no WhatsApp
contactRouter.post("/contacts/:id/presence-subscription", subscribeContactPresence);

// GET /contacts/:id - Retorna um contato especifico pelo ID
contactRouter.get("/contacts/:id", getContactById);

// POST /contacts - Cria um novo contato
contactRouter.post("/contacts", createContact);

// PATCH /contacts/:id - Atualiza um contato especifico pelo ID
contactRouter.patch("/contacts/:id", updateContact);
contactRouter.patch("/contacts/:id/saved", setContactSaved);
contactRouter.patch("/contacts/:id/archived", setContactArchived);
contactRouter.patch("/contacts/:id/pinned", setContactPinned);
contactRouter.patch("/contacts/:id/assignment", setContactAssignment);
contactRouter.patch("/contacts/:id/priority", setContactPriority);

// DELETE /contacts/:id - Exclui um contato especifico pelo ID
contactRouter.delete("/contacts/:id", deleteContact);

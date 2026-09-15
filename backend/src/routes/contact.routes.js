import { Router } from "express";
import { createContact, deleteContact, getContactAvatar, getContactById, getContacts, updateContact, } from "../controllers/contact.controller.js";
export const contactRouter = Router();
// GET /contacts - Retorna todos os contatos
contactRouter.get("/contacts", getContacts);
// GET /contacts/:id/avatar - Busca a foto do contato na Evolution API
contactRouter.get("/contacts/:id/avatar", getContactAvatar);
// GET /contacts/:id - Retorna um contato especifico pelo ID
contactRouter.get("/contacts/:id", getContactById);
// POST /contacts - Cria um novo contato
contactRouter.post("/contacts", createContact);
// PATCH /contacts/:id - Atualiza um contato especifico pelo ID
contactRouter.patch("/contacts/:id", updateContact);
// DELETE /contacts/:id - Exclui um contato especifico pelo ID
contactRouter.delete("/contacts/:id", deleteContact);
//# sourceMappingURL=contact.routes.js.map
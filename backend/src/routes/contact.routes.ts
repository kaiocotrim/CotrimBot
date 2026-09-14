import { Router } from "express";
import {
  createContact,
  deleteContact,
  getContactById,
  getContacts,
  updateContact,
} from "../controllers/contact.controller.js";

export const contactRouter = Router();

// GET /contacts - Retorna todos os contatos
contactRouter.get("/contacts", getContacts);

// GET /contacts/:id - Retorna um contato especifico pelo ID
contactRouter.get("/contacts/:id", getContactById);

// POST /contacts - Cria um novo contato
contactRouter.post("/contacts", createContact);

// PATCH /contacts/:id - Atualiza um contato especifico pelo ID
contactRouter.patch("/contacts/:id", updateContact);

// DELETE /contacts/:id - Exclui um contato especifico pelo ID
contactRouter.delete("/contacts/:id", deleteContact);

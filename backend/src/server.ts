import express from "express";
import { prisma } from "./lib/prisma.js";

export const app = express();

app.use(express.json());

// GET /contacts - Ele retorna todos os contatos ok
app.get("/contacts", async (req, res) => {
  const contacts = await prisma.contact.findMany();

  res.json(contacts);
});


// POST /contacts - Ele cria um novo contato ok 
app.post("/contacts", async (req, res) => {
  const { name, phone } = req.body;

  const newContact = await prisma.contact.create({
    data: {
      name,
      phone,
    },
  });

  res.status(201).json(newContact);
});

// GEt /contacts/:id - Ele retorna um contato específico pelo ID
app.get("/contacts/:id", async (req, res) => {
  const id = Number(req.params.id);

  const contact = await prisma.contact.findUnique({
    where: { id },
  });

  if (!contact) {
    return res.status(404).json({ message: "Contato não encontrado" });
  }

  res.json(contact);
});

// PUT /contacts/:id - Ele atualiza um contato específico pelo ID ok 
app.patch("/contacts/:id", async (req, res) => {
  const id = Number(req.params.id);

  const { name, phone } = req.body;

  const contact = await prisma.contact.findUnique({
    where: {
      id,
    },
  });

  if (!contact) {
    return res.status(404).json({
      message: "Contato não encontrado",
    });
  }

  const updatedContact = await prisma.contact.update({
    where: {
      id,
    },
    data: {
      name,
      phone,
    },
  });

  res.json(updatedContact);
});

// DELETE /contacts/:id - Ele deleta um contato específico pelo ID
app.delete("/contacts/:id", async (req, res) => {
  const id = Number(req.params.id);

  const contact = await prisma.contact.findUnique({
    where: {
      id,
    },
  });

  if (!contact) {
    return res.status(404).json({
      message: "Contato não encontrado",
    });
  }

  await prisma.contact.delete({
    where: {
      id,
    },
  });

  res.status(204).send();
});

// POST /contacts/:id/messages - Ele cria uma nova mensagem para um contato específico ok 

app.post("/contacts/:id/messages", async (req, res) => {
  const contactId = Number(req.params.id);

  const { content, direction } = req.body;

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

  const message = await prisma.message.create({
    data: {
      content,
      direction,
      contactId,
    },
  });

  res.status(201).json(message);
});

// GET /contacts/:id/messages - Ele retorna todas as mensagens de um contato específico ok

app.get("/contacts/:id/messages", async (req, res) => {
  const contactId = Number(req.params.id);

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

  const messages = await prisma.message.findMany({
    where: {
      contactId,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  res.json(messages);
});

// Porta de escuta do servidor
app.listen(3333, () => {
  console.log("Servidor rodando em http://localhost:3333");
});
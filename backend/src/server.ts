import express from "express";
import { prisma } from "./lib/prisma.js";

const app = express();

app.use(express.json());

// GET /contacts - Ele retorna todos os contatos
app.get("/contacts", async (req, res) => {
  const contacts = await prisma.contact.findMany();

  res.json(contacts);
});


// POST /contacts - Ele cria um novo contato
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

// PUT /contacts/:id - Ele atualiza um contato específico pelo ID
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


// Porta de escuta do servidor
app.listen(3333, () => {
  console.log("Servidor rodando em http://localhost:3333");
});
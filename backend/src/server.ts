import express from "express";
import { prisma } from "./lib/prisma.js";
import webhookRoutes from "./routes/webhook.routes.js";
export const app = express();
import { sendWhatsAppMessage } from "./services/evolution.service.js";

app.use(express.json());
app.use(webhookRoutes);
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


// POST /contacts/:id/send - Ele envia uma mensagem para um contato específico via Evolution API

app.post("/contacts/:id/send", async (req, res) => {
  const contactId = Number(req.params.id);
  const { text } = req.body;

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

  if (!text) {
    return res.status(400).json({
      message: "Texto da mensagem é obrigatório",
    });
  }

  try {
    const evolutionResponse = await sendWhatsAppMessage(
      contact.phone,
      text
    );

    const externalId = evolutionResponse.key?.id;

    const message = await prisma.message.create({
      data: {
        externalId,
        content: text,
        direction: "OUTGOING",
        contactId: contact.id,
      },
    });

    return res.status(201).json({
      message,
      evolution: evolutionResponse,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao enviar mensagem",
    });
  }
});



// Porta de escuta do servidor
app.listen(3333, () => {
  console.log("Servidor rodando em http://localhost:3333");
});
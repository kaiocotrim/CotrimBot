import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";

import { setSocketServer } from "./lib/socket.js";
import { prisma } from "./lib/prisma.js";
import { getAllGroups } from "./services/evolution.service.js";

import { contactRouter } from "./routes/contact.routes.js";
import { messageRouter } from "./routes/message.routes.js";
import { transcriptionRouter } from "./routes/transcription.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import { aiRouter } from "./routes/ai.routes.js";

// Cria a aplicação Express.
export const app = express();

// Permite que o frontend do CotrimBot acesse o backend.
app.use(
  cors({
    origin: "http://localhost:3000",
  })
);

// Converte JSON recebido para req.body.
app.use(express.json());

// Registra as rotas da aplicação.
app.use("/api", contactRouter);
app.use("/api", messageRouter);
app.use("/api", webhookRoutes);
app.use("/api", transcriptionRouter);
app.use("/api", aiRouter);

// Cria o servidor HTTP que será compartilhado
// pelo Express e pelo Socket.IO.
const httpServer = createServer(app);

// Cria uma única instância do Socket.IO
// usando o mesmo servidor HTTP do Express.
export const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
  },
});

// Disponibiliza essa instância do Socket.IO
// para controllers e services da aplicação.
setSocketServer(io);

// Detecta quando um frontend se conecta.
io.on("connection", (socket) => {
  console.log(
    "Cliente conectado ao WebSocket:",
    socket.id
  );

  // Detecta quando o cliente fecha a conexão.
  socket.on("disconnect", () => {
    console.log(
      "Cliente desconectado do WebSocket:",
      socket.id
    );
  });
});

// Aponta para a pasta 'out' do seu projeto Next.js
const nextBuildPath = path.join(__dirname, '../../../frontend/out'); // Ajuste o caminho relativo

// Serve os arquivos estáticos (CSS, JS, imagens)
app.use(express.static(nextBuildPath));

// 3. Rota catch-all para Express 5+
// Use '(.*)' em vez de '*'
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(nextBuildPath, 'index.html'));
});

// No Dokploy, PORT define a porta; localmente usamos 3333.
// Express e Socket.IO usam essa mesma porta.
const port = Number(process.env.PORT ?? 3333);

httpServer.listen(port, () => {
  console.log(
    `Servidor rodando em http://localhost:${port}`
  );

  void getAllGroups()
    .then(async (groups) => {
      await Promise.all(groups.map((group) => {
        if (!group.id?.endsWith("@g.us")) return Promise.resolve();
        return prisma.contact.upsert({
          where: { phone: group.id },
          update: { name: group.subject?.trim() || "Grupo do WhatsApp", isGroup: true, ...(group.pictureUrl ? { profilePictureUrl: group.pictureUrl } : {}) },
          create: { name: group.subject?.trim() || "Grupo do WhatsApp", phone: group.id, isGroup: true, profilePictureUrl: group.pictureUrl ?? null },
        });
      }));
      console.log(`${groups.length} grupos sincronizados.`);
    })
    .catch((error) => console.error("Não foi possível sincronizar os grupos:", error));
});

import "./config/env.js";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";

import { setSocketServer } from "./lib/socket.js";
import { prisma } from "./lib/prisma.js";
import { auth } from "./lib/auth.js";
import { requireAuth } from "./middlewares/auth.middleware.js";
import { getAllGroups } from "./services/evolution.service.js";
import { userRoom } from "./services/notification.service.js";
import { processInBatches } from "./utils/batch.js";

import { contactRouter } from "./routes/contact.routes.js";
import { botRouter } from "./routes/bot.routes.js";
import { notificationRouter } from "./routes/notification.routes.js";
import { pushRouter } from "./routes/push.routes.js";
import { messageRouter } from "./routes/message.routes.js";
import { transcriptionRouter } from "./routes/transcription.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import { aiRouter } from "./routes/ai.routes.js";
import { invitationRouter } from "./routes/invitation.routes.js";
import { organizationRouter } from "./routes/organization.routes.js";
import { evolutionRouter } from "./routes/evolution.routes.js";
import { internalConversationRouter } from "./routes/internal-conversation.routes.js";
import { calendarEventRouter } from "./routes/calendar-event.routes.js";
import { scheduledMessageRouter } from "./routes/scheduled-message.routes.js";
import { clientRouter } from "./routes/client-profile.routes.js";
import { apiTokenRouter } from "./routes/api-token.routes.js";
import { startScheduledMessageWorker } from "./services/scheduled-message.service.js";
import { createContactTypingPresence } from "./services/contact-typing.service.js";

// Cria a aplicação Express.
export const app = express();

// Permite que o frontend do CotrimBot acesse o backend.
app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
    credentials: true,
  })
);

// O Better Auth precisa do corpo bruto da requisição; registrar antes do express.json().
app.all("/api/auth/*splat", toNodeHandler(auth));

// Converte JSON recebido para req.body.
app.use(express.json({ limit: "250mb" }));

// Registra as rotas da aplicação.
app.use("/api", webhookRoutes);
app.use("/api", invitationRouter);
app.use("/api", apiTokenRouter);
app.use("/api", requireAuth, organizationRouter);
app.use("/api", requireAuth, evolutionRouter);
app.use("/api", requireAuth, contactRouter);
app.use("/api", requireAuth, botRouter);
app.use("/api", requireAuth, notificationRouter);
app.use("/api", requireAuth, pushRouter);
app.use("/api", requireAuth, messageRouter);
app.use("/api", requireAuth, transcriptionRouter);
app.use("/api", requireAuth, aiRouter);
app.use("/api", requireAuth, internalConversationRouter);
app.use("/api", requireAuth, calendarEventRouter);
app.use("/api", requireAuth, scheduledMessageRouter);
app.use("/api", requireAuth, clientRouter);

// Compatibilidade com instalações da Evolution que ainda usam a URL antiga.
app.use(webhookRoutes);

// Cria o servidor HTTP que será compartilhado
// pelo Express e pelo Socket.IO.
const httpServer = createServer(app);

// Cria uma única instância do Socket.IO
// usando o mesmo servidor HTTP do Express.
export const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
    credentials: true,
  },
});

// Identifica o usuário pelo cookie de sessão para entregar notificações só a ele.
io.use(async (socket, next) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(socket.handshake.headers),
    });
    if (session) {
      socket.data.userId = session.user.id;
      socket.data.userName = session.user.name;
      socket.data.userImage = session.user.image ?? null;
    }
  } catch (error) {
    console.error("Erro ao autenticar o WebSocket:", error);
  }
  next();
});

// Disponibiliza essa instância do Socket.IO
// para controllers e services da aplicação.
setSocketServer(io);
const registerContactTyping = createContactTypingPresence(io, async (id) => Boolean(
  await prisma.contact.findUnique({ where: { id }, select: { id: true } }),
));

// Detecta quando um frontend se conecta.
io.on("connection", (socket) => {
  registerContactTyping(socket);
  if (socket.data.userId) void socket.join(userRoom(socket.data.userId));

  console.log(
    "Cliente conectado ao WebSocket:",
    socket.id
  );

  async function relayTyping(event: "internal:typing:start" | "internal:typing:stop", payload: unknown) {
    if (!socket.data.userId || !payload || typeof payload !== "object") return;
    const input = payload as { organizationId?: unknown; conversationId?: unknown };
    if (typeof input.organizationId !== "string" || typeof input.conversationId !== "string") return;
    const participant = await prisma.internalConversationParticipant.findFirst({
      where: {
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        userId: socket.data.userId,
      },
      select: { conversationId: true },
    });
    if (!participant) return;
    const recipients = await prisma.internalConversationParticipant.findMany({
      where: { organizationId: input.organizationId, conversationId: input.conversationId, userId: { not: socket.data.userId } },
      select: { userId: true },
    });
    for (const recipient of recipients) {
      io.to(userRoom(recipient.userId)).emit(event, {
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        userId: socket.data.userId,
      });
    }
  }

  socket.on("internal:typing:start", (payload) => void relayTyping("internal:typing:start", payload));
  socket.on("internal:typing:stop", (payload) => void relayTyping("internal:typing:stop", payload));

  // Detecta quando o cliente fecha a conexão.
  socket.on("disconnect", () => {
    console.log(
      "Cliente desconectado do WebSocket:",
      socket.id
    );
  });
});

// Aponta para a pasta exportada pelo Next.js.
const nextBuildPath = process.env.NODE_ENV === "production"
  ? "/app/frontend/out"
  : path.join(__dirname, "../../../frontend/out");

// O export estático do Next gera login.html; atende as duas formas da URL.
// app.get(/^\/login\/?$/, (_req, res) => {
//   res.sendFile(path.join(nextBuildPath, "login.html"));
// });

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

  startScheduledMessageWorker();

  void getAllGroups()
    .then(async (groups) => {
      await processInBatches(groups, (group) => {
        if (!group.id?.endsWith("@g.us")) return Promise.resolve();
        return prisma.contact.upsert({
          where: { phone: group.id },
          update: { name: group.subject?.trim() || "Grupo do WhatsApp", isGroup: true, ...(group.pictureUrl ? { profilePictureUrl: group.pictureUrl } : {}) },
          create: { name: group.subject?.trim() || "Grupo do WhatsApp", phone: group.id, isGroup: true, profilePictureUrl: group.pictureUrl ?? null },
        });
      });
      console.log(`${groups.length} grupos sincronizados.`);
    })
    .catch((error) => console.error("Não foi possível sincronizar os grupos:", error));
});

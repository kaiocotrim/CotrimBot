import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";

import { setSocketServer } from "./lib/socket.js";

import { contactRouter } from "./routes/contact.routes.js";
import { messageRouter } from "./routes/message.routes.js";
import { transcriptionRouter } from "./routes/transcription.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";

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
app.use(contactRouter);
app.use(messageRouter);
app.use(webhookRoutes);
app.use(transcriptionRouter);

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

// Inicia o servidor HTTP na porta 3333.
// Express e Socket.IO usam essa mesma porta.
httpServer.listen(3333, () => {
  console.log(
    "Servidor rodando em http://localhost:3333"
  );
});


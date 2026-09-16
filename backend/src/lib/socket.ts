import type { Server } from "socket.io";

// Guarda a instância do Socket.IO depois que o servidor iniciar.
let io: Server | null = null;

// Essa função será chamada pelo server.ts
// para disponibilizar o Socket.IO para o restante da aplicação.
export function setSocketServer(socketServer: Server) {
  io = socketServer;
}

// Controllers e services podem usar esta função
// para acessar o Socket.IO.
export function getSocketServer() {
  if (!io) {
    throw new Error("Socket.IO ainda não foi inicializado");
  }

  return io;
}
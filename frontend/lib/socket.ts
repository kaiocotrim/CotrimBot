import { io } from "socket.io-client";

// Cria o cliente Socket.IO,
// mas NÃO conecta automaticamente.
export const socket = io("http://localhost:3333", {
  autoConnect: false,
});
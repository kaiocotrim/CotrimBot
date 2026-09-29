import { io } from "socket.io-client";

// Em produção o Express serve o mesmo host; em dev aponta para o backend na porta 3333.
const SOCKET_URL = (process.env.NEXT_PUBLIC_API_URL ?? "/api").replace(/\/api\/?$/, "");

// Cria o cliente Socket.IO,
// mas NÃO conecta automaticamente.
export const socket = io(SOCKET_URL, {
  autoConnect: false,
  withCredentials: true,
});

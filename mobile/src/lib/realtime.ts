import { io } from 'socket.io-client';
import type { Api } from './api';

export function connectRealtime(api: Api) {
  return io(api.server, {
    transports: ['websocket'],
    extraHeaders: { Authorization: `Bearer ${api.token}` },
    reconnection: true,
  });
}

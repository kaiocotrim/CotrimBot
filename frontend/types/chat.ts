// Tipos compartilhados pelos componentes,
// pelo hook useChat e pelo cliente HTTP.

export type Contact = {
  id: number;
  name: string;
  phone: string;

  // Pode existir uma URL de foto,
  // ou null caso o WhatsApp não forneça.
  profilePictureUrl?: string | null;

  // Lista de mensagens associadas ao contato.
  // O ? significa que esse campo pode não vir
  // em algumas respostas da API.
  messages?: Message[];

  // Quantidade de mensagens INCOMING
  // que ainda não foram lidas.
  unreadCount: number;
};

export type Message = {
  // ID interno do MySQL/CotrimBot.
  id: number;

  // ID original da mensagem no WhatsApp/Evolution.
  externalId: string;

  // Texto da mensagem.
  content: string;

  // Direção da mensagem.
  direction: "INCOMING" | "OUTGOING";

  // Contato ao qual a mensagem pertence.
  contactId: number;

  // Quando a mensagem foi salva/criada.
  createdAt: string;

  // Quando a mensagem foi lida.
  // null = ainda não foi lida.
  // string = data/hora em que foi lida.
  readAt: string | null;
};

export type ContactAvatar = {
  profilePictureUrl: string | null;
};
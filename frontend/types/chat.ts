// Tipos compartilhados pelos componentes,
// pelo hook useChat e pelo cliente HTTP.

export type Contact = {
  id: number;
  name: string;
  phone: string;
  isGroup: boolean;
  archived: boolean;

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

  // Define como o conteúdo será renderizado: texto, áudio ou outra mídia.
  type: "TEXT" | "AUDIO" | "IMAGE" | "STICKER" | "VIDEO" | "DOCUMENT";

  // Observação interna visível apenas no CotrimBot.
  private?: boolean;

  // Contato ao qual a mensagem pertence.
  contactId: number;

  // Quando a mensagem foi salva/criada.
  createdAt: string;

  // Quando a mensagem foi lida.
  // null = ainda não foi lida.
  // string = data/hora em que foi lida.
  readAt: string | null;
  reaction: string | null;
  senderName: string | null;
  senderPhone: string | null;
  senderProfilePictureUrl: string | null;
  quotedExternalId?: string | null;
  quotedMessageId?: number | null;
  quotedContent?: string | null;
  quotedSenderName?: string | null;

  // Estado local usado enquanto um encaminhamento acontece em segundo plano.
  // Mensagens vindas da API não precisam preencher este campo.
  deliveryStatus?: "sending" | "sent" | "failed";

  // Mantém a mesma identidade visual entre a criação otimista e a
  // confirmação recebida da API/WebSocket.
  clientId?: string;
};

export type MessagesPage = {
  messages: Message[];
  hasMore: boolean;
  nextCursor: number | null;
};

export type ContactAvatar = {
  profilePictureUrl: string | null;
};

/**
 * Envia uma mensagem de texto pela Evolution API.
 *
 * Este service isola URL, autenticação, endpoint, headers e tratamento da resposta.
 * Assim, o controller coordena o caso de uso sem implementar comunicação HTTP.
 */
export async function sendWhatsAppMessage(
  number: string,
  text: string
) {
  // As credenciais e a instância vêm do ambiente, podendo variar por execução
  // sem que dados de configuração fiquem fixos no código-fonte.
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  // Os três valores são obrigatórios para montar uma chamada válida à Evolution.
  if (!apiUrl || !apiKey || !instance) {
    throw new Error("Configuração da Evolution API incompleta");
  }

  // Esta é a única comunicação HTTP necessária para enviar a mensagem.
  const response = await fetch(
    `${apiUrl}/message/sendText/${instance}`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },

      body: JSON.stringify({
        number,
        text,
      }),
    }
  );

  // Transforma uma resposta HTTP de falha em exceção; o controller decide como
  // representar essa falha na resposta do endpoint do CotrimBot.
  if (!response.ok) {
    const error = await response.text();

    throw new Error(
      `Erro ao enviar mensagem pela Evolution: ${error}`
    );
  }

  // A resposta inclui key.id, identificador externo usado ao persistir a mensagem.
  return response.json();
}

export async function sendWhatsAppReaction(input: {
  remoteJid: string;
  fromMe: boolean;
  id: string;
  reaction: string;
}) {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  if (!apiUrl || !apiKey || !instance) throw new Error("Configuração da Evolution API incompleta");

  const response = await fetch(`${apiUrl}/message/sendReaction/${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({
      key: { remoteJid: input.remoteJid, fromMe: input.fromMe, id: input.id },
      reaction: input.reaction,
    }),
  });
  if (!response.ok) throw new Error(`Erro ao enviar reação pela Evolution: ${await response.text()}`);
  return response.json();
}

export async function archiveWhatsAppChat(input: {
  chat: string;
  archive: boolean;
  lastMessage?: { id: string; fromMe: boolean };
}) {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  if (!apiUrl || !apiKey || !instance) throw new Error("Configuração da Evolution API incompleta");

  const body = {
    chat: input.chat,
    archive: input.archive,
    ...(input.lastMessage ? {
      lastMessage: {
        key: {
          remoteJid: input.chat,
          fromMe: input.lastMessage.fromMe,
          id: input.lastMessage.id,
        },
      },
    } : {}),
  };
  const response = await fetch(`${apiUrl}/chat/archiveChat/${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Erro ao arquivar conversa: ${response.status} - ${await response.text()}`);
  return response.json();
}

type ProfilePictureResponse = {
  profilePictureUrl?: string | null;
};

type GroupInfoResponse = {
  id?: string;
  subject?: string;
  pictureUrl?: string | null;
};

export async function getAllGroups(): Promise<GroupInfoResponse[]> {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!apiUrl || !apiKey || !instance) {
    throw new Error("Configuração da Evolution API incompleta");
  }

  const response = await fetch(`${apiUrl}/group/fetchAllGroups/${instance}?getParticipants=false`, {
    headers: { apikey: apiKey },
  });
  if (!response.ok) {
    throw new Error(`Erro ao buscar grupos: ${response.status}`);
  }

  const result = await response.json() as GroupInfoResponse[] | { data?: GroupInfoResponse[] };
  return Array.isArray(result) ? result : result.data ?? [];
}

/** Busca o nome atual de um grupo do WhatsApp. */
export async function getGroupInfo(groupJid: string): Promise<GroupInfoResponse> {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!apiUrl || !apiKey || !instance) {
    throw new Error("Configuração da Evolution API incompleta");
  }

  const params = new URLSearchParams({ groupJid, getParticipants: "false" });
  const response = await fetch(`${apiUrl}/group/findGroupInfos/${instance}?${params}`, {
    headers: { apikey: apiKey },
  });

  if (!response.ok) {
    throw new Error(`Erro ao buscar dados do grupo: ${response.status}`);
  }

  return (await response.json()) as GroupInfoResponse;
}

/** Busca a URL da foto de perfil de um contato na Evolution API. */
export async function getProfilePicture(
  number: string
): Promise<ProfilePictureResponse> {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!apiUrl || !apiKey || !instance) {
    throw new Error("Configuração da Evolution API incompleta");
  }

  const response = await fetch(
    `${apiUrl}/chat/fetchProfilePictureUrl/${instance}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({ number }),
    }
  );

  if (!response.ok) {
    const error = await response.text();

    throw new Error(`Erro ao buscar foto de perfil: ${error}`);
  }

  return (await response.json()) as ProfilePictureResponse;
}



export type EvolutionMediaResponse = {
  mediaType: string;
  fileName?: string;
  mimetype: string;
  base64: string;
};

// Busca a mídia original de uma mensagem
// diretamente na Evolution API.
export async function getMediaMessage(
  externalId: string
): Promise<EvolutionMediaResponse> {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!apiUrl || !apiKey || !instance) {
    throw new Error(
      "Configurações da Evolution API não encontradas"
    );
  }

  const response = await fetch(
    `${apiUrl}/chat/getBase64FromMediaMessage/${instance}`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },

      body: JSON.stringify({
        message: {
          key: {
            id: externalId,
          },
        },

        convertToMp4: false,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Erro ao buscar mídia na Evolution: ${response.status}`
    );
  }

  const data =
    (await response.json()) as EvolutionMediaResponse;


  if (!data.base64) {
    throw new Error(
      "A Evolution não retornou o conteúdo da mídia"
    );
  }

  return data;
}



// Envia uma mídia para um contato via WhatsApp, usando a Evolution API.

type SendMediaInput = {
  number: string;
  mediatype: "image" | "video" | "document" | "audio";
  mimetype: string;
  media: string;
  fileName: string;
  caption?: string;
};
export async function sendWhatsAppMedia({
  number,
  mediatype,
  mimetype,
  media,
  fileName,
  caption = "",
}: SendMediaInput) {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!apiUrl || !apiKey || !instance) {
    throw new Error(
      "Configurações da Evolution API não encontradas"
    );
  }

  const response = await fetch(
    `${apiUrl}/message/sendMedia/${instance}`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },

      body: JSON.stringify({
        number,
        mediatype,
        mimetype,
        media,
        fileName,
        caption,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();

    throw new Error(
      `Erro ao enviar mídia pela Evolution: ${response.status} - ${error}`
    );
  }

  return response.json();
}

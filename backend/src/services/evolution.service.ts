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

type ProfilePictureResponse = {
  profilePictureUrl?: string | null;
};

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
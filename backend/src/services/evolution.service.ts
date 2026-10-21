/**
 * Envia uma mensagem de texto pela Evolution API.
 *
 * Este service isola URL, autenticação, endpoint, headers e tratamento da resposta.
 * Assim, o controller coordena o caso de uso sem implementar comunicação HTTP.
 */
export async function sendWhatsAppMessage(
  number: string,
  text: string,
  quoted?: { externalId: string; content: string; fromMe: boolean }
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
      signal: AbortSignal.timeout(15000),
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },

      body: JSON.stringify({
        number,
        text,
        ...(quoted ? {
          quoted: {
            key: { id: quoted.externalId, fromMe: quoted.fromMe },
            message: { conversation: quoted.content },
          },
        } : {}),
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

export async function sendWhatsAppPoll(number: string, poll: { question: string; options: string[]; selectableCount: number }) {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  if (!apiUrl || !apiKey || !instance) throw new Error("Configuração da Evolution API incompleta");
  const response = await fetch(`${apiUrl}/message/sendPoll/${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ number, name: poll.question, values: poll.options, selectableCount: poll.selectableCount }),
  });
  if (!response.ok) throw new Error(`Erro ao enviar enquete pela Evolution: ${response.status}`);
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

export async function deleteWhatsAppMessage(input: {
  remoteJid: string;
  fromMe: boolean;
  id: string;
  participant?: string;
}) {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  if (!apiUrl || !apiKey || !instance) throw new Error("Configuração da Evolution API incompleta");

  const response = await fetch(`${apiUrl}/chat/deleteMessageForEveryone/${instance}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`Erro ao apagar mensagem pela Evolution: ${response.status} - ${await response.text()}`);
  }
  return response.json();
}

async function requestEvolutionInstance(path: string, method = "GET") {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  if (!apiUrl || !apiKey || !instance) throw new Error("Configuração da Evolution API incompleta");

  const response = await fetch(`${apiUrl.replace(/\/$/, "")}${path}/${encodeURIComponent(instance)}`, {
    method,
    headers: { apikey: apiKey },
  });
  if (!response.ok) {
    throw new Error(`Evolution respondeu ${response.status}: ${await response.text()}`);
  }
  return { instance, data: await response.json() as unknown };
}

export function getWhatsAppConnectionState() {
  return requestEvolutionInstance("/instance/connectionState");
}

export function getWhatsAppQrCode() {
  return requestEvolutionInstance("/instance/connect");
}

export function logoutWhatsAppInstance() {
  return requestEvolutionInstance("/instance/logout", "DELETE");
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

/**
 * Assina as atualizações de presença de um contato no WhatsApp.
 *
 * Usa a extensão da imagem 2.3.7 para assinar os aliases PN/LID conhecidos.
 * Não envia estados de digitação ou áudio para o contato.
 */
export async function subscribeWhatsAppPresence(number: string, aliases: string[] = []): Promise<void> {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!apiUrl || !apiKey || !instance) {
    throw new Error("Configuração da Evolution API incompleta");
  }

  const response = await fetch(`${apiUrl}/chat/subscribePresence/${encodeURIComponent(instance)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify({
      number,
      aliases: [...new Set(aliases)].filter((alias) => alias !== number).slice(0, 1),
    }),
  });

  if (!response.ok) {
    throw new Error(response.status === 404
      ? "A imagem Evolution precisa da extensão de assinatura de presença."
      : `Erro ao assinar presença: HTTP ${response.status}`);
  }
}

type ProfilePictureResponse = {
  profilePictureUrl?: string | null;
};

type GroupInfoResponse = {
  id?: string;
  subject?: string;
  pictureUrl?: string | null;
  participants?: Array<{
    id?: string;
    lid?: string;
    phoneNumber?: string;
    admin?: string | null;
  }>;
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

/** Busca os dados atuais de um grupo do WhatsApp. */
export async function getGroupInfo(groupJid: string, getParticipants = false): Promise<GroupInfoResponse> {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!apiUrl || !apiKey || !instance) {
    throw new Error("Configuração da Evolution API incompleta");
  }

  const params = new URLSearchParams({ groupJid, getParticipants: String(getParticipants) });
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
  quoted?: { externalId: string; content: string; fromMe: boolean };
};
export async function sendWhatsAppMedia({
  number,
  mediatype,
  mimetype,
  media,
  fileName,
  caption = "",
  quoted,
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
      signal: AbortSignal.timeout(15000),

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
        ...(quoted ? {
          quoted: {
            key: { id: quoted.externalId, fromMe: quoted.fromMe },
            message: { conversation: quoted.content },
          },
        } : {}),
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

const EVOLUTION_SETTINGS_TIMEOUT_MS = 10_000;

export const DEFAULT_CALL_REJECTION_MESSAGE =
  "Olá! Agradecemos seu contato. No momento, nosso atendimento é realizado exclusivamente por mensagens, por isso não recebemos ligações. Por favor, envie sua solicitação por aqui.";

type EvolutionInstanceSettings = {
  rejectCall: boolean;
  msgCall?: string;
  groupsIgnore: boolean;
  alwaysOnline: boolean;
  readMessages: boolean;
  readStatus: boolean;
  syncFullHistory: boolean;
  wavoipToken?: string;
};

export type WhatsAppCallSettings = {
  rejectCall: boolean;
  msgCall: string;
};

export type EvolutionSettingsErrorCode =
  | "configuration"
  | "authentication"
  | "timeout"
  | "unavailable"
  | "invalid_response"
  | "not_confirmed";

export class EvolutionSettingsError extends Error {
  constructor(public readonly code: EvolutionSettingsErrorCode, message: string) {
    super(message);
    this.name = "EvolutionSettingsError";
  }
}

function getEvolutionSettingsConfig() {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!apiUrl || !apiKey || !instance) {
    throw new EvolutionSettingsError("configuration", "Configuração da Evolution API incompleta.");
  }

  return { apiUrl: apiUrl.replace(/\/$/, ""), apiKey, instance };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEvolutionSettings(value: unknown): EvolutionInstanceSettings {
  const candidate = isRecord(value) && isRecord(value.settings) ? value.settings : value;
  if (!isRecord(candidate)) {
    throw new EvolutionSettingsError("invalid_response", "A Evolution API retornou configurações inválidas.");
  }

  const requiredBooleans = [
    "rejectCall",
    "groupsIgnore",
    "alwaysOnline",
    "readMessages",
    "readStatus",
    "syncFullHistory",
  ] as const;

  for (const field of requiredBooleans) {
    if (typeof candidate[field] !== "boolean") {
      throw new EvolutionSettingsError(
        "invalid_response",
        `A Evolution API não retornou a configuração obrigatória ${field}.`,
      );
    }
  }

  if (candidate.msgCall !== undefined && typeof candidate.msgCall !== "string") {
    throw new EvolutionSettingsError("invalid_response", "A Evolution API retornou uma mensagem de chamada inválida.");
  }
  if (candidate.wavoipToken !== undefined && typeof candidate.wavoipToken !== "string") {
    throw new EvolutionSettingsError("invalid_response", "A Evolution API retornou uma configuração de chamada inválida.");
  }

  return {
    rejectCall: candidate.rejectCall as boolean,
    groupsIgnore: candidate.groupsIgnore as boolean,
    alwaysOnline: candidate.alwaysOnline as boolean,
    readMessages: candidate.readMessages as boolean,
    readStatus: candidate.readStatus as boolean,
    syncFullHistory: candidate.syncFullHistory as boolean,
    ...(candidate.msgCall !== undefined ? { msgCall: candidate.msgCall } : {}),
    ...(candidate.wavoipToken !== undefined ? { wavoipToken: candidate.wavoipToken } : {}),
  };
}

async function requestEvolutionSettings(method: "GET" | "POST", body?: EvolutionInstanceSettings) {
  const { apiUrl, apiKey, instance } = getEvolutionSettingsConfig();

  try {
    const response = await fetch(
      `${apiUrl}/settings/${method === "GET" ? "find" : "set"}/${encodeURIComponent(instance)}`,
      {
        method,
        headers: {
          apikey: apiKey,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(EVOLUTION_SETTINGS_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      const code = response.status === 401 || response.status === 403
        ? "authentication"
        : response.status >= 500
          ? "unavailable"
          : "invalid_response";
      throw new EvolutionSettingsError(code, `A Evolution API recusou a operação (${response.status}).`);
    }

    // O endpoint /settings/set pode confirmar com 201 e corpo vazio em algumas
    // instalações da Evolution 2.3.7. O resultado efetivo é validado pelo GET
    // executado logo depois, portanto não dependemos do corpo do POST.
    if (method === "POST") return null;

    return await response.json() as unknown;
  } catch (error) {
    if (error instanceof EvolutionSettingsError) throw error;
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new EvolutionSettingsError("timeout", "A Evolution API demorou demais para responder.");
    }
    throw new EvolutionSettingsError("unavailable", "Não foi possível conectar à Evolution API.");
  }
}

async function findEvolutionSettings() {
  return parseEvolutionSettings(await requestEvolutionSettings("GET"));
}

export async function getWhatsAppCallSettings(): Promise<WhatsAppCallSettings> {
  const settings = await findEvolutionSettings();
  return {
    rejectCall: settings.rejectCall,
    msgCall: settings.msgCall ?? "",
  };
}

export async function updateWhatsAppCallSettings(
  input: WhatsAppCallSettings,
): Promise<WhatsAppCallSettings> {
  // A Evolution 2.3.7 exige todos os booleanos do objeto de configurações.
  // Ler e mesclar antes do POST evita redefinir preferências não relacionadas.
  const current = await findEvolutionSettings();
  const next: EvolutionInstanceSettings = {
    ...current,
    rejectCall: input.rejectCall,
    msgCall: input.msgCall,
  };

  await requestEvolutionSettings("POST", next);

  // O painel só recebe sucesso depois de reler o valor persistido pela Evolution.
  const confirmed = await getWhatsAppCallSettings();
  if (confirmed.rejectCall !== input.rejectCall || confirmed.msgCall !== input.msgCall) {
    throw new EvolutionSettingsError(
      "not_confirmed",
      "A Evolution API não confirmou as configurações de chamadas.",
    );
  }

  return confirmed;
}

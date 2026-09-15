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

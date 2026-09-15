export async function sendWhatsAppMessage(
  number: string,
  text: string
) {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!apiUrl || !apiKey || !instance) {
    throw new Error("Configuração da Evolution API incompleta");
  }

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

  if (!response.ok) {
    const error = await response.text();

    throw new Error(
      `Erro ao enviar mensagem pela Evolution: ${error}`
    );
  }

  return response.json();
}
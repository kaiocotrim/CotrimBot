// Esta função recebe a mensagem enviada pelo usuário
// e decide qual resposta o CotrimBot deve enviar.
export function getAutomaticReply(message) {
    const text = message.toLowerCase().trim();
    if (text === "oi" || text === "olá" || text === "ola") {
        return "Olá! 👋 Como posso ajudar?";
    }
    if (text === "bom dia") {
        return "Bom dia! ☀️ Como posso ajudar?";
    }
    if (text === "boa tarde") {
        return "Boa tarde! 😄 Como posso ajudar?";
    }
    if (text === "Avaliação" || text === "avaliacao") {
        return "Avaliação recebida! Avalie nosso serviço de 0 a 5 estrelas. 🌟";
    }
    // Se não reconhecer a mensagem, NÃO responde.
    return null;
}
//# sourceMappingURL=bot.service.js.map
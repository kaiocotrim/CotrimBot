type AudioMessageProps = {
  // URL da rota do backend que entrega o arquivo de áudio.
  mediaUrl: string;
};

// Responsável somente por renderizar mensagens do tipo AUDIO.
// O MessageBubble decide quando usar este componente e fornece a URL.
export function AudioMessage({ mediaUrl }: AudioMessageProps) {
  return (
    // Os controles são nativos do navegador. preload="none" evita
    // baixar o áudio antecipadamente ao abrir a conversa.
    <audio
      controls
      preload="none"
      src={mediaUrl}
      className="max-w-full"
      aria-label="Áudio da mensagem"
    >
      Seu navegador não suporta a reprodução de áudio.
    </audio>
  );
}

type TextMessageProps = {
  content: string;
};

export function TextMessage({ content }: TextMessageProps) {
  // Preserva as quebras de linha do texto recebido.
  return <p className="whitespace-pre-wrap">{content}</p>;
}

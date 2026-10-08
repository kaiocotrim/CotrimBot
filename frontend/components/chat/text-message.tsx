import { MessageText } from "@/components/chat/message-text";

type TextMessageProps = {
  content: string;
  showSignature?: boolean;
};

export function TextMessage({ content, showSignature = false }: TextMessageProps) {
  // Preserva as quebras de linha do texto recebido.
  return <p className="cursor-text break-words whitespace-pre-wrap [overflow-wrap:anywhere]"><MessageText content={content} showSignature={showSignature} /></p>;
}

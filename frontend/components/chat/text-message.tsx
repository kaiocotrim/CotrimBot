import { MessageText } from "@/components/chat/message-text";

type TextMessageProps = {
  content: string;
};

export function TextMessage({ content }: TextMessageProps) {
  // Preserva as quebras de linha do texto recebido.
  return <p className="cursor-text break-words whitespace-pre-wrap [overflow-wrap:anywhere]"><MessageText content={content} /></p>;
}

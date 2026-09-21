import { EmojiText } from "@/components/chat/emoji-text";

type TextMessageProps = {
  content: string;
};

export function TextMessage({ content }: TextMessageProps) {
  // Preserva as quebras de linha do texto recebido.
  return <p className="cursor-text break-words whitespace-pre-wrap [overflow-wrap:anywhere]"><EmojiText content={content} /></p>;
}

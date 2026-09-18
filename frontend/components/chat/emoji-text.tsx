"use client";

import Image from "next/image";
import { useState } from "react";
import { splitEmojiText } from "@/lib/emoji-text";

function EmojiGlyph({ emoji, unified, preserveMetrics }: { emoji: string; unified: string; preserveMetrics: boolean }) {
  const [failed, setFailed] = useState(false);
  // Emojis recentes ou imagens indisponíveis continuam legíveis como Unicode.
  if (failed) return <>{emoji}</>;
  const image = (
    <Image
      src={`https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${unified}.png`}
      alt={emoji}
      width={20}
      height={20}
      unoptimized
      draggable={false}
      onError={() => setFailed(true)}
      className={preserveMetrics ? "absolute top-1/2 left-0 h-[1.25em] w-full -translate-y-1/2 object-contain" : "mx-[0.04em] inline-block h-[1.25em] w-[1.25em] align-[-0.2em]"}
    />
  );
  if (!preserveMetrics) return image;
  // A posição do cursor continua seguindo o espaço ocupado pelo emoji Unicode.
  // A imagem muda o desenho sem modificar a largura medida pelo textarea.
  return <span className="relative inline-block align-baseline whitespace-nowrap"><span className="opacity-0">{emoji}</span>{image}</span>;
}

// Compartilha o mesmo desenho de emojis entre mensagens, legendas e prévias.
export function EmojiText({ content, preserveMetrics = false }: { content: string; preserveMetrics?: boolean }) {
  return <>{splitEmojiText(content).map((part, index) => part.kind === "emoji" && part.unified ? <EmojiGlyph key={`${index}-${part.unified}`} emoji={part.value} unified={part.unified} preserveMetrics={preserveMetrics} /> : part.value)}</>;
}

import { Fragment } from "react";
import { EmojiText } from "@/components/chat/emoji-text";
import { splitMessageSignatures } from "@/lib/message-signature";

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"'`“”‘’]+/gi;

function trimUrlPunctuation(value: string) {
  let url = value;
  while (url) {
    const trimmed = url.replace(/[.,!?;:]+$/, "");
    if (trimmed !== url) {
      url = trimmed;
      continue;
    }

    const closing = url.at(-1)!;
    const opening = ({ ")": "(", "]": "[", "}": "{" } as Record<string, string>)[closing];
    if (opening && url.split(closing).length > url.split(opening).length) {
      url = url.slice(0, -1);
      continue;
    }
    break;
  }
  return url;
}

// Interpreta apenas o prefixo de assinatura enviado pelo backend, sem alterar o texto salvo.
export function MessageText({ content, showSignature = false, linkify = true, lightBackground = false }: { content: string; showSignature?: boolean; linkify?: boolean; lightBackground?: boolean }) {
  const signed = showSignature ? splitMessageSignatures(content) : null;
  const body = signed?.body ?? content;
  const parts = [];
  let offset = 0;

  for (const match of linkify ? body.matchAll(URL_PATTERN) : []) {
    const value = trimUrlPunctuation(match[0]);
    const href = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
      const url = new URL(href);
      if (!url.hostname || !["http:", "https:"].includes(url.protocol)) continue;
    } catch {
      continue;
    }

    parts.push(
      <Fragment key={match.index}>
        <EmojiText content={body.slice(offset, match.index)} />
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="cursor-pointer break-words underline underline-offset-2 [overflow-wrap:anywhere] hover:opacity-80 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          {value}
        </a>
      </Fragment>,
    );
    offset = match.index + value.length;
  }

  return <>
    {signed?.signatures.map(({ name, separator }, index) => <Fragment key={index}>
      <strong className={`rounded-md px-1 py-px font-semibold [box-decoration-break:clone] ${lightBackground ? "bg-zinc-900/10 text-zinc-800" : "bg-white/10 text-zinc-100"}`}><EmojiText content={`${name}:`} /></strong>
      {separator}
    </Fragment>)}
    {parts}<EmojiText content={body.slice(offset)} />
  </>;
}

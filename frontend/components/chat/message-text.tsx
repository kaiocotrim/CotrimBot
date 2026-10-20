"use client";

import { Fragment, useContext } from "react";
import { EmojiText } from "@/components/chat/emoji-text";
import { GroupMentionContext } from "@/components/chat/group-mention-context";
import { splitMessageSignatures } from "@/lib/message-signature";

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"'`“”‘’]+/gi;

const MENTION_PATTERN = /(?<![\p{L}\p{N}_@])@(\d{5,20})(?:@(?:s\.whatsapp\.net|lid))?(?![\p{L}\p{N}_@])/gu;

function MentionText({ content }: { content: string }) {
  const mentions = useContext(GroupMentionContext);
  if (!mentions?.size) return <EmojiText content={content} />;
  const parts = [];
  let offset = 0;
  for (const match of content.matchAll(MENTION_PATTERN)) {
    const target = mentions.get(match[1]);
    if (!target) continue;
    parts.push(<Fragment key={match.index}><EmojiText content={content.slice(offset, match.index)} /><span data-whatsapp-mention={match[1]} title={`@${target.name}`} className="px-0.5 font-normal text-zinc-400 [[data-private-message=true]_&]:text-zinc-600">@{target.name}</span></Fragment>);
    offset = match.index + match[0].length;
  }
  return <>{parts}<EmojiText content={content.slice(offset)} /></>;
}

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

// O prefixo continua salvo e é enviado ao WhatsApp, mas no CotrimBot a foto do
// atendente identifica a autoria. Por isso, mensagens de saída exibem só o corpo.
export function MessageText({ content, showSignature = false, linkify = true }: { content: string; showSignature?: boolean; linkify?: boolean }) {
  const signed = showSignature ? splitMessageSignatures(content) : null;
  const body = signed?.body ?? content;
  const parts = [];
  let offset = 0;

  for (const match of body.matchAll(URL_PATTERN)) {
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
        <MentionText content={body.slice(offset, match.index)} />
        {linkify ? <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="cursor-pointer break-words underline underline-offset-2 [overflow-wrap:anywhere] hover:opacity-80 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          {value}
        </a> : <EmojiText content={value} />}
      </Fragment>,
    );
    offset = match.index + value.length;
  }

  return <>{parts}<MentionText content={body.slice(offset)} /></>;
}

"use client";

import { Fragment, useContext, type ReactNode } from "react";
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

function LinkedText({ content: body, linkify }: { content: string; linkify: boolean }) {
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

// Code takes precedence and stays literal. Word boundaries keep identifiers such
// as customer_name intact; URLs are consumed before their internal punctuation.
const FORMAT_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+|```([\s\S]+?)```|(?<!`)`([^`\n]+)`(?!`)|(?<![\p{L}\p{N}_])([*_~])(?=\S)([^\n]*?\S)\3(?![\p{L}\p{N}_])/gu;

function FormattedText({ content, linkify, depth = 0 }: { content: string; linkify: boolean; depth?: number }): ReactNode {
  if (depth >= 16) return <LinkedText content={content} linkify={linkify} />;
  const parts: ReactNode[] = [];
  let offset = 0;

  for (const match of content.matchAll(FORMAT_PATTERN)) {
    parts.push(<LinkedText key={`text-${match.index}`} content={content.slice(offset, match.index)} linkify={linkify} />);
    let formatted: ReactNode;
    if (match[1] !== undefined || match[2] !== undefined) {
      formatted = <code className="font-mono whitespace-pre-wrap [overflow-wrap:anywhere]">{match[1] ?? match[2]}</code>;
    } else if (match[3]) {
      const children = <FormattedText content={match[4]} linkify={linkify} depth={depth + 1} />;
      formatted = match[3] === "*" ? <strong className="font-bold">{children}</strong>
        : match[3] === "_" ? <em className="italic">{children}</em>
          : <del className="line-through">{children}</del>;
    } else {
      formatted = <LinkedText content={match[0]} linkify={linkify} />;
    }
    parts.push(<Fragment key={`format-${match.index}`}>{formatted}</Fragment>);
    offset = match.index + match[0].length;
  }

  return <>{parts}<LinkedText content={content.slice(offset)} linkify={linkify} /></>;
}

// O prefixo continua salvo e é enviado ao WhatsApp, mas no CotrimBot a foto do
// atendente identifica a autoria. Por isso, mensagens de saída exibem só o corpo.
export function MessageText({ content, showSignature = false, linkify = true }: { content: string; showSignature?: boolean; linkify?: boolean }) {
  const signed = showSignature ? splitMessageSignatures(content) : null;
  return <FormattedText content={signed?.body ?? content} linkify={linkify} />;
}

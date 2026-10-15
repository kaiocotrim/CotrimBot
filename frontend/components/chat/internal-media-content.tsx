"use client";

import { AudioMessage } from "@/components/chat/audio-message";
import { DocumentMessage } from "@/components/chat/document-message";
import { ImageMessage } from "@/components/chat/image-message";
import { VideoMessage } from "@/components/chat/video-message";
import { internalChatApi, internalMediaUrl, type InternalMessage } from "@/lib/internal-chat-api";

type Props = {
  message: InternalMessage;
  messages: InternalMessage[];
  organizationId: string;
  conversationId: string;
  currentUserId?: string;
};

export function InternalMediaContent({ message, messages, organizationId, conversationId, currentUserId }: Props) {
  const mime = message.media?.mimeType ?? "";
  const mediaUrl = internalMediaUrl(organizationId, conversationId, message.id);
  const contact = { name: message.sender.name, profilePictureUrl: message.sender.image };
  const showSignature = message.senderId === currentUserId && !message.private;
  const mediaGallery = messages.filter((item) => item.type === "FILE" && !item.deletedAt && (item.media?.mimeType.startsWith("image/") || item.media?.mimeType.startsWith("video/"))).map((item) => ({
    id: item.id,
    type: item.media!.mimeType.startsWith("video/") ? "VIDEO" as const : "IMAGE" as const,
    mediaUrl: internalMediaUrl(organizationId, conversationId, item.id),
    content: item.content,
    showSignature: item.senderId === currentUserId && !item.private,
    createdAt: item.createdAt,
  }));

  if (mime.startsWith("image/")) return <ImageMessage
    messageId={message.id}
    mediaUrl={mediaUrl}
    content={message.content}
    showSignature={showSignature}
    viewOnce={false}
    contact={contact}
    createdAt={message.createdAt}
    gallery={mediaGallery.filter((item) => item.type === "IMAGE").map((item) => ({ ...item, viewOnce: false }))}
  />;

  if (mime.startsWith("video/")) return <VideoMessage
    messageId={message.id}
    mediaUrl={mediaUrl}
    content={message.content}
    showSignature={showSignature}
    contact={contact}
    createdAt={message.createdAt}
    gallery={mediaGallery}
  />;

  if (mime.startsWith("audio/")) return <div className="w-[min(380px,70vw)] max-w-full p-2">
    <AudioMessage mediaUrl={mediaUrl} messageId={message.id} onTranscribe={async (id) => (await internalChatApi.transcribe(organizationId, conversationId, id)).transcription} />
  </div>;

  return <DocumentMessage mediaUrl={mediaUrl} content={message.content} showSignature={showSignature} fileName={message.media?.fileName} />;
}

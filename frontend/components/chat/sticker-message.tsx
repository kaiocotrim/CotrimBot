type StickerMessageProps = {
  mediaUrl: string;
};

export function StickerMessage({ mediaUrl }: StickerMessageProps) {
  return (
    <div className="flex size-[clamp(140px,18vw,220px)] items-end justify-center">
      {/* A mídia pode ser uma figurinha PNG ou WebP animada. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={mediaUrl}
        alt="Figurinha"
        loading="lazy"
        draggable={false}
        className="block max-h-full max-w-full object-contain drop-shadow-[0_2px_2px_rgba(0,0,0,0.28)]"
      />
    </div>
  );
}

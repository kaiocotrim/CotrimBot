import { Button } from "@/components/ui/button";

type MessageComposerProps = {
  text: string;
  sending: boolean;
  onTextChange: (text: string) => void;
  onSend: () => void;
};

// Controla o campo e o botão usados para enviar uma mensagem.
export function MessageComposer({
  text,
  sending,
  onTextChange,
  onSend,
}: MessageComposerProps) {
  return (
    <div className="flex gap-3 border-t border-zinc-800 p-4">
      <input
        type="text"
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSend();
        }} cursor-pointer
        placeholder="Digite uma mensagem..."
        className="flex-1 rounded-lg bg-zinc-900 px-4 py-3 outline-none "
      />

      <div className="flex flex-col gap-3">
        <Button
          onClick={onSend}
          disabled={sending || !text.trim()}
          className="rounded-lg bg-green-600 px-6 py-3 font-medium disabled:opacity-50 cursor-pointer"
        >
          {sending ? "Enviando..." : "Enviar"}
        </Button>

        <Button
          className="rounded-lg bg-red-600 px-6 py-3 font-medium disabled:opacity-50 cursor-pointer"
        >
          Encerrar chamado com Bot
        </Button>
      </div>
    </div>
  );
}

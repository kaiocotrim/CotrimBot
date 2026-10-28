"use client";

import { ArrowLeft, ArrowUpRight, Bold, Check, ChevronDown, Circle, Columns2, Crop, Image as ImageIcon, Italic, LoaderCircle, Minus, Pencil, Plus, RectangleHorizontal, Redo2, RotateCcw, RotateCw, Shapes, SlidersHorizontal, Square, Sun, Triangle, Type, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@base-ui/react/dialog";
import { IMAGE_FILTERS, type ImageAdjustment, type ImageFilter, type ImageShape } from "@/lib/image-editor";

export type EditorTool = "crop" | "adjust" | "filter" | "text" | "shape" | "draw";
export const EDITOR_TOOLS = [
  { id: "crop", label: "Recortar", title: "Recortar e girar", Icon: Crop },
  { id: "adjust", label: "Ajustes", title: "Ajustes da imagem", Icon: SlidersHorizontal },
  { id: "filter", label: "Filtros", title: "Filtros", Icon: ImageIcon },
  { id: "text", label: "Texto", title: "Texto na imagem", Icon: Type },
  { id: "shape", label: "Formas", title: "Formas e setas", Icon: Shapes },
  { id: "draw", label: "Desenhar", title: "Desenho livre", Icon: Pencil },
] as const;
const SHAPES = [
  { id: "rectangle", label: "Retângulo", Icon: RectangleHorizontal },
  { id: "circle", label: "Círculo", Icon: Circle },
  { id: "triangle", label: "Triângulo", Icon: Triangle },
  { id: "ellipse", label: "Elipse", Icon: Circle },
  { id: "line", label: "Linha", Icon: Minus },
  { id: "arrow", label: "Seta", Icon: ArrowUpRight },
] as const;
const COLORS = ["#ffffff", "#18181b", "#ef4444", "#facc15", "#22c55e", "#3b82f6", "#a855f7"];
export const editorButton = "h-10 gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 text-xs text-zinc-300 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white focus-visible:ring-white/60 disabled:opacity-30";
const selectedClass = "border-white/30 bg-white/[0.08] text-zinc-100 ring-1 ring-white/20 hover:bg-white/[0.12]";
const fieldClass = "h-9 rounded-lg border border-white/[0.08] bg-zinc-900 px-2 text-xs text-zinc-100 outline-none focus:border-white/40";

export function EditorHeader({ fileName, ready, saving, canUndo, canRedo, canSave, comparing, onClose, onUndo, onRedo, onCompare, onSave }: {
  fileName: string; ready: boolean; saving: boolean; canUndo: boolean; canRedo: boolean; canSave: boolean; comparing: boolean;
  onClose: () => void; onUndo: () => void; onRedo: () => void; onCompare: (value: boolean) => void; onSave: () => void;
}) {
  return <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/[0.06] bg-zinc-950 px-3 py-3 sm:px-5 sm:py-4">
    <Button variant="ghost" aria-label="Cancelar" title="Voltar sem salvar" disabled={saving} onClick={onClose} className={`${editorButton} size-11 p-0`}><ArrowLeft className="size-5" /></Button>
    <div className="min-w-0 flex-1"><Dialog.Title className="text-base font-semibold tracking-tight sm:text-xl">Editar foto</Dialog.Title><p className="mt-0.5 truncate text-xs text-zinc-500 sm:text-sm">{fileName}</p></div>
    <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
      <Button variant="ghost" aria-label="Desfazer" title="Desfazer" disabled={!canUndo || saving || comparing} onClick={onUndo} className={`${editorButton} size-10 rounded-full p-0`}><Undo2 /></Button>
      <Button variant="ghost" aria-label="Refazer" title="Refazer" disabled={!canRedo || saving || comparing} onClick={onRedo} className={`${editorButton} size-10 rounded-full p-0`}><Redo2 /></Button>
      <span className="mx-1 h-6 w-px bg-white/[0.08]" />
      <button type="button" aria-label="Comparar com original" aria-pressed={comparing} title="Mantenha pressionado para ver a foto original" disabled={!ready || saving} onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); onCompare(true); }} onPointerUp={() => onCompare(false)} onPointerCancel={() => onCompare(false)} onLostPointerCapture={() => onCompare(false)} onKeyDown={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); onCompare(true); } }} onKeyUp={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); onCompare(false); } }} onBlur={() => onCompare(false)} className={`${editorButton} flex items-center focus-visible:outline-2 focus-visible:outline-white/70 ${comparing ? selectedClass : ""}`}><Columns2 className="size-4" /><span className="hidden min-[380px]:inline">Comparar</span></button>
      <Button aria-label="Salvar foto" disabled={!canSave || saving || comparing} onClick={onSave} className="h-10 gap-2 rounded-xl bg-zinc-200 px-4 text-xs font-semibold text-zinc-950 hover:bg-white focus-visible:ring-white/60 disabled:opacity-35 sm:px-5">{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}Salvar</Button>
    </div>
  </header>;
}

export function EditorToolbar({ tool, disabled, onSelect }: { tool: EditorTool; disabled: boolean; onSelect: (tool: EditorTool) => void }) {
  return <nav aria-label="Ferramentas da foto" className="order-last flex max-w-full shrink-0 gap-1 overflow-x-auto border-t border-white/[0.06] bg-zinc-950 p-2 lg:order-first lg:w-[92px] lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:border-t-0 lg:border-r">
    {EDITOR_TOOLS.map(({ id, label, Icon }) => <Button key={id} variant="ghost" aria-pressed={tool === id} disabled={disabled} onClick={() => onSelect(id)} className={`h-[62px] min-w-[68px] flex-col gap-1.5 rounded-xl border border-transparent px-2 text-[11px] font-medium transition-colors duration-150 hover:bg-white/[0.05] lg:h-[76px] lg:w-full lg:min-w-0 ${tool === id ? "border-white/10 bg-white/[0.08] text-zinc-100 hover:bg-white/[0.12]" : "text-zinc-400"}`}><Icon className="size-5" />{label}</Button>)}
  </nav>;
}

function RangeControl({ label, value, min, max, onChange, onCommit }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void; onCommit?: () => void }) {
  const update = (value: number) => onChange(Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0)));
  return <label className="flex items-center gap-3 text-xs text-zinc-400"><span className="w-[76px] shrink-0">{label}</span><input type="range" aria-label={label} min={min} max={max} value={value} onChange={event => update(Number(event.target.value))} onPointerUp={onCommit} onKeyUp={onCommit} onBlur={onCommit} className="h-1.5 min-w-0 flex-1 cursor-pointer accent-zinc-200" /><input type="number" aria-label={`${label}: valor`} min={min} max={max} value={value} onChange={event => update(Number(event.target.value))} onBlur={onCommit} onKeyUp={onCommit} className={`${fieldClass} h-7 w-14 text-center`} /></label>;
}

function ColorControls({ color, onChange }: { color: string; onChange: (value: string) => void }) {
  return <div className="space-y-3"><p className="text-xs font-medium text-zinc-300">Cor</p><div className="flex flex-wrap items-center gap-2">{COLORS.map(value => <button key={value} type="button" aria-label={`Cor ${value}`} aria-pressed={color === value} onClick={() => onChange(value)} className={`size-7 rounded-full border border-white/15 transition-shadow duration-150 focus-visible:outline-2 focus-visible:outline-white/70 ${color === value ? "ring-2 ring-zinc-200 ring-offset-2 ring-offset-zinc-950" : ""}`} style={{ backgroundColor: value }} />)}<label className="relative flex size-8 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-zinc-900 text-zinc-300"><Plus className="size-4" /><input type="color" aria-label="Cor personalizada" value={color} onChange={event => onChange(event.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" /></label></div></div>;
}

export type EditorPanelProps = {
  tool: EditorTool; disabled: boolean; expanded: boolean; onExpandedChange: () => void;
  color: string; onColor: (color: string) => void; width: number; onWidth: (width: number) => void;
  shape: ImageShape; onShape: (shape: ImageShape) => void; filled: boolean; onFilled: (filled: boolean) => void;
  ratio: number | undefined; onRatio: (ratio: number | undefined) => void; canCrop: boolean; onCrop: () => void; onRotate: () => void; onRestoreFrame: () => void;
  adjustment: ImageAdjustment; onAdjustment: (value: ImageAdjustment) => void; onCommitAdjustment: () => void;
  filter: ImageFilter; onFilter: (filter: ImageFilter) => void; thumbnail: string;
  text: string; onText: (value: string) => void; size: number; onSize: (value: number) => void; bold: boolean; onBold: () => void; italic: boolean; onItalic: () => void;
  texts: { index: number; text: string }[]; selectedText: number | null; onSelectText: (index: number | null) => void; onUpdateText: () => void;
  canReset: boolean; onReset: () => void;
};

export function EditorToolPanel(props: EditorPanelProps) {
  const { tool, disabled, expanded } = props;
  const current = EDITOR_TOOLS.find(item => item.id === tool)!;
  const hint = tool === "draw" ? "Arraste sobre a imagem para desenhar." : tool === "shape" ? "Arraste para definir a posição e o tamanho da forma." : tool === "crop" ? "Arraste para selecionar a área. O recorte só é aplicado ao confirmar." : tool === "text" ? "Clique na foto para adicionar texto. Para ajustar a posição, mantenha pressionado e arraste." : "As alterações aparecem na prévia em tempo real.";
  return <section aria-label="Configurações da ferramenta" className="shrink-0 border-t border-white/[0.06] bg-zinc-950">
    <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <button type="button" aria-label="Expandir configurações" aria-expanded={expanded} onClick={props.onExpandedChange} className="flex min-h-8 min-w-0 flex-1 items-center gap-2 text-left text-xs font-semibold text-zinc-200 lg:pointer-events-none"><current.Icon className="size-4 text-zinc-400" />{current.title}<ChevronDown className={`ml-auto size-4 text-zinc-500 transition-transform duration-150 lg:hidden ${expanded ? "rotate-180" : ""}`} /></button>
      <Button variant="ghost" disabled={!props.canReset || disabled} onClick={props.onReset} className="h-8 gap-1.5 rounded-lg px-2 text-[11px] text-zinc-500 hover:bg-white/5 hover:text-zinc-200"><RotateCcw className="size-3.5" />Restaurar original</Button>
    </div>
    <fieldset disabled={disabled} className={`max-h-[28dvh] overflow-y-auto px-4 pb-4 disabled:opacity-40 lg:max-h-[235px] lg:px-5 lg:pb-5 ${expanded ? "block" : "hidden lg:block"}`}>
      {tool === "crop" && <div className="flex flex-wrap items-center gap-2">
        {([{ ratio: undefined, label: "Livre", detail: "Personalizado", Icon: Crop }, { ratio: 1, label: "1:1", detail: "Quadrado", Icon: Square }, { ratio: 16 / 9, label: "16:9", detail: "Paisagem", Icon: RectangleHorizontal }, { ratio: 9 / 16, label: "9:16", detail: "Retrato", Icon: RectangleHorizontal }] as const).map(({ ratio, label, detail, Icon }) => <Button key={label} variant="ghost" aria-pressed={props.ratio === ratio} onClick={() => props.onRatio(ratio)} className={`${editorButton} h-[66px] min-w-[72px] flex-col gap-1 py-2 ${props.ratio === ratio ? selectedClass : ""}`}><Icon className={`size-4 ${label === "9:16" ? "rotate-90" : ""}`} /><span>{label}</span><span className="text-[10px] font-normal text-zinc-500">{detail}</span></Button>)}
        <Button variant="ghost" aria-label="Girar foto" onClick={props.onRotate} className={`${editorButton} h-[66px] flex-col gap-1`}><RotateCw />Girar</Button>
        <div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={props.onRestoreFrame} className={editorButton}>Restaurar enquadramento</Button><Button variant="ghost" disabled={!props.canCrop} onClick={props.onCrop} className={`${editorButton} border-white/20 bg-white/[0.06] text-zinc-100`}><Check />Aplicar recorte</Button></div>
      </div>}
      {tool === "adjust" && <div className="grid gap-5 lg:grid-cols-[minmax(0,540px)_1fr]"><div className="space-y-3">{([{ id: "brightness", label: "Brilho" }, { id: "contrast", label: "Contraste" }, { id: "saturation", label: "Saturação" }] as const).map(({ id, label }) => <RangeControl key={id} label={label} value={props.adjustment[id]} min={-100} max={100} onChange={value => props.onAdjustment({ ...props.adjustment, [id]: value })} onCommit={props.onCommitAdjustment} />)}</div><div className="hidden items-start gap-2 text-xs text-zinc-500 lg:flex"><Sun className="size-4 shrink-0" /><p>Equilibre luz, contraste e intensidade das cores. Os valores são mantidos ao trocar de ferramenta.</p></div></div>}
      {tool === "filter" && <div className="flex gap-3 overflow-x-auto pb-1">{IMAGE_FILTERS.map(filter => <button type="button" key={filter.id} aria-label={`Filtro ${filter.label}`} aria-pressed={props.filter === filter.id} onClick={() => props.onFilter(filter.id)} className={`w-[100px] shrink-0 overflow-hidden rounded-xl border text-xs transition-colors duration-150 ${props.filter === filter.id ? "border-zinc-500 bg-white/[0.06] text-zinc-100" : "border-white/[0.08] text-zinc-400"}`}><span className="block h-14 bg-zinc-900 bg-cover bg-center" style={{ backgroundImage: props.thumbnail ? `url("${props.thumbnail}")` : undefined, filter: filter.css }} /><span className="block py-2">{filter.label}</span></button>)}</div>}
      {(tool === "shape" || tool === "draw") && <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,.8fr)]">
        <ColorControls color={props.color} onChange={props.onColor} />
        {tool === "shape" ? <div className="space-y-3"><p className="text-xs font-medium text-zinc-300">Formas</p><div className="flex flex-wrap gap-1.5">{SHAPES.map(({ id, label, Icon }) => <Button key={id} variant="ghost" aria-label={label} title={label} aria-pressed={props.shape === id} onClick={() => props.onShape(id)} className={`${editorButton} size-10 px-0 ${props.shape === id ? selectedClass : ""}`}><Icon className={`size-[18px] ${id === "ellipse" ? "scale-x-125" : ""}`} /></Button>)}</div></div> : <div className="hidden text-xs text-zinc-500 lg:block">Use o mouse, o dedo ou uma caneta para marcar a foto.</div>}
        <div className="space-y-3"><p className="text-xs font-medium text-zinc-300">{tool === "draw" ? "Pincel" : "Borda"}</p><RangeControl label="Espessura" value={props.width} min={2} max={30} onChange={props.onWidth} />{tool === "shape" && props.shape !== "arrow" && props.shape !== "line" && <label className="flex items-center gap-2 text-xs text-zinc-400"><input type="checkbox" checked={props.filled} onChange={event => props.onFilled(event.target.checked)} className="size-4 accent-zinc-200" />Preencher forma</label>}</div>
      </div>}
      {tool === "text" && <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"><div className="space-y-3"><div className="flex gap-2"><input aria-label="Texto na foto" placeholder="Escreva seu texto…" maxLength={200} value={props.text} onChange={event => props.onText(event.target.value)} className={`${fieldClass} min-w-0 flex-1`} /><Button variant="ghost" aria-label="Negrito" aria-pressed={props.bold} onClick={props.onBold} className={`${editorButton} size-9 px-0 ${props.bold ? selectedClass : ""}`}><Bold /></Button><Button variant="ghost" aria-label="Itálico" aria-pressed={props.italic} onClick={props.onItalic} className={`${editorButton} size-9 px-0 ${props.italic ? selectedClass : ""}`}><Italic /></Button></div><RangeControl label="Tamanho" value={props.size} min={30} max={200} onChange={props.onSize} />{props.texts.length > 0 && <div className="flex flex-wrap items-center gap-2"><select aria-label="Texto existente" value={props.selectedText ?? "new"} onChange={event => props.onSelectText(event.target.value === "new" ? null : Number(event.target.value))} className={`${fieldClass} min-w-0 flex-1`}><option value="new">Novo texto</option>{props.texts.map(item => <option key={item.index} value={item.index}>{item.text.slice(0, 35)}</option>)}</select><Button variant="ghost" disabled={props.selectedText === null || !props.text.trim()} onClick={props.onUpdateText} className={editorButton}>Atualizar texto</Button></div>}</div><ColorControls color={props.color} onChange={props.onColor} /></div>}
      <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">{hint}</p>
    </fieldset>
  </section>;
}

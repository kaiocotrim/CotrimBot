"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { LoaderCircle } from "lucide-react";
import { EditorHeader, EditorToolPanel, EditorToolbar, type EditorTool } from "@/components/chat/image-editor-controls";
import { DEFAULT_ADJUSTMENT, cropBetween, exportEditedImage, renderEditedImage, restoreImageFraming, type ImageAdjustment, type ImageCrop, type ImageEdit, type ImagePoint, type ImageShape } from "@/lib/image-editor";

type History = { edits: ImageEdit[]; undo: ImageEdit[][]; redo: ImageEdit[][] };
type TextEdit = Extract<ImageEdit, { type: "stamp" }>;

export function canEditImage(file: File) {
  return ["image/jpeg", "image/png", "image/webp", "image/avif", "image/bmp"].includes(file.type);
}

export function ImageEditorDialog({ file, onApply, onClose }: {
  file: File;
  onApply: (file: File) => void | Promise<void>;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const gesture = useRef<{ pointerId: number; start: ImagePoint; points: ImagePoint[]; edit: ImageEdit | null } | null>(null);
  const savingRef = useRef(false);
  const pendingAdjustment = useRef<ImageAdjustment | null>(null);
  const [thumbnail, setThumbnail] = useState("");
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<EditorTool>("crop");
  const [history, setHistory] = useState<History>({ edits: [], undo: [], redo: [] });
  const [draft, setDraft] = useState<ImageEdit | null>(null);
  const [draftAdjustment, setDraftAdjustment] = useState<ImageAdjustment | null>(null);
  const [crop, setCrop] = useState<ImageCrop | null>(null);
  const [ratio, setRatio] = useState<number | undefined>();
  const [color, setColor] = useState("#ffffff");
  const [width, setWidth] = useState(6);
  const [size, setSize] = useState(100);
  const [shape, setShape] = useState<ImageShape>("arrow");
  const [filled, setFilled] = useState(false);
  const [text, setText] = useState("");
  const [bold, setBold] = useState(true);
  const [italic, setItalic] = useState(false);
  const [selectedText, setSelectedText] = useState<number | null>(null);
  const [comparing, setComparing] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastAdjustment = history.edits.findLast(edit => edit.type === "adjust");
  const adjustment = draftAdjustment ?? (lastAdjustment?.type === "adjust" ? lastAdjustment.value : DEFAULT_ADJUSTMENT);
  const lastFilter = history.edits.findLast(edit => edit.type === "filter");
  const filter = lastFilter?.type === "filter" ? lastFilter.preset : "original";
  const texts = history.edits.flatMap((edit, index) => edit.type === "stamp" ? [{ index, text: edit.text }] : []);
  const activeText = selectedText !== null && history.edits[selectedText]?.type === "stamp" ? selectedText : null;

  const fitCanvas = useCallback(() => {
    const canvas = canvasRef.current, stage = stageRef.current;
    if (!canvas || !stage) return;
    const scale = Math.min(stage.clientWidth / canvas.width, stage.clientHeight / canvas.height);
    canvas.style.width = `${Math.max(1, Math.floor(canvas.width * scale))}px`;
    canvas.style.height = `${Math.max(1, Math.floor(canvas.height * scale))}px`;
  }, []);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => { imageRef.current = image; setThumbnail(url); setReady(true); };
    image.onerror = () => setError("Não foi possível abrir esta imagem. Tente outra foto.");
    image.src = url;
    return () => { image.onload = null; image.onerror = null; URL.revokeObjectURL(url); };
  }, [file]);

  useEffect(() => {
    if (!stageRef.current) return;
    const observer = new ResizeObserver(fitCanvas);
    observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, [fitCanvas]);

  useEffect(() => {
    if (!ready || !imageRef.current || !canvasRef.current) return;
    const edits = [...history.edits];
    if (draftAdjustment) edits.push({ type: "adjust", value: draftAdjustment });
    if (draft) edits.push(draft);
    const canvas = renderEditedImage(imageRef.current, comparing ? [] : edits, canvasRef.current);
    if (crop && !comparing) {
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#0009";
      context.fillRect(0, 0, canvas.width, crop.y);
      context.fillRect(0, crop.y + crop.height, canvas.width, canvas.height - crop.y - crop.height);
      context.fillRect(0, crop.y, crop.x, crop.height);
      context.fillRect(crop.x + crop.width, crop.y, canvas.width - crop.x - crop.width, crop.height);
      context.strokeStyle = "#fff";
      context.lineWidth = Math.max(1, canvas.width / 600);
      context.strokeRect(crop.x, crop.y, crop.width, crop.height);
      context.strokeStyle = "#ffffff60";
      context.beginPath();
      for (const fraction of [1 / 3, 2 / 3]) {
        context.moveTo(crop.x + crop.width * fraction, crop.y);
        context.lineTo(crop.x + crop.width * fraction, crop.y + crop.height);
        context.moveTo(crop.x, crop.y + crop.height * fraction);
        context.lineTo(crop.x + crop.width, crop.y + crop.height * fraction);
      }
      context.stroke();
    }
    fitCanvas();
  }, [ready, history.edits, draft, draftAdjustment, crop, comparing, fitCanvas]);

  // O histórico guarda referências às operações, sem copiar os pixels da imagem.
  function changeEdits(update: (edits: ImageEdit[]) => ImageEdit[]) {
    setHistory(current => ({ edits: update(current.edits), undo: [...current.undo.slice(-79), current.edits], redo: [] }));
    setDraft(null);
    setCrop(null);
  }

  function commit(edit: ImageEdit) { changeEdits(edits => [...edits, edit]); }

  function flushAdjustment() {
    const value = pendingAdjustment.current;
    if (!value) return;
    pendingAdjustment.current = null;
    setDraftAdjustment(null);
    commit({ type: "adjust", value });
  }

  function selectTool(value: EditorTool) {
    flushAdjustment(); setTool(value); setCrop(null); setExpanded(true);
  }

  function undo() {
    if (pendingAdjustment.current) { pendingAdjustment.current = null; setDraftAdjustment(null); return; }
    setCrop(null);
    if (history.undo.length && selectedText !== null) syncTextSelection(history.undo[history.undo.length - 1], selectedText);
    setHistory(current => current.undo.length ? { edits: current.undo[current.undo.length - 1], undo: current.undo.slice(0, -1), redo: [current.edits, ...current.redo] } : current);
  }

  function redo() {
    setCrop(null);
    if (history.redo.length && selectedText !== null) syncTextSelection(history.redo[0], selectedText);
    setHistory(current => current.redo.length ? { edits: current.redo[0], undo: [...current.undo, current.edits], redo: current.redo.slice(1) } : current);
  }

  function point(event: PointerEvent<HTMLCanvasElement>): ImagePoint {
    const canvas = event.currentTarget, bounds = canvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(canvas.width, (event.clientX - bounds.left) * canvas.width / bounds.width)), y: Math.max(0, Math.min(canvas.height, (event.clientY - bounds.top) * canvas.height / bounds.height)) };
  }

  function updateGesture(position: ImagePoint) {
    const active = gesture.current;
    if (!active) return;
    if (tool === "crop") {
      const canvas = canvasRef.current!;
      setCrop(cropBetween(active.start, position, ratio, { width: canvas.width, height: canvas.height }));
      return;
    }
    if (active.edit?.type === "draw") {
      active.points.push(position);
      active.edit = { ...active.edit, points: [...active.points] };
    } else if (active.edit?.type === "stamp") active.edit = { ...active.edit, x: position.x, y: position.y };
    else if (active.edit?.type === "shape") active.edit = { ...active.edit, end: position };
    setDraft(active.edit);
  }

  function selectText(index: number | null) {
    setSelectedText(index);
    if (index === null) { setText(""); return; }
    syncTextSelection(history.edits, index);
  }

  function syncTextSelection(edits: ImageEdit[], index: number) {
    const edit = edits[index];
    if (edit?.type !== "stamp") { setSelectedText(null); return; }
    setText(edit.text); setColor(edit.color); setBold(edit.bold !== false); setItalic(Boolean(edit.italic));
    const image = imageRef.current!;
    const scale = Math.min(1, 4096 / Math.max(image.naturalWidth, image.naturalHeight));
    let width = Math.round(image.naturalWidth * scale), height = Math.round(image.naturalHeight * scale);
    for (const operation of edits) {
      if (operation.type === "crop") { width = operation.box.width; height = operation.box.height; }
      if (operation.type === "rotate") [width, height] = [height, width];
    }
    const base = Math.min(width, height);
    setSize(Math.round(edit.size / (base * 0.15) * 100));
  }

  async function apply() {
    if (!imageRef.current || savingRef.current || (!history.edits.length && !pendingAdjustment.current)) return;
    savingRef.current = true; setSaving(true); setError(null);
    try {
      const edits = pendingAdjustment.current ? [...history.edits, { type: "adjust" as const, value: pendingAdjustment.current }] : history.edits;
      await onApply(await exportEditedImage(imageRef.current, edits, file));
      onClose();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível salvar a imagem"); }
    finally { savingRef.current = false; setSaving(false); }
  }

  return <Dialog.Root open onOpenChange={open => { if (!open && !savingRef.current) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm" />
      <div className="pointer-events-none fixed inset-0 z-[201] flex items-center justify-center p-2 sm:p-4">
        <Dialog.Popup className="pointer-events-auto flex h-[calc(100dvh-16px)] max-h-[980px] w-full max-w-[1480px] flex-col overflow-hidden rounded-[14px] border border-white/[0.08] bg-zinc-950 text-zinc-100 shadow-[0_24px_100px_#0009] outline-none sm:h-[calc(100dvh-32px)]">
          <EditorHeader fileName={file.name} ready={ready} saving={saving} canUndo={Boolean(history.undo.length || draftAdjustment)} canRedo={Boolean(history.redo.length)} canSave={ready && Boolean(history.edits.length || draftAdjustment) && !crop} comparing={comparing} onClose={onClose} onUndo={undo} onRedo={redo} onCompare={value => { gesture.current = null; setDraft(null); setComparing(value); }} onSave={() => void apply()} />
          <Dialog.Description className="sr-only">Edite a foto antes de enviar. Escolha uma ferramenta e use os controles abaixo da imagem. Mantenha Comparar pressionado para visualizar o original.</Dialog.Description>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
            <EditorToolbar tool={tool} disabled={!ready || saving || comparing} onSelect={selectTool} />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="relative min-h-0 flex-1 bg-black p-3 sm:p-5">
                <div ref={stageRef} className="flex size-full min-h-0 items-center justify-center overflow-hidden">
                  {!ready && !error && <p role="status" className="flex items-center gap-2 text-xs text-zinc-500"><LoaderCircle className="size-4 animate-spin" />Carregando foto…</p>}
                  <canvas ref={canvasRef} aria-label="Foto em edição" className={`block touch-none rounded-[10px] shadow-lg ${ready ? "" : "hidden"} ${comparing || tool === "adjust" || tool === "filter" ? "cursor-default" : "cursor-crosshair"}`} onPointerDown={event => {
                    if (!ready || saving || comparing || tool === "adjust" || tool === "filter" || event.button !== 0 || gesture.current) return;
                    event.preventDefault();
                    const position = point(event), base = Math.min(event.currentTarget.width, event.currentTarget.height);
                    const edit: ImageEdit | null = tool === "draw" ? { type: "draw", points: [position], color, width: Math.max(1, width * base / 500) }
                      : tool === "shape" ? { type: "shape", shape, start: position, end: position, color, width: Math.max(1, width * base / 500), filled }
                      : tool === "crop" ? null : { type: "stamp", text: text.trim(), ...position, size: base * 0.15 * size / 100, color, bold, italic };
                    if (edit?.type === "stamp" && !edit.text) return;
                    gesture.current = { pointerId: event.pointerId, start: position, points: [position], edit };
                    event.currentTarget.setPointerCapture(event.pointerId);
                    if (tool === "crop") setCrop(null);
                    setDraft(edit);
                  }} onPointerMove={event => { if (gesture.current?.pointerId === event.pointerId) updateGesture(point(event)); }} onPointerUp={event => {
                    if (gesture.current?.pointerId !== event.pointerId) return;
                    updateGesture(point(event));
                    const edit = gesture.current.edit;
                    gesture.current = null;
                    if (edit?.type === "shape" && Math.hypot(edit.end.x - edit.start.x, edit.end.y - edit.start.y) < 2) setDraft(null);
                    else if (edit) { if (edit.type === "stamp") setSelectedText(history.edits.length); commit(edit); }
                  }} onPointerCancel={() => { gesture.current = null; setDraft(null); setCrop(null); }} />
                </div>
                {comparing && <span className="pointer-events-none absolute top-4 left-4 rounded-lg border border-white/10 bg-zinc-900/90 px-3 py-1.5 text-xs text-zinc-200">Original</span>}
              </div>
              {error && <p role="alert" className="shrink-0 px-4 py-2 text-xs text-red-300">{error}</p>}
              <EditorToolPanel tool={tool} disabled={!ready || saving || comparing} expanded={expanded} onExpandedChange={() => setExpanded(value => !value)} color={color} onColor={setColor} width={width} onWidth={setWidth} shape={shape} onShape={setShape} filled={filled} onFilled={setFilled}
                ratio={ratio} onRatio={value => { setRatio(value); setCrop(null); }} canCrop={Boolean(crop && crop.width >= 10 && crop.height >= 10)} onCrop={() => { if (crop) commit({ type: "crop", box: crop }); }} onRotate={() => commit({ type: "rotate" })} onRestoreFrame={() => { setCrop(null); if (history.edits.some(edit => edit.type === "crop" || edit.type === "rotate")) { setSelectedText(null); changeEdits(edits => restoreImageFraming(imageRef.current!, edits)); } }}
                adjustment={adjustment} onAdjustment={value => { pendingAdjustment.current = value; setDraftAdjustment(value); }} onCommitAdjustment={flushAdjustment} filter={filter} onFilter={preset => commit({ type: "filter", preset })} thumbnail={thumbnail}
                text={text} onText={setText} size={size} onSize={setSize} bold={bold} onBold={() => setBold(value => !value)} italic={italic} onItalic={() => setItalic(value => !value)} texts={texts} selectedText={activeText} onSelectText={selectText} onUpdateText={() => {
                  if (activeText === null || !text.trim()) return;
                  const original = history.edits[activeText] as TextEdit;
                  const base = Math.min(canvasRef.current!.width, canvasRef.current!.height);
                  changeEdits(edits => edits.map((edit, index) => index === activeText ? { ...original, text: text.trim(), color, size: base * 0.15 * size / 100, bold, italic } : edit));
                }} canReset={Boolean(history.edits.length || draftAdjustment || crop)} onReset={() => { pendingAdjustment.current = null; setDraftAdjustment(null); setSelectedText(null); changeEdits(() => []); }} />
            </div>
          </div>
        </Dialog.Popup>
      </div>
    </Dialog.Portal>
  </Dialog.Root>;
}

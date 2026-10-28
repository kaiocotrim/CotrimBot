export type ImagePoint = { x: number; y: number };
export type ImageCrop = { x: number; y: number; width: number; height: number };
export type ImageShape = "arrow" | "rectangle" | "triangle" | "circle" | "ellipse" | "line";
export type ImageAdjustment = { brightness: number; contrast: number; saturation: number };
export type ImageFilter = "original" | "mono" | "warm" | "cool" | "vintage";
type ImageTransform = [number, number, number, number, number, number];
export const DEFAULT_ADJUSTMENT: ImageAdjustment = { brightness: 0, contrast: 0, saturation: 0 };
export const IMAGE_FILTERS: { id: ImageFilter; label: string; css: string }[] = [
  { id: "original", label: "Original", css: "none" },
  { id: "mono", label: "P&B", css: "grayscale(1)" },
  { id: "warm", label: "Quente", css: "sepia(.25) saturate(1.2)" },
  { id: "cool", label: "Frio", css: "saturate(.8) hue-rotate(15deg)" },
  { id: "vintage", label: "Vintage", css: "sepia(.6) contrast(.9)" },
];
export type ImageEdit =
  | { type: "draw"; points: ImagePoint[]; color: string; width: number; transform?: ImageTransform }
  | { type: "shape"; shape: ImageShape; start: ImagePoint; end: ImagePoint; color: string; width: number; filled: boolean; transform?: ImageTransform }
  | { type: "stamp"; text: string; x: number; y: number; size: number; color: string; bold?: boolean; italic?: boolean; transform?: ImageTransform }
  | { type: "adjust"; value: ImageAdjustment }
  | { type: "filter"; preset: ImageFilter }
  | { type: "crop"; box: ImageCrop }
  | { type: "rotate" };

// As operações usam as coordenadas da imagem, independentemente do tamanho da tela.
export function renderEditedImage(image: HTMLImageElement, edits: ImageEdit[], canvas = document.createElement("canvas")) {
  const scale = Math.min(1, 4096 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível abrir o editor de imagem");
  const adjustment = edits.findLast(edit => edit.type === "adjust");
  const preset = edits.findLast(edit => edit.type === "filter");
  const value = adjustment?.type === "adjust" ? adjustment.value : DEFAULT_ADJUSTMENT;
  const filter = IMAGE_FILTERS.find(filter => preset?.type === "filter" && filter.id === preset.preset)?.css ?? "none";
  const effects = [
    value.brightness ? `brightness(${1 + value.brightness / 100})` : "",
    value.contrast ? `contrast(${1 + value.contrast / 100})` : "",
    value.saturation ? `saturate(${1 + value.saturation / 100})` : "",
    filter === "none" ? "" : filter,
  ].filter(Boolean);
  context.filter = effects.join(" ") || "none";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  context.filter = "none";
  for (const edit of edits) {
    if (edit.type === "adjust" || edit.type === "filter") continue;
    context.save();
    if ("transform" in edit && edit.transform) context.transform(...edit.transform);
    if (edit.type === "draw") {
      drawImageStroke(context, edit.points, edit.color, edit.width);
    } else if (edit.type === "shape") {
      drawImageShape(context, edit);
    } else if (edit.type === "stamp") {
      context.save();
      context.font = `${edit.italic ? "italic " : ""}${edit.bold === false ? 400 : 600} ${edit.size}px system-ui, sans-serif`;
      context.fillStyle = edit.color;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.shadowColor = "#0009";
      context.shadowBlur = Math.max(2, edit.size / 15);
      context.fillText(edit.text, edit.x, edit.y);
      context.restore();
    } else {
      const previous = document.createElement("canvas");
      previous.width = canvas.width;
      previous.height = canvas.height;
      previous.getContext("2d")!.drawImage(canvas, 0, 0);
      if (edit.type === "rotate") {
        canvas.width = previous.height;
        canvas.height = previous.width;
        context.save();
        context.translate(canvas.width, 0);
        context.rotate(Math.PI / 2);
        context.drawImage(previous, 0, 0);
        context.restore();
      } else {
        const { x, y, width, height } = edit.box;
        canvas.width = width;
        canvas.height = height;
        context.drawImage(previous, x, y, width, height, 0, 0, width, height);
      }
    }
    context.restore();
  }
  return canvas;
}

function composeTransform(m: ImageTransform, n: ImageTransform): ImageTransform {
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}

// Remove o enquadramento sem deslocar ou perder as anotações já posicionadas.
export function restoreImageFraming(image: HTMLImageElement, edits: ImageEdit[]): ImageEdit[] {
  const scale = Math.min(1, 4096 / Math.max(image.naturalWidth, image.naturalHeight));
  let width = Math.round(image.naturalWidth * scale), height = Math.round(image.naturalHeight * scale);
  let transform: ImageTransform = [1, 0, 0, 1, 0, 0];
  const result: ImageEdit[] = [];
  for (const edit of edits) {
    if (edit.type === "crop") {
      transform = composeTransform(transform, [1, 0, 0, 1, edit.box.x, edit.box.y]);
      width = edit.box.width; height = edit.box.height;
    } else if (edit.type === "rotate") {
      transform = composeTransform(transform, [0, -1, 1, 0, 0, height]);
      [width, height] = [height, width];
    } else if (edit.type === "draw" || edit.type === "shape" || edit.type === "stamp") {
      result.push({ ...edit, transform: composeTransform(transform, edit.transform ?? [1, 0, 0, 1, 0, 0]) });
    } else result.push(edit);
  }
  return result;
}

export function drawImageShape(context: CanvasRenderingContext2D, edit: Extract<ImageEdit, { type: "shape" }>) {
  const { start, end, shape, color, width, filled } = edit;
  const x = Math.min(start.x, end.x), y = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x), h = Math.abs(end.y - start.y);
  if (Math.hypot(w, h) < 2) return;
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  if (shape === "arrow" || shape === "line") {
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    if (shape === "arrow") {
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const head = Math.min(Math.hypot(w, h) * 0.4, Math.max(12, width * 4));
      context.moveTo(end.x - head * Math.cos(angle - Math.PI / 6), end.y - head * Math.sin(angle - Math.PI / 6));
      context.lineTo(end.x, end.y);
      context.lineTo(end.x - head * Math.cos(angle + Math.PI / 6), end.y - head * Math.sin(angle + Math.PI / 6));
    }
  } else if (shape === "rectangle") {
    context.rect(x, y, w, h);
  } else if (shape === "triangle") {
    context.moveTo(x + w / 2, y);
    context.lineTo(x + w, y + h);
    context.lineTo(x, y + h);
    context.closePath();
  } else if (shape === "circle") {
    context.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
  } else {
    context.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  }
  if (filled && shape !== "arrow" && shape !== "line") context.fill();
  context.stroke();
  context.restore();
}

export function drawImageStroke(context: CanvasRenderingContext2D, points: ImagePoint[], color: string, width: number) {
  if (!points.length) return;
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) context.lineTo(point.x, point.y);
  if (points.length === 1) {
    context.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2);
    context.fill();
  } else context.stroke();
  context.restore();
}

export function cropBetween(start: ImagePoint, end: ImagePoint, ratio?: number, bounds?: { width: number; height: number }): ImageCrop {
  if (ratio && bounds) {
    const signX = end.x >= start.x ? 1 : -1, signY = end.y >= start.y ? 1 : -1;
    let width = Math.abs(end.x - start.x), height = Math.abs(end.y - start.y);
    if (width / Math.max(height, 0.001) > ratio) height = width / ratio;
    else width = height * ratio;
    const maxWidth = signX > 0 ? bounds.width - start.x : start.x;
    const maxHeight = signY > 0 ? bounds.height - start.y : start.y;
    const scale = Math.min(1, maxWidth / Math.max(width, 0.001), maxHeight / Math.max(height, 0.001));
    end = { x: start.x + signX * width * scale, y: start.y + signY * height * scale };
  }
  const x = Math.round(Math.min(start.x, end.x));
  const y = Math.round(Math.min(start.y, end.y));
  return { x, y, width: Math.round(Math.max(start.x, end.x)) - x, height: Math.round(Math.max(start.y, end.y)) - y };
}

export async function exportEditedImage(image: HTMLImageElement, edits: ImageEdit[], original: File) {
  const canvas = renderEditedImage(image, edits);
  const type = original.type === "image/jpeg" ? "image/jpeg" : "image/png";
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Não foi possível salvar a imagem")), type, 0.94));
  const name = original.name.replace(/\.[^.]+$/, "").replace(/-editada$/, "");
  return new File([blob], `${name}-editada.${type === "image/jpeg" ? "jpg" : "png"}`, { type });
}

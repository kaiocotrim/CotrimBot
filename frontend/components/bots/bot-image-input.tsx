"use client";

import Image from "next/image";
import { useState } from "react";
import { ImagePlus, LoaderCircle, X } from "lucide-react";
import { botImageUrl, uploadBotImage } from "@/lib/bot-api";
import styles from "./bot-designer.module.css";

export function BotImageInput({ imageId, onChange, onUploading, disabled, label }: {
  imageId?: string; onChange: (id: string) => void; onUploading: (value: boolean) => void; disabled: boolean; label: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  async function upload(file: File) {
    setError("");
    if (!/^(image\/jpeg|image\/png|image\/webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
      setError("Escolha uma imagem JPEG, PNG ou WebP de até 5 MB."); return;
    }
    setUploading(true); onUploading(true);
    try { const image = await uploadBotImage(file); onChange(image.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível enviar a imagem."); }
    finally { setUploading(false); onUploading(false); }
  }
  return <div className={styles.imageUpload}>
    <label>{label}<input className={styles.field} type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || uploading} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void upload(file); }} /></label>
    {uploading && <p className={styles.helper}><LoaderCircle size={14} className="animate-spin" /> Enviando imagem…</p>}
    {!uploading && imageId && <><Image src={botImageUrl(imageId)} alt="Prévia da imagem do bot" width={320} height={180} unoptimized className={styles.imagePreview} /><button type="button" className={styles.button} disabled={disabled} onClick={() => onChange("")}><X size={13} /> Remover imagem</button></>}
    {!imageId && !uploading && <p className={styles.helper}><ImagePlus size={13} /> JPEG, PNG ou WebP · até 5 MB</p>}
    {error && <p role="alert" className={styles.danger}>{error}</p>}
  </div>;
}

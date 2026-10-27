// Gera um PNG do trecho completo, inclusive mensagens fora da área de rolagem.
export async function captureConversation(source: HTMLElement, messageIds: number[], title: string, photoUrl?: string | null): Promise<File> {
  const { toBlob } = await import("html-to-image");
  const rows = messageIds.map((id) => source.querySelector<HTMLElement>(`[data-message-id="${id}"]`));
  if (!rows.length || rows.some((row) => !row)) throw new Error("Carregue as mensagens do trecho antes de gerar o print.");

  const host = document.createElement("div");
  host.inert = true;
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, { position: "fixed", left: "-100000px", top: "0", pointerEvents: "none" });
  const snapshot = document.createElement("div");
  snapshot.dataset.conversationPrint = "true";
  Object.assign(snapshot.style, {
    width: `${source.clientWidth}px`, boxSizing: "border-box", padding: "20px",
    display: "flex", flexDirection: "column", gap: "8px", background: "#09090b",
    color: "#f4f4f5", fontFamily: getComputedStyle(source).fontFamily,
  });
  const heading = document.createElement("div");
  heading.dataset.printHeader = "true";
  Object.assign(heading.style, { display: "flex", alignItems: "center", gap: "12px", fontSize: "16px", fontWeight: "500", padding: "0 4px 16px", marginBottom: "8px", borderBottom: "1px solid #27272a" });
  const avatar = document.createElement("div");
  avatar.textContent = title.trim().charAt(0).toUpperCase() || "?";
  Object.assign(avatar.style, { position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", flexShrink: "0", borderRadius: "50%", overflow: "hidden", background: "#3f3f46", color: "#f4f4f5" });
  if (photoUrl?.trim()) {
    const photo = document.createElement("img");
    photo.src = photoUrl.trim();
    photo.alt = "";
    photo.dataset.printAvatar = "true";
    Object.assign(photo.style, { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover" });
    avatar.append(photo);
  }
  const name = document.createElement("span");
  name.textContent = title;
  Object.assign(name.style, { minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
  const brand = document.createElement("div");
  brand.dataset.printBrand = "true";
  Object.assign(brand.style, { display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto", paddingLeft: "16px", flexShrink: "0", fontSize: "14px", color: "#d4d4d8" });
  const logo = document.createElement("img");
  logo.src = "/Logo-CotrimBot-nova.png";
  logo.alt = "";
  logo.dataset.printLogo = "true";
  Object.assign(logo.style, { display: "block", width: "32px", height: "32px", objectFit: "contain", flexShrink: "0" });
  const brandName = document.createElement("span");
  brandName.textContent = "CotrimBot";
  brand.append(logo, brandName);
  heading.append(avatar, name, brand);
  snapshot.append(heading);
  for (const row of rows) {
    const clone = row!.cloneNode(true) as HTMLElement;
    clone.removeAttribute("id");
    clone.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
    clone.querySelectorAll("[data-print-exclude]").forEach((element) => element.remove());
    Object.assign(clone.style, { opacity: "1", transform: "none", background: "transparent", boxShadow: "none", outline: "none", flexShrink: "0" });
    // Transforma players em imagens estáticas, sem iniciar reprodução no clone.
    const originalVideos = row!.querySelectorAll("video");
    clone.querySelectorAll("video").forEach((video, index) => {
      const original = originalVideos[index];
      const frame = document.createElement("canvas");
      frame.width = original.videoWidth || original.clientWidth || 280;
      frame.height = original.videoHeight || original.clientHeight || 160;
      const context = frame.getContext("2d")!;
      const placeholder = () => {
        frame.width = frame.width;
        context.fillStyle = "#27272a";
        context.fillRect(0, 0, frame.width, frame.height);
        context.fillStyle = "#d4d4d8";
        context.font = "16px sans-serif";
        context.fillText("Vídeo", 16, 30);
      };
      const image = document.createElement("img");
      image.className = video.className;
      image.style.cssText = video.style.cssText;
      try {
        if (original.readyState >= 2) context.drawImage(original, 0, 0, frame.width, frame.height);
        else placeholder();
        image.src = frame.toDataURL("image/png");
      } catch {
        placeholder();
        image.src = frame.toDataURL("image/png");
      }
      video.replaceWith(image);
    });
    clone.querySelectorAll("audio").forEach((audio) => audio.remove());
    // O Unicode evita depender do CDN de emojis durante a exportação.
    clone.querySelectorAll<HTMLImageElement>('img[src*="emoji-datasource-apple"]').forEach((image) => image.replaceWith(document.createTextNode(image.alt)));
    clone.querySelectorAll("img").forEach((image) => { image.loading = "eager"; });
    snapshot.append(clone);
  }
  host.append(snapshot);
  document.body.append(host);
  try {
    await document.fonts.ready;
    const authenticatedOrigins = new Set([location.origin, new URL(process.env.NEXT_PUBLIC_API_URL ?? "/api", location.href).origin]);
    await Promise.all(Array.from(snapshot.querySelectorAll("img")).map(async (image) => {
      let objectUrl: string | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const bounds = image.getBoundingClientRect();
      try {
        image.removeAttribute("srcset");
        image.removeAttribute("crossorigin");
        if (!image.src.startsWith("data:")) {
          const url = new URL(image.src, location.href);
          const response = await fetch(url, { credentials: authenticatedOrigins.has(url.origin) ? "include" : "omit", signal: AbortSignal.timeout(8000) });
          if (!response.ok) throw new Error(`Imagem indisponível (${response.status})`);
          objectUrl = URL.createObjectURL(await response.blob());
          image.src = objectUrl;
        }
        await Promise.race([image.decode(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Tempo esgotado ao carregar imagem")), 8000); })]);
        if (!image.naturalWidth) throw new Error("Imagem inválida");
        // PNGs locais eliminam novas requisições, SVGs externos e GIFs durante a composição.
        const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight), Math.max(80, bounds.width * 2) / image.naturalWidth);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.ceil(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.ceil(image.naturalHeight * scale));
        canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
        image.src = canvas.toDataURL("image/png");
        await image.decode();
      } catch {
        if (image.dataset.printAvatar || image.dataset.printLogo) image.remove();
        else if (image.classList.contains("rounded-full")) {
          const initial = document.createElement("span");
          initial.textContent = image.alt.trim().charAt(0).toUpperCase() || "?";
          Object.assign(initial.style, { display: "flex", alignItems: "center", justifyContent: "center", flexShrink: "0", borderRadius: "50%", background: "#3f3f46", width: `${bounds.width || 40}px`, height: `${bounds.height || 40}px` });
          image.replaceWith(initial);
        } else {
          const placeholder = document.createElement("span");
          placeholder.textContent = "Imagem indisponível";
          Object.assign(placeholder.style, { display: "flex", alignItems: "center", justifyContent: "center", width: `${bounds.width || 280}px`, maxWidth: "100%", minHeight: "80px", padding: "16px", borderRadius: "12px", background: "#27272a", color: "#a1a1aa", fontSize: "12px" });
          image.replaceWith(placeholder);
        }
      } finally {
        clearTimeout(timer);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      }
    }));
    const width = snapshot.scrollWidth;
    const height = snapshot.scrollHeight;
    if (!width || !height) throw new Error("A conversa precisa estar visível para gerar o print.");
    const pixelRatio = Math.min(2, 16000 / width, 16000 / height, Math.sqrt(24000000 / (width * height)));
    const blob = await toBlob(snapshot, {
      backgroundColor: "#09090b", pixelRatio, preferredFontFormat: "woff2",
      fetchRequestInit: { credentials: "include", signal: AbortSignal.timeout(15000) },
    });
    if (!blob) throw new Error("Não foi possível gerar a imagem da conversa.");
    return new File([blob], `print-conversa-${Date.now()}.png`, { type: "image/png" });
  } catch (error) {
    console.error("Falha ao gerar print da conversa", { messages: messageIds.length, width: snapshot.scrollWidth, height: snapshot.scrollHeight, error });
    if (error instanceof Error) throw error;
    throw new Error("O navegador não conseguiu montar a imagem do trecho. Tente selecionar menos mensagens.");
  } finally {
    host.remove();
  }
}

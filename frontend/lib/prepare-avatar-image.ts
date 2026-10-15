const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_DATA_URL_LENGTH = 56_000;

export async function prepareAvatarImage(file: File): Promise<string> {
  if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
    throw new Error("Escolha uma imagem JPG, PNG ou WebP.");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("A imagem deve ter no máximo 5 MB.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Não foi possível abrir essa imagem."));
      element.src = objectUrl;
    });
    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = (image.naturalWidth - sourceSize) / 2;
    const sourceY = (image.naturalHeight - sourceSize) / 2;

    for (const outputSize of [320, 256, 192]) {
      const canvas = document.createElement("canvas");
      canvas.width = outputSize;
      canvas.height = outputSize;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Não foi possível processar essa imagem.");
      context.fillStyle = "#18181b";
      context.fillRect(0, 0, outputSize, outputSize);
      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, outputSize, outputSize);

      for (const quality of [0.82, 0.68, 0.54, 0.42]) {
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        if (dataUrl.length <= MAX_DATA_URL_LENGTH) return dataUrl;
      }
    }
    throw new Error("Não foi possível reduzir a imagem. Escolha outra foto.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

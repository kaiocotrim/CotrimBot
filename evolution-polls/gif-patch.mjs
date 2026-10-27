import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function patchEvolutionGifs(root) {
  const dtoPath = path.join(root, "src/api/dto/sendMessage.dto.ts");
  const servicePath = path.join(root, "src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts");
  const [dto, service] = await Promise.all([readFile(dtoPath, "utf8"), readFile(servicePath, "utf8")]);
  const oldPlayback = "prepareMedia[mediaType].gifPlayback = false;";
  const newPlayback = "prepareMedia[mediaType].gifPlayback = mediaMessage.gifPlayback === true;";
  if (service.includes(newPlayback) && dto.includes("gifPlayback?: boolean;")) return;
  if (!service.includes(oldPlayback) || !dto.includes("export class MediaMessage {") || !dto.includes("export class SendMediaDto extends Metadata {")) throw new Error("Evolution source differs from supported 2.3.7 GIF markers; no GIF patch applied.");
  const nextDto = dto.replace("export class MediaMessage {", "export class MediaMessage {\n  gifPlayback?: boolean;").replace("export class SendMediaDto extends Metadata {", "export class SendMediaDto extends Metadata {\n  gifPlayback?: boolean;");
  await writeFile(dtoPath, nextDto);
  await writeFile(servicePath, service.replace(oldPlayback, newPlayback));
}

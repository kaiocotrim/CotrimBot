import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function patchEvolutionGifs(root) {
  const dtoPath = path.join(root, "src/api/dto/sendMessage.dto.ts");
  const servicePath = path.join(root, "src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts");
  const routerPath = path.join(root, "src/api/routes/sendMessage.router.ts");
  const [dto, service, router] = await Promise.all([readFile(dtoPath, "utf8"), readFile(servicePath, "utf8"), readFile(routerPath, "utf8")]);
  const oldPlayback = "prepareMedia[mediaType].gifPlayback = false;";
  const newPlayback = "prepareMedia[mediaType].gifPlayback = mediaMessage.gifPlayback === true;";
  const alreadyPatched = service.includes(newPlayback) && (dto.match(/gifPlayback\?: boolean;/g) || []).length >= 2;
  const gifRoute = ".post(this.routerPath('sendGif'),";
  const mediaRoute = ".post(this.routerPath('sendMedia'),";
  if (alreadyPatched && router.includes(gifRoute)) return;
  if ((!alreadyPatched && (!service.includes(oldPlayback) || !dto.includes("export class MediaMessage {") || !dto.includes("export class SendMediaDto extends Metadata {"))) || !router.includes(mediaRoute)) throw new Error("Evolution source differs from supported 2.3.7 GIF markers; no GIF patch applied.");
  const nextDto = alreadyPatched ? dto : dto.replace("export class MediaMessage {", "export class MediaMessage {\n  gifPlayback?: boolean;").replace("export class SendMediaDto extends Metadata {", "export class SendMediaDto extends Metadata {\n  gifPlayback?: boolean;");
  const nextRouter = router.includes(gifRoute) ? router : router.replace(mediaRoute, `${gifRoute} ...guards, async (req, res) => {
        const bodyData = { ...req.body, mediatype: 'video', mimetype: 'video/mp4', gifPlayback: true };
        const response = await this.dataValidate<SendMediaDto>({
          request: req,
          schema: mediaMessageSchema,
          ClassRef: SendMediaDto,
          execute: (instance) => sendMessageController.sendMedia(instance, bodyData),
        });
        return res.status(HttpStatus.CREATED).json(response);
      })
      ${mediaRoute}`);
  await writeFile(dtoPath, nextDto);
  await writeFile(servicePath, service.replace(oldPlayback, newPlayback));
  await writeFile(routerPath, nextRouter);
}

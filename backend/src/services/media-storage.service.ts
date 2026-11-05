import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

// Variáveis: S3_BUCKET, AWS_REGION, S3_ENDPOINT (opcional), S3_FORCE_PATH_STYLE (opcional)
// e as credenciais AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY lidas pelo SDK.
let client: S3Client | null = null;

function storageConfig() {
  const bucket = process.env.S3_BUCKET;
  const region = process.env.AWS_REGION;
  if (!bucket || !region) {
    throw new Error("Configure S3_BUCKET e AWS_REGION para armazenar anexos no S3");
  }
  return { bucket, region };
}

function s3Client() {
  if (!client) {
    const { region } = storageConfig();
    const endpoint = process.env.S3_ENDPOINT;
    client = new S3Client({
      region,
      ...(endpoint ? { endpoint } : {}),
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    });
  }
  return client;
}

export async function uploadMediaObject(data: Uint8Array, mimetype: string): Promise<string> {
  const { bucket } = storageConfig();
  const key = `media/${randomUUID()}`;
  await s3Client().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: data, ContentType: mimetype }));
  return key;
}

export async function downloadMediaObject(key: string): Promise<Buffer> {
  const { bucket } = storageConfig();
  const response = await s3Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) throw new Error("Objeto de mídia vazio no S3");
  return Buffer.from(await response.Body.transformToByteArray());
}

// Registros antigos ainda guardam os bytes no banco; os novos usam apenas storageKey.
export async function readStoredMedia(media: { storageKey: string | null; data: Uint8Array | null }): Promise<Buffer> {
  if (media.storageKey) return downloadMediaObject(media.storageKey);
  if (media.data) return Buffer.from(media.data);
  throw new Error("Mídia sem conteúdo armazenado");
}

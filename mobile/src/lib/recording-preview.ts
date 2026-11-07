import type { UploadAttachment } from './types';

export function recordingLevel(db?: number): number {
  if (db === undefined || !Number.isFinite(db)) return 3;
  return 3 + Math.pow(Math.max(0, Math.min(1, (db + 60) / 60)), 1.5) * 33;
}

export function recordingAttachment(uri: string | null, durationMillis: number): UploadAttachment {
  if (!uri || !Number.isFinite(durationMillis) || durationMillis < 300) throw new Error('O áudio ficou muito curto. Grave novamente.');
  return { uri, name: `audio-${Date.now()}.m4a`, mimeType: 'audio/mp4' };
}

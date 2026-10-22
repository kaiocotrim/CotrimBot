import { createHash, randomBytes } from "node:crypto";

const TOKEN_PREFIX = "cbt_";
const TOKEN_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const MAX_API_TOKENS_PER_USER = 20;

export function createApiToken() {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return {
    token,
    tokenHash: hashApiToken(token)!,
    tokenPrefix: token.slice(0, 12),
  };
}

export function hashApiToken(token: string): string | null {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const secret = token.slice(TOKEN_PREFIX.length);
  if (!TOKEN_SECRET_PATTERN.test(secret)) return null;
  return createHash("sha256").update(token).digest("hex");
}

interface ApiTokenUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  image?: string | null;
  banned: boolean | null;
  banExpires?: Date | null;
}

interface ApiTokenAuthDatabase<T extends ApiTokenUser> {
  apiToken: {
    findFirst(args: {
      where: { tokenHash: string; revokedAt: null };
      include: { user: true };
    }): Promise<{ id: string; user: T } | null>;
    updateMany(args: {
      where: { id: string; revokedAt: null };
      data: { lastUsedAt: Date };
    }): Promise<{ count: number }>;
  };
}

export async function authenticateApiToken<T extends ApiTokenUser>(
  authorization: string | undefined,
  database: ApiTokenAuthDatabase<T>,
): Promise<T | null> {
  if (!authorization?.startsWith("Bearer ")) return null;
  const tokenHash = hashApiToken(authorization.slice("Bearer ".length));
  if (!tokenHash) return null;

  const record = await database.apiToken.findFirst({
    where: { tokenHash, revokedAt: null },
    include: { user: true },
  });
  if (!record) return null;

  const currentlyBanned = record.user.banned === true
    && (!record.user.banExpires || record.user.banExpires > new Date());
  if (currentlyBanned) return null;

  const updated = await database.apiToken.updateMany({
    where: { id: record.id, revokedAt: null },
    data: { lastUsedAt: new Date() },
  });
  return updated.count === 1 ? record.user : null;
}

import "dotenv/config";
import { hashPassword } from "better-auth/crypto";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || "test@example.com";
  const password = process.env.SEED_ADMIN_PASSWORD || "your_secure_password";

  if (!process.env.SEED_ADMIN_EMAIL || !process.env.SEED_ADMIN_PASSWORD) {
    console.warn(
      "WARNING: Using default email and password. Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD environment variables."
    );
  }

  const passwordHash = await hashPassword(password);

  console.log(`Email: ${email}`);
  console.log(`Hashed Password: ${passwordHash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

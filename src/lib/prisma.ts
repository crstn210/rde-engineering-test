import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Single shared Prisma client to avoid exhausting connections during
// dev HMR (Prisma's warning, not ours — see prisma docs on Next.js).
//
// Prisma v7 uses driver adapters; we wire `@prisma/adapter-pg` against
// the Neon Postgres URL. Same adapter works locally and on Vercel —
// no env-specific branching required.

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof makePrisma> | undefined;
};

function makePrisma() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL not set — cannot initialize Prisma client.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? makePrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type DbClient = typeof prisma;

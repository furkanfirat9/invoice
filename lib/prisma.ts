import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
};

// Prisma Client Extension for Retry Logic
const prismaClientSingleton = () => {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, model, args, query }) {
          const MAX_RETRIES = 3;
          let retries = 0;

          while (true) {
            try {
              return await query(args);
            } catch (error: any) {
              // Retry on connection errors
              // P1001: Can't reach database server
              // P1008: Operations timed out
              // P1017: Server has closed the connection
              if (
                (error?.code === "P1001" ||
                  error?.code === "P1008" ||
                  error?.code === "P1017") &&
                retries < MAX_RETRIES
              ) {
                retries++;
                console.warn(
                  `Database connection error (${error.code}). Retrying... (${retries}/${MAX_RETRIES})`
                );
                // Exponential backoff: 100ms, 200ms, 400ms
                await new Promise((resolve) =>
                  setTimeout(resolve, 100 * Math.pow(2, retries - 1))
                );
                continue;
              }
              throw error;
            }
          }
        },
      },
    },
  });
};

export type ExtendedPrismaClient = ReturnType<typeof prismaClientSingleton>;

export const prisma =
  (globalForPrisma.prisma as ExtendedPrismaClient) ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;






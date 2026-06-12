// loadEnv.ts — load .env / .env.local for the standalone (tsx) server BEFORE any
// module that reads process.env at import time (e.g. the Prisma client). Import this
// first in server.ts.
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

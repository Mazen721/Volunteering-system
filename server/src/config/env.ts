import dotenv from 'dotenv';

const REQUIRED_ENV_VARS = [
  'MONGO_URI',
  'JWT_SECRET',
  'CLIENT_URL',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
] as const;

export interface AppEnv {
  port: number;
  mongoUri: string;
  jwtSecret: string;
  clientUrl: string;
  adminEmail: string;
  adminPassword: string;
  allowedEmailDomains: string[];
}

export function parseAllowedEmailDomains(rawDomains?: string): string[] {
  if (!rawDomains) {
    return [];
  }
  const normalized = rawDomains
    .split(',')
    .map((entry) => entry.trim().toLowerCase().replace(/^@+/, ''))
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

/**
 * Validates raw environment variables and normalizes configuration values.
 */
export function validateEnv(rawEnv: Record<string, string | undefined>): AppEnv {
  const missing = REQUIRED_ENV_VARS.filter((name) => !rawEnv[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const rawPort = rawEnv.PORT?.trim();
  const port = rawPort ? Number(rawPort) : 5000;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT value: ${rawEnv.PORT}`);
  }

  return {
    port,
    mongoUri: rawEnv.MONGO_URI!.trim(),
    jwtSecret: rawEnv.JWT_SECRET!.trim(),
    clientUrl: rawEnv.CLIENT_URL!.trim(),
    adminEmail: rawEnv.ADMIN_EMAIL!.trim(),
    adminPassword: rawEnv.ADMIN_PASSWORD!,
    allowedEmailDomains: parseAllowedEmailDomains(rawEnv.ALLOWED_EMAIL_DOMAINS),
  };
}

/**
 * Loads .env into process.env and validates required configuration.
 */
export function loadEnv(): AppEnv {
  dotenv.config({ quiet: true });
  return validateEnv(process.env);
}

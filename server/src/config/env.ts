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

const DEFAULT_ALLOWED_EMAIL_DOMAINS = ['mnu.edu.eg'];

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
 * Falls back to the university domain when ALLOWED_EMAIL_DOMAINS is unset or empty.
 */
export function resolveAllowedEmailDomains(rawDomains?: string): string[] {
  const parsed = parseAllowedEmailDomains(rawDomains);
  return parsed.length > 0 ? parsed : [...DEFAULT_ALLOWED_EMAIL_DOMAINS];
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

  const jwtSecret = rawEnv.JWT_SECRET!.trim();
  const adminPassword = rawEnv.ADMIN_PASSWORD!;
  // Production refuses to boot on weak secrets (S-3): a short JWT secret is
  // brute-forceable offline from any leaked token, and the seeded admin
  // password is the keys to the whole system. Development/test keep working
  // with local values; strength is enforced where it matters.
  if (rawEnv.NODE_ENV?.trim() === 'production') {
    if (jwtSecret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters in production');
    }
    if (adminPassword.length < 12) {
      throw new Error('ADMIN_PASSWORD must be at least 12 characters in production');
    }
  }

  return {
    port,
    mongoUri: rawEnv.MONGO_URI!.trim(),
    jwtSecret,
    clientUrl: rawEnv.CLIENT_URL!.trim(),
    adminEmail: rawEnv.ADMIN_EMAIL!.trim(),
    adminPassword,
    allowedEmailDomains: resolveAllowedEmailDomains(rawEnv.ALLOWED_EMAIL_DOMAINS),
  };
}

/**
 * Loads .env into process.env and validates required configuration.
 */
export function loadEnv(): AppEnv {
  dotenv.config({ quiet: true });
  return validateEnv(process.env);
}

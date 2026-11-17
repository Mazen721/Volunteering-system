import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';

export interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
}

export interface ApiResponse<T> {
  status: number;
  body: T;
}

/**
 * Starts an Express app on a random local port and exposes its base URL.
 */
export async function startTestServer(app: Express): Promise<TestServer> {
  const server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

/**
 * Reads a JSON response body with an explicit expected shape.
 */
export async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/**
 * Calls a protected JSON API route and returns the status and parsed body.
 */
export async function apiJson<T>(
  baseUrl: string,
  route: string,
  token: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${baseUrl}${route}`, { ...options, headers });
  return { status: response.status, body: await readJson<T>(response) };
}

/**
 * Points an existing MongoDB URI at an isolated test database.
 */
export function buildTestDbUri(mongoUri: string, databaseName: string): string {
  const url = new URL(mongoUri);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

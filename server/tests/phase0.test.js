import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateEnv } from '../src/config/env.js';
import { createApp } from '../src/app.js';

const BASE_ENV = {
  MONGO_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/volunteer_hours',
  JWT_SECRET: 'test-secret',
  CLIENT_URL: 'http://localhost:5173',
  ADMIN_EMAIL: 'admin@mnu.edu.eg',
  ADMIN_PASSWORD: 'secret-password',
};

describe('validateEnv', () => {
  it('defaults_port_to_5000_and_trims_values', () => {
    const config = validateEnv({
      ...BASE_ENV,
      MONGO_URI: '  mongodb+srv://user:pass@cluster.mongodb.net/volunteer_hours  ',
    });

    assert.equal(config.port, 5000);
    assert.equal(config.mongoUri, BASE_ENV.MONGO_URI);
  });

  const invalidPorts = ['0', '-1', '65536', 'abc', '3.5'];
  for (const badPort of invalidPorts) {
    it(`rejects_invalid_port_${badPort}`, () => {
      assert.throws(() => validateEnv({ ...BASE_ENV, PORT: badPort }), /Invalid PORT value/);
    });
  }

  const requiredKeys = ['MONGO_URI', 'JWT_SECRET', 'CLIENT_URL', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'];
  for (const key of requiredKeys) {
    it(`throws_when_${key}_is_missing_or_blank`, () => {
      assert.throws(() => validateEnv({ ...BASE_ENV, [key]: '   ' }), new RegExp(key));
    });
  }
});

describe('GET /api/health', () => {
  it('returns_ok_json_and_cors_header_for_client_origin', async () => {
    const app = createApp('http://localhost:5173');
    const server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });

    try {
      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        headers: { Origin: 'http://localhost:5173' },
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(body, { status: 'ok' });
      assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    } finally {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});

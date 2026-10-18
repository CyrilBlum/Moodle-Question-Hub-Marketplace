import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../src/config';

describe('Config', () => {
  it('rejects a publicly known JWT secret in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'development-secret-must-be-at-least-32-chars-long!' })).toThrow();
    expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'super-secret-jwt-key-must-be-at-least-32-chars-long!' })).toThrow();
  });

  it('accepts a custom JWT secret in production and the default in development', () => {
    expect(loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'a-real-secret-0123456789abcdef0123456789' }).NODE_ENV).toBe('production');
    expect(loadConfig({ NODE_ENV: 'development', JWT_SECRET: 'development-secret-must-be-at-least-32-chars-long!' }).NODE_ENV).toBe('development');
  });
});

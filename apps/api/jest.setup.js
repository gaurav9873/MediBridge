/**
 * Environment for unit tests.
 *
 * Set explicitly rather than read from .env: a test that passes or fails
 * depending on a developer's local file is not a test. Nothing here touches a
 * real database or Redis — these values only satisfy the config schema, which
 * validates at import time.
 */
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
process.env.REDIS_URL = 'redis://localhost:6379'
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-for-the-schema'
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-for-the-schema'

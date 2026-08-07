/**
 * Unit tests only — no database, no Nest container.
 *
 * What is worth testing is set out in docs/MODULE-STANDARD.md: money
 * arithmetic, state machines, compliance gates, tenant isolation, and anything
 * with a reduce or a date comparison in it. Not "Prisma saves a row".
 *
 * Tenant isolation is the exception: it needs a real database to mean anything,
 * so it lives in scripts/verify-tenant-isolation.mjs and runs against Postgres
 * as the restricted role. Faking it here would prove nothing — testing it as
 * the owner is precisely the mistake that let a broken RLS setup ship.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  // The shared packages are built to CJS and linked by the workspace, so Node
  // resolution finds them. Importing their TypeScript sources instead would
  // mean maintaining a second module-resolution story just for tests.
  setupFiles: ['<rootDir>/../jest.setup.js'],
  clearMocks: true,
}

/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  // Excludes *.integration.spec.ts (see jest.integration.config.js) — those
  // require the real local stack (docker compose up -d) and are run
  // explicitly via `npm run test:integration`, not as part of this
  // fast/infra-independent default suite.
  testRegex: '^(?!.*\\.integration\\.spec\\.ts$).*\\.spec\\.ts$',
};

/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  // Phase 21 (spec §30): kept in a separate config/regex from jest.config.js
  // so the default `npm test` stays fast and infra-independent — these
  // require `docker compose up -d` and are run explicitly via
  // `npm run test:integration`.
  testRegex: '.*\\.integration\\.spec\\.ts$',
};

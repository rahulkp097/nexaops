// Runs before any integration test module is imported (Jest `setupFiles`),
// since ../db's `pool` and ../model/runtime's cache dir are both read from
// process.env at *import* time, not lazily — these must be set first.
process.env.DATABASE_APP_URL ??= 'postgresql://nexaops_app:dev-app-password@localhost:55432/nexaops';
process.env.STORAGE_PATH ??= './storage-integration-test';

/**
 * Integration test setup — runs BEFORE any module import.
 *
 * Sets DATABASE_PATH=':memory:' so the db singleton opens an in-memory SQLite
 * database (not local.db on disk) with the full schema from db.ts migrations.
 *
 * Must run before any @/lib/db import, which is guaranteed by listing this
 * as a setupFile in the vitest integration project.
 */

// Point the db singleton at an in-memory database for every integration test file.
process.env.DATABASE_PATH = ":memory:";

// Ensure server-wallet spending is disabled by default in integration tests
// (no real BSV transactions should ever leave this test environment).
process.env.BSV_WALLET_SPEND_DISABLED = "true";

// Prevent real WIF loading in tests
delete process.env.BSV_SERVER_WIF;

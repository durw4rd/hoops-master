/**
 * Shared constants for the embedded test Postgres. Imported by both
 * globalSetup (main process) and setup (worker processes) so no env
 * propagation between processes is needed.
 */

export const TEST_PG_PORT = 55432;
export const TEST_PG_DIR = '.pgdata-test';
export const TEST_DATABASE_URL = `postgresql://postgres:password@localhost:${TEST_PG_PORT}/hoops_test`;

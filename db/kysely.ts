import type * as KyselyModule from 'kysely';

const kysely = require('kysely/dist/cjs/index.js') as typeof KyselyModule;

export const Kysely = kysely.Kysely;
export const Migrator = kysely.Migrator;
export const sql = kysely.sql;

export type {
  Generated,
  Migration,
  MigrationProvider,
  Selectable,
} from 'kysely';

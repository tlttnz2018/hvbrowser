import type * as KyselyModule from 'kysely';

const { Kysely } = require('kysely/dist/cjs/kysely.js') as Pick<typeof KyselyModule, 'Kysely'>;
const { Migrator } = require('kysely/dist/cjs/migration/migrator.js') as Pick<typeof KyselyModule, 'Migrator'>;
const { sql } = require('kysely/dist/cjs/raw-builder/sql.js') as Pick<typeof KyselyModule, 'sql'>;

export { Kysely, Migrator, sql };

export type {
  Generated,
  Migration,
  MigrationProvider,
  Selectable,
} from 'kysely';

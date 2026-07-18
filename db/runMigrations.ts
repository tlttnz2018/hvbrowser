import { Kysely } from 'kysely';

export interface AppMigration {
  up(db: Kysely<any>): Promise<void>;
  down?(db: Kysely<any>): Promise<void>;
}

interface MigrationTableRow {
  name: string;
}

let migrationQueue: Promise<void> = Promise.resolve();

export async function runMigrations(
  db: Kysely<any>,
  migrations: Record<string, AppMigration>,
  migrationTableName: string,
) {
  const pendingRun = migrationQueue.then(() =>
    runMigrationsImmediately(db, migrations, migrationTableName),
  );
  migrationQueue = pendingRun.catch(() => undefined);
  return pendingRun;
}

async function runMigrationsImmediately(
  db: Kysely<any>,
  migrations: Record<string, AppMigration>,
  migrationTableName: string,
) {
  await db.schema
    .createTable(migrationTableName)
    .ifNotExists()
    .addColumn('name', 'varchar(255)', (col) => col.notNull().primaryKey())
    .addColumn('timestamp', 'varchar(255)', (col) => col.notNull())
    .execute();

  const executedRows = await db.selectFrom(migrationTableName).select('name').execute();
  const executedNames = new Set((executedRows as MigrationTableRow[]).map((row) => row.name));
  const pendingMigrations = Object.entries(migrations).sort(([leftName], [rightName]) =>
    leftName.localeCompare(rightName),
  );

  for (const [migrationName, migration] of pendingMigrations) {
    if (executedNames.has(migrationName)) {
      continue;
    }

    await migration.up(db);
    await db
      .insertInto(migrationTableName)
      .values({
        name: migrationName,
        timestamp: new Date().toISOString(),
      })
      .execute();
  }
}

import { openDatabaseSync, SQLiteBindParams, SQLiteDatabase } from 'expo-sqlite';
import {
  CompiledQuery,
  DatabaseConnection,
  Dialect,
  Driver,
  Kysely,
  QueryCompiler,
  SelectQueryNode,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from 'kysely';

class ConnectionMutex {
  private promise: Promise<void> | undefined;
  private resolve: (() => void) | undefined;

  async lock() {
    while (this.promise) {
      await this.promise;
    }

    this.promise = new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  unlock() {
    const resolve = this.resolve;
    this.promise = undefined;
    this.resolve = undefined;
    resolve?.();
  }
}

class ExpoSqliteConnection implements DatabaseConnection {
  constructor(private readonly database: SQLiteDatabase) {}

  async executeQuery<R>(compiledQuery: CompiledQuery) {
    const statement = await this.database.prepareAsync(compiledQuery.sql);

    try {
      const result = await statement.executeAsync<R>(compiledQuery.parameters as SQLiteBindParams);

      let rows: R[] = [];

      try {
        rows = await result.getAllAsync();
      } catch {
        rows = [];
      }

      return {
        numAffectedRows:
          result.changes !== undefined && result.changes !== null
            ? BigInt(result.changes)
            : undefined,
        insertId:
          result.lastInsertRowId !== undefined && result.lastInsertRowId !== null
            ? BigInt(result.lastInsertRowId)
            : undefined,
        rows,
      };
    } finally {
      await statement.finalizeAsync();
    }
  }

  async *streamQuery<R>(compiledQuery: CompiledQuery) {
    if (!SelectQueryNode.is(compiledQuery.query)) {
      throw new Error('Expo SQLite streaming only supports select queries.');
    }

    const statement = await this.database.prepareAsync(compiledQuery.sql);

    try {
      const result = await statement.executeAsync<R>(compiledQuery.parameters as SQLiteBindParams);

      for await (const row of result) {
        yield { rows: [row] };
      }
    } finally {
      await statement.finalizeAsync();
    }
  }
}

class ExpoSqliteDriver implements Driver {
  private readonly connectionMutex = new ConnectionMutex();
  private readonly connection: ExpoSqliteConnection;

  constructor(private readonly database: SQLiteDatabase) {
    this.connection = new ExpoSqliteConnection(database);
  }

  async init(): Promise<void> {}

  async acquireConnection(): Promise<DatabaseConnection> {
    await this.connectionMutex.lock();
    return this.connection;
  }

  async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('begin'));
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('commit'));
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('rollback'));
  }

  async releaseConnection(): Promise<void> {
    this.connectionMutex.unlock();
  }

  async destroy(): Promise<void> {
    await this.database.closeAsync();
  }
}

export class ExpoSqliteDialect implements Dialect {
  constructor(private readonly database: SQLiteDatabase) {}

  createAdapter() {
    return new SqliteAdapter();
  }

  createDriver(): Driver {
    return new ExpoSqliteDriver(this.database);
  }

  createIntrospector(db: Kysely<any>) {
    return new SqliteIntrospector(db);
  }

  createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler();
  }
}

export function createExpoSqliteDatabase(databaseName: string) {
  return openDatabaseSync(databaseName);
}

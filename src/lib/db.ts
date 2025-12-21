import mysql, { type Pool } from 'mysql2/promise';
import { env } from './env';

type SelectOptions = { count?: 'exact'; head?: boolean };
type OrderOptions = { ascending?: boolean };
type QueryResult<T> = { data: T | T[] | null; error: QueryError | null; count?: number | null };
type QueryError = Error & { code?: string };
type QueryMode = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

declare global {
  // eslint-disable-next-line no-var
  var mysqlPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var mysqlClient: DatabaseClient | undefined;
}

function toQueryError(error: unknown): QueryError {
  if (error instanceof Error) {
    return error as QueryError;
  }
  return new Error(String(error)) as QueryError;
}

function normaliseError(error: unknown): QueryError {
  const base = toQueryError(error);
  const code = (error as { code?: string } | null)?.code;
  if (code === 'ER_BAD_FIELD_ERROR') {
    base.code = '42703';
  } else if (code === 'ER_NO_SUCH_TABLE') {
    base.code = '42P01';
  } else if (code === 'ER_DUP_ENTRY') {
    base.code = '23505';
  } else if (typeof code === 'string') {
    base.code = code;
  }
  return base;
}

function buildNotFoundError(): QueryError {
  const error = new Error('No rows found') as QueryError;
  error.code = 'PGRST116';
  return error;
}

function buildMultiRowError(): QueryError {
  const error = new Error('Multiple rows found') as QueryError;
  error.code = 'PGRST118';
  return error;
}

class QueryBuilder<T = Record<string, unknown>> implements PromiseLike<QueryResult<T>> {
  private mode: QueryMode = 'select';
  private selectColumns = '*';
  private returningColumns: string | null = null;
  private selectOptions: SelectOptions = {};
  private values: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private upsertConflictTarget: string | null = null;
  private whereClauses: Array<{ sql: string; params: unknown[] }> = [];
  private orderBy: Array<{ field: string; direction: 'ASC' | 'DESC' }> = [];
  private limitValue: number | null = null;
  private offsetValue: number | null = null;
  private emptyResult = false;
  private expectSingle = false;
  private allowNullSingle = false;

  constructor(private table: string, private pool: Pool) {}

  select(columns = '*', options: SelectOptions = {}): this {
    if (this.mode === 'select') {
      this.selectColumns = columns;
      this.selectOptions = options;
    } else {
      this.returningColumns = columns;
    }
    return this;
  }

  insert(values: Record<string, unknown> | Record<string, unknown>[]): this {
    this.mode = 'insert';
    this.values = values;
    return this;
  }

  upsert(values: Record<string, unknown> | Record<string, unknown>[], options?: { onConflict?: string }): this {
    this.mode = 'upsert';
    this.values = values;
    this.upsertConflictTarget = options?.onConflict ?? null;
    return this;
  }

  update(values: Record<string, unknown>): this {
    this.mode = 'update';
    this.values = values;
    return this;
  }

  delete(): this {
    this.mode = 'delete';
    return this;
  }

  eq(field: string, value: unknown): this {
    this.whereClauses.push({ sql: `${field} = ?`, params: [value] });
    return this;
  }

  gte(field: string, value: unknown): this {
    this.whereClauses.push({ sql: `${field} >= ?`, params: [value] });
    return this;
  }

  lte(field: string, value: unknown): this {
    this.whereClauses.push({ sql: `${field} <= ?`, params: [value] });
    return this;
  }

  in(field: string, values: unknown[]): this {
    const list = Array.from(new Set(values ?? []));
    if (list.length === 0) {
      this.emptyResult = true;
      return this;
    }
    const placeholders = list.map(() => '?').join(', ');
    this.whereClauses.push({ sql: `${field} IN (${placeholders})`, params: list });
    return this;
  }

  ilike(field: string, pattern: string): this {
    this.whereClauses.push({ sql: `LOWER(${field}) LIKE ?`, params: [pattern.toLowerCase()] });
    return this;
  }

  not(field: string, operator: string, value: unknown): this {
    if (operator === 'is' && value === null) {
      this.whereClauses.push({ sql: `${field} IS NOT NULL`, params: [] });
      return this;
    }
    if (operator === 'in' && Array.isArray(value)) {
      const placeholders = value.map(() => '?').join(', ');
      this.whereClauses.push({ sql: `${field} NOT IN (${placeholders})`, params: value });
      return this;
    }
    this.whereClauses.push({ sql: `${field} != ?`, params: [value] });
    return this;
  }

  is(field: string, value: unknown): this {
    if (value === null) {
      this.whereClauses.push({ sql: `${field} IS NULL`, params: [] });
    } else {
      this.whereClauses.push({ sql: `${field} = ?`, params: [value] });
    }
    return this;
  }

  or(expression: string): this {
    const parts = expression
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      return this;
    }
    const conditions: string[] = [];
    const params: unknown[] = [];
    parts.forEach((part) => {
      const [field, operator, ...valueParts] = part.split('.');
      const value = valueParts.join('.');
      if (!field || !operator) return;
      if (operator === 'ilike') {
        conditions.push(`LOWER(${field}) LIKE ?`);
        params.push(value.toLowerCase());
      } else if (operator === 'eq') {
        conditions.push(`${field} = ?`);
        params.push(value);
      }
    });
    if (conditions.length > 0) {
      this.whereClauses.push({ sql: `(${conditions.join(' OR ')})`, params });
    }
    return this;
  }

  order(field: string, options: OrderOptions = {}): this {
    this.orderBy.push({ field, direction: options.ascending === false ? 'DESC' : 'ASC' });
    return this;
  }

  range(from: number, to: number): this {
    this.offsetValue = from;
    this.limitValue = Math.max(0, to - from + 1);
    return this;
  }

  limit(value: number): this {
    this.limitValue = value;
    return this;
  }

  maybeSingle(): Promise<{ data: T | null; error: QueryError | null; count?: number | null }> {
    this.expectSingle = true;
    this.allowNullSingle = true;
    return this.execute() as Promise<{ data: T | null; error: QueryError | null; count?: number | null }>;
  }

  single(): Promise<{ data: T | null; error: QueryError | null; count?: number | null }> {
    this.expectSingle = true;
    this.allowNullSingle = false;
    return this.execute() as Promise<{ data: T | null; error: QueryError | null; count?: number | null }>;
  }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private buildWhereClause(): { sql: string; params: unknown[] } {
    if (this.whereClauses.length === 0) {
      return { sql: '', params: [] };
    }
    const sql = `WHERE ${this.whereClauses.map((clause) => clause.sql).join(' AND ')}`;
    const params = this.whereClauses.flatMap((clause) => clause.params);
    return { sql, params };
  }

  private async runSelect(): Promise<{ rows: T[]; count: number | null }> {
    if (this.emptyResult) {
      return { rows: [], count: this.selectOptions.count === 'exact' ? 0 : null };
    }
    const { sql: whereSql, params } = this.buildWhereClause();
    const orderSql =
      this.orderBy.length > 0
        ? `ORDER BY ${this.orderBy.map((entry) => `${entry.field} ${entry.direction}`).join(', ')}`
        : '';
    const limitSql =
      typeof this.limitValue === 'number'
        ? `LIMIT ${this.limitValue}${typeof this.offsetValue === 'number' ? ` OFFSET ${this.offsetValue}` : ''}`
        : '';

    const count =
      this.selectOptions.count === 'exact'
        ? await this.runCountQuery(whereSql, params).catch(() => null)
        : null;

    if (this.selectOptions.head) {
      return { rows: [], count };
    }

    const sql = `SELECT ${this.selectColumns} FROM ${this.table} ${whereSql} ${orderSql} ${limitSql}`.trim();
    try {
      const [rows] = await this.pool.query(sql, params);
      return { rows: rows as T[], count };
    } catch (error) {
      throw normaliseError(error);
    }
  }

  private async runCountQuery(whereSql: string, params: unknown[]): Promise<number> {
    const countSql = `SELECT COUNT(*) as count FROM ${this.table} ${whereSql}`.trim();
    const [rows] = await this.pool.query(countSql, params);
    const countValue = (rows as Array<{ count: number | string }>)[0]?.count ?? 0;
    const numeric = typeof countValue === 'string' ? Number(countValue) : countValue;
    return Number.isFinite(numeric) ? Number(numeric) : 0;
  }

  private buildInsertParts(
    values: Record<string, unknown> | Record<string, unknown>[],
  ): { columns: string[]; rows: unknown[][] } {
    const list = Array.isArray(values) ? values : [values];
    const columns = Array.from(new Set(list.flatMap((row) => Object.keys(row))));
    const rows = list.map((row) => columns.map((col) => (row as Record<string, unknown>)[col]));
    return { columns, rows };
  }

  private async runInsert(upsert = false): Promise<{ rows: T[] }> {
    if (!this.values) {
      throw new Error('No values provided for insert');
    }
    const { columns, rows } = this.buildInsertParts(this.values);
    if (columns.length === 0 || rows.length === 0) {
      return { rows: [] };
    }

    const placeholders = rows.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
    const sqlBase = `INSERT INTO ${this.table} (${columns.join(', ')}) VALUES ${placeholders}`;
    const flatValues = rows.flat();
    const updates =
      upsert && columns.length > 0
        ? `ON DUPLICATE KEY UPDATE ${columns
            .filter((col) => col !== this.upsertConflictTarget)
            .map((col) => `${col}=VALUES(${col})`)
            .join(', ')}`
        : '';
    const sql = [sqlBase, updates].filter(Boolean).join(' ');

    try {
      const [result] = await this.pool.query(sql, flatValues);
      const insertId = (result as { insertId?: number }).insertId ?? null;

      if (this.returningColumns) {
        const targetId =
          insertId ??
          (Array.isArray(this.values)
            ? (this.values[0] as Record<string, unknown>)?.id
            : (this.values as Record<string, unknown>)?.id);
        if (targetId !== null && targetId !== undefined) {
          const selectSql = `SELECT ${this.returningColumns} FROM ${this.table} WHERE id = ? LIMIT 1`;
          const [rowsFetched] = await this.pool.query(selectSql, [targetId]);
          return { rows: rowsFetched as T[] };
        }
      }

      if (!this.returningColumns && insertId !== null) {
        return { rows: [{ id: insertId } as T] };
      }

      return { rows: [] };
    } catch (error) {
      throw normaliseError(error);
    }
  }

  private async runUpdate(): Promise<{ rows: T[] }> {
    if (!this.values) {
      throw new Error('No values provided for update');
    }
    const entries = Object.entries(this.values);
    if (entries.length === 0) {
      return { rows: [] };
    }
    const setSql = entries.map(([col]) => `${col} = ?`).join(', ');
    const setValues = entries.map(([, value]) => value);
    const { sql: whereSql, params } = this.buildWhereClause();
    const sql = `UPDATE ${this.table} SET ${setSql} ${whereSql}`.trim();
    const allParams = [...setValues, ...params];

    try {
      await this.pool.query(sql, allParams);
      if (this.returningColumns) {
        const selectSql = `SELECT ${this.returningColumns} FROM ${this.table} ${whereSql} LIMIT 1`;
        const [rows] = await this.pool.query(selectSql, params);
        return { rows: rows as T[] };
      }
      return { rows: [] };
    } catch (error) {
      throw normaliseError(error);
    }
  }

  private async runDelete(): Promise<{ rows: T[] }> {
    const { sql: whereSql, params } = this.buildWhereClause();
    const sql = `DELETE FROM ${this.table} ${whereSql}`.trim();
    try {
      await this.pool.query(sql, params);
      return { rows: [] };
    } catch (error) {
      throw normaliseError(error);
    }
  }

  private async execute(): Promise<QueryResult<T>> {
    try {
      if (this.expectSingle && this.mode === 'select' && this.limitValue === null) {
        this.limitValue = this.allowNullSingle ? 1 : 2;
      }

      const result =
        this.mode === 'select'
          ? await this.runSelect()
          : this.mode === 'insert'
            ? await this.runInsert(false)
            : this.mode === 'upsert'
              ? await this.runInsert(true)
              : this.mode === 'update'
                ? await this.runUpdate()
                : await this.runDelete();

      const rows = result.rows ?? [];
      const count: number | null =
        'count' in result && typeof result.count !== 'undefined' && result.count !== null
          ? Number(result.count)
          : null;

      if (this.expectSingle) {
        if (!rows || rows.length === 0) {
          if (this.allowNullSingle) {
            return { data: null, error: null, count };
          }
          return { data: null, error: buildNotFoundError(), count };
        }
        if (rows.length > 1) {
          return { data: null, error: buildMultiRowError(), count };
        }
        return { data: rows[0] ?? null, error: null, count };
      }

      return { data: rows, error: null, count };
    } catch (error) {
      const normalised = normaliseError(error);
      return { data: null, error: normalised, count: null };
    }
  }
}

class DatabaseClient {
  constructor(private pool: Pool) {}

  from<T = Record<string, unknown>>(table: string): QueryBuilder<T> {
    return new QueryBuilder<T>(table, this.pool);
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    try {
      const [rows] = await this.pool.query(sql, params);
      return rows as T[];
    } catch (error) {
      throw normaliseError(error);
    }
  }
}

function createPool(): Pool {
  return mysql.createPool({
    host: env.mysqlHost,
    port: env.mysqlPort,
    user: env.mysqlUser,
    password: env.mysqlPassword,
    database: env.mysqlDatabase,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: false,
    decimalNumbers: true,
    timezone: 'Z',
  });
}

function createClient(): DatabaseClient {
  if (!global.mysqlPool) {
    global.mysqlPool = createPool();
  }
  return new DatabaseClient(global.mysqlPool);
}

export function getSupabaseAdminClient(): DatabaseClient {
  if (!global.mysqlClient) {
    global.mysqlClient = createClient();
  }
  return global.mysqlClient;
}

declare module "better-sqlite3" {
  interface RunResult {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  class Statement<Result = unknown> {
    run(...params: unknown[]): RunResult;
    get(...params: unknown[]): Result | undefined;
    all(...params: unknown[]): Result[];
  }

  class Database {
    constructor(
      filename: string,
      options?: {
        readonly?: boolean;
        fileMustExist?: boolean;
        timeout?: number;
        verbose?: (message?: unknown, ...additionalArgs: unknown[]) => void;
        nativeBinding?: string;
      },
    );
    pragma(source: string): unknown;
    exec(source: string): this;
    prepare<Result = unknown>(source: string): Statement<Result>;
    transaction<Args extends unknown[]>(fn: (...args: Args) => void): (...args: Args) => void;
    close(): void;
  }

  namespace Database {
    export { Database };
  }

  export default Database;
}

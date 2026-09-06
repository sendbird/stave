declare module "better-sqlite3" {
  interface RunResult {
    changes: number;
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
    pragma(source: string, options?: { simple?: boolean }): unknown;
    exec(source: string): this;
    prepare<Result = unknown>(source: string): Statement<Result>;
    transaction<Args extends unknown[], Result>(fn: (...args: Args) => Result): (...args: Args) => Result;
    close(): void;
  }

  namespace Database {
    export { Database };
  }

  export default Database;
}

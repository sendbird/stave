/** A takeover invalidates managed starts that were prepared before it. */
export class TaskControlGate {
  private generations = new Map<string, number>();
  private takingOver = new Set<string>();
  private starting = new Map<string, Promise<void>>();
  acquireStart(taskId?: string) {
    this.capture(taskId);
    if (!taskId) return () => undefined;
    if (this.starting.has(taskId))
      throw new Error(
        "A managed turn is already being prepared for this task.",
      );
    let done!: () => void;
    const pending = new Promise<void>((resolve) => {
      done = resolve;
    });
    this.starting.set(taskId, pending);
    return () => {
      this.starting.delete(taskId);
      done();
    };
  }
  async waitForStart(taskId: string) {
    await this.starting.get(taskId);
  }

  capture(taskId?: string) {
    if (taskId && this.takingOver.has(taskId))
      throw new Error("Task takeover is in progress.");
    return taskId ? (this.generations.get(taskId) ?? 0) : 0;
  }
  assertCurrent(taskId: string, generation: number) {
    if (
      this.takingOver.has(taskId) ||
      (this.generations.get(taskId) ?? 0) !== generation
    )
      throw new Error(
        "Task control changed before this managed turn could start.",
      );
  }
  beginTakeover(taskId: string) {
    if (this.takingOver.has(taskId))
      throw new Error("Task takeover is already in progress.");
    this.generations.set(taskId, (this.generations.get(taskId) ?? 0) + 1);
    this.takingOver.add(taskId);
    return () => {
      this.takingOver.delete(taskId);
    };
  }
}
export const taskControlGate = new TaskControlGate();

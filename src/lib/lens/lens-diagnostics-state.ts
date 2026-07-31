/**
 * Orders async diagnostics state reads/mutations against live state events.
 * A response may update the UI only while its revision remains current.
 */
export class LensDiagnosticsStateRevision {
  private currentRevision = 0;

  supersede(): number {
    this.currentRevision += 1;
    return this.currentRevision;
  }

  isCurrent(revision: number): boolean {
    return revision === this.currentRevision;
  }
}

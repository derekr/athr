import type { Database } from "bun:sqlite";
import type { StoredEvent } from "./store";

export interface Projection {
  name: string;
  init(db: Database): void;
  apply(db: Database, event: StoredEvent): void;
  reset(db: Database): void;
}

export class ProjectionEngine {
  private projections: Projection[] = [];

  constructor(private readonly db: Database) {}

  register(projection: Projection): void {
    this.projections.push(projection);
    projection.init(this.db);
  }

  apply(event: StoredEvent): void {
    for (const projection of this.projections) {
      projection.apply(this.db, event);
    }
  }

  rebuildAll(events: StoredEvent[]): void {
    for (const projection of this.projections) {
      projection.reset(this.db);
    }
    for (const event of events) {
      this.apply(event);
    }
  }
}

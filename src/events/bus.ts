import type { StoredEvent } from "./store";

export type Listener = (event: StoredEvent) => void;

export class EventBus {
  private globalListeners: Set<Listener> = new Set();
  private streamListeners: Map<string, Set<Listener>> = new Map();

  /** Subscribe to all events. Returns an unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.globalListeners.add(listener);
    return () => {
      this.globalListeners.delete(listener);
    };
  }

  /** Subscribe to events for a specific stream. Returns an unsubscribe function. */
  subscribeStream(streamId: string, listener: Listener): () => void {
    if (!this.streamListeners.has(streamId)) {
      this.streamListeners.set(streamId, new Set());
    }
    this.streamListeners.get(streamId)!.add(listener);

    return () => {
      const listeners = this.streamListeners.get(streamId);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.streamListeners.delete(streamId);
        }
      }
    };
  }

  /** Publish an event to all matching listeners. */
  publish(event: StoredEvent): void {
    // Notify global listeners
    for (const listener of this.globalListeners) {
      listener(event);
    }

    // Notify stream-scoped listeners
    const streamListeners = this.streamListeners.get(event.streamId);
    if (streamListeners) {
      for (const listener of streamListeners) {
        listener(event);
      }
    }
  }
}

/** Singleton event bus instance for the application */
export const eventBus = new EventBus();

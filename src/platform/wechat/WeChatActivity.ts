/** Native pages and full-screen ads share one presentation slot. */
export class WeChatActivity {
  private owner: object | null = null;
  private listeners = new Set<(active: boolean) => void>();

  acquire(owner: object) {
    if (this.owner) return false;
    this.owner = owner;
    this.emit(true);
    return true;
  }

  release(owner: object) {
    if (this.owner !== owner) return;
    this.owner = null;
    this.emit(false);
  }

  subscribe(listener: (active: boolean) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private emit(active: boolean) {
    for (const listener of this.listeners) {
      try { listener(active); } catch { /* Presentation must release even if UI has gone away. */ }
    }
  }
}

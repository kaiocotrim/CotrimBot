// Keep one request in flight and run once more if updates arrive during it.
export function coalescedRefresh(action: () => Promise<void>): () => Promise<void> {
  let pending = false;
  let running: Promise<void> | null = null;
  return () => {
    pending = true;
    if (!running) running = Promise.resolve().then(async () => {
      try {
        do { pending = false; await action(); } while (pending);
      } finally { running = null; }
    });
    return running;
  };
}

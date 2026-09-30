/**
 * Runs `work(item, left)` for one item at a time, in the order they arrive. Items added while
 * it is busy join the end. A failure in one is reported and does not stop the rest.
 * @param {(item: any, left: number) => Promise<void>} work `left` is how many items are still waiting
 * @param {{pause?: () => Promise<void>, onError?: (err: unknown) => void, onIdle?: () => void}} opts `pause` runs between
 *        items; `onIdle` runs each time the queue empties
 */
export function createQueue(work, { pause = () => Promise.resolve(), onError = console.error, onIdle = () => {} } = {}) {
  const items = [];
  let running = false;

  async function drain() {
    if (running) return;
    running = true;
    while (items.length) {
      try { await work(items.shift(), items.length); } catch (err) { onError(err); }
      if (items.length) await pause();
    }
    running = false;
    onIdle();
  }

  return {
    add(...more) { items.push(...more); drain(); },
  };
}

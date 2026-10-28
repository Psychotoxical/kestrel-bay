/**
 * Resolves once the startup queue restore (index hydrate, server reconcile) is through. A
 * queue set before then can be replaced by the server's (`reconcileStartupPlayQueues`), so
 * a caller that brings its own queue at startup waits for this. Mobile only uses it today
 * (Android Auto's car player hands its queue over, `androidAutoSnapshot.ts`).
 */
let settle: () => void = () => {};
export const startupQueueSettled = new Promise<void>(resolve => {
  settle = resolve;
});

export function markStartupQueueSettled(): void {
  settle();
}

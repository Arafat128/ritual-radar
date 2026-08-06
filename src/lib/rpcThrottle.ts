/**
 * Shared RPC throttle + 429 backoff for Ritual public RPC.
 * Keeps radar scans under rate limits without inventing data.
 */

type Job<T> = {
  run: () => Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
};

const queue: Job<unknown>[] = [];
let active = 0;
/** Concurrent eth_* calls — public RPC 429s hard above ~6–8 */
const MAX_CONCURRENT = 3;
/** Minimum spacing between starting calls */
const MIN_GAP_MS = 70;
let lastStart = 0;
let cooldownUntil = 0;

function is429(e: unknown): boolean {
  const msg = String(
    (e as { shortMessage?: string; message?: string })?.shortMessage ||
      (e as { message?: string })?.message ||
      e ||
      "",
  );
  return (
    msg.includes("429") ||
    /too many requests/i.test(msg) ||
    /rate limit/i.test(msg)
  );
}

async function pump() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const now = Date.now();
    if (now < cooldownUntil) {
      const wait = cooldownUntil - now;
      setTimeout(() => void pump(), wait + 10);
      return;
    }
    const gap = now - lastStart;
    if (gap < MIN_GAP_MS) {
      setTimeout(() => void pump(), MIN_GAP_MS - gap + 5);
      return;
    }

    const job = queue.shift()!;
    active++;
    lastStart = Date.now();

    void (async () => {
      let attempt = 0;
      try {
        while (true) {
          try {
            const v = await job.run();
            job.resolve(v);
            break;
          } catch (e) {
            attempt++;
            if (is429(e) && attempt <= 5) {
              // Exponential backoff shared cooldown so everyone slows down
              const delay = Math.min(
                12_000,
                600 * 2 ** attempt + Math.random() * 400
              );
              cooldownUntil = Date.now() + delay;
              await new Promise((r) => setTimeout(r, delay));
              continue;
            }
            job.reject(e);
            break;
          }
        }
      } finally {
        active--;
        void pump();
      }
    })();
  }
}

/** Enqueue an RPC-backed call with concurrency + 429 retry */
export function throttledRpc<T>(run: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({
      run: run as () => Promise<unknown>,
      resolve: resolve as (v: unknown) => void,
      reject,
    });
    void pump();
  });
}

/** In-memory bytecode cache (precompile / known skip getCode) */
const codeCache = new Map<string, string | null>();

export function cacheGetCode(addr: string): string | null | undefined {
  const k = addr.toLowerCase();
  if (codeCache.has(k)) return codeCache.get(k)!;
  return undefined;
}

export function cacheSetCode(addr: string, code: string | null) {
  codeCache.set(addr.toLowerCase(), code);
}

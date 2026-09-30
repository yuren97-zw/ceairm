import crypto from "node:crypto";

const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 5 * 60 * 1000;
const ACCOUNT_LIMIT = 6;
const ADDRESS_LIMIT = 30;

export function createLoginProtection({ clock = () => Date.now() } = {}) {
  const attempts = new Map();
  const digest = value => crypto.createHash("sha256").update(String(value)).digest("hex");
  const keyForAccount = username => `account:${digest(String(username || "").trim().toLowerCase())}`;
  const keyForAddress = address => `address:${digest(address || "unknown")}`;
  const entry = (key, time) => {
    const saved = attempts.get(key);
    if (!saved || time - saved.startedAt >= WINDOW_MS && time >= saved.blockedUntil) {
      const fresh = { startedAt: time, failures: 0, blockedUntil: 0 };
      attempts.set(key, fresh);
      return fresh;
    }
    return saved;
  };
  const keys = (username, address) => [keyForAccount(username), keyForAddress(address)];
  const prune = time => {
    if (attempts.size < 10000) return;
    for (const [key, value] of attempts) {
      if (time - value.startedAt >= WINDOW_MS && time >= value.blockedUntil) attempts.delete(key);
    }
  };
  return {
    check(username, address) {
      const time = clock();
      const waitMs = Math.max(...keys(username, address).map(key => Math.max(0, entry(key, time).blockedUntil - time)));
      return { allowed: !waitMs, retryAfter: waitMs ? Math.ceil(waitMs / 1000) : 0 };
    },
    failure(username, address) {
      const time = clock();
      for (const [index, key] of keys(username, address).entries()) {
        const state = entry(key, time);
        state.failures++;
        if (state.failures >= (index === 0 ? ACCOUNT_LIMIT : ADDRESS_LIMIT)) state.blockedUntil = time + BLOCK_MS;
      }
      prune(time);
      return this.check(username, address);
    },
    success(username) {
      attempts.delete(keyForAccount(username));
    }
  };
}

export function loginAddress(req, { trustLocalProxy = false } = {}) {
  const peer = String(req.socket?.remoteAddress || "unknown");
  if (trustLocalProxy && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer)) {
    const forwarded = String(req.headers["x-real-ip"] || "").trim();
    if (/^[\da-f:.]{3,45}$/i.test(forwarded)) return forwarded;
  }
  return peer;
}

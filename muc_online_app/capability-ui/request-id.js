let fallbackSequence = 0;

function bytesToUuid(bytes) {
  const value = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function createRequestId(runtime = globalThis) {
  const webCrypto = runtime?.crypto;
  if (typeof webCrypto?.randomUUID === "function") {
    return webCrypto.randomUUID();
  }
  if (typeof webCrypto?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return bytesToUuid(bytes);
  }
  fallbackSequence = (fallbackSequence + 1) % 0x1000000;
  const timestamp = Date.now().toString(36);
  const performancePart = Math.floor(runtime?.performance?.now?.() || 0).toString(36);
  const randomPart = Math.random().toString(36).slice(2, 12);
  return `cap-${timestamp}-${performancePart}-${fallbackSequence.toString(36)}-${randomPart}`;
}

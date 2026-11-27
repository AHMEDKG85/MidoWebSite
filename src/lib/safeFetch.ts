export interface SafeJsonResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  isJson: boolean;
  rawText: string;
}

export async function readJsonSafe<T>(res: Response): Promise<SafeJsonResult<T>> {
  const rawText = await res.text();
  const trimmed = rawText.trim();
  const contentType = res.headers.get('content-type') || '';
  const looksLikeJson =
    contentType.includes('application/json') ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[');

  if (!looksLikeJson || !trimmed) {
    return { ok: res.ok, status: res.status, data: null, isJson: false, rawText };
  }

  try {
    const data = JSON.parse(trimmed) as T;
    return { ok: res.ok, status: res.status, data, isJson: true, rawText };
  } catch {
    return { ok: res.ok, status: res.status, data: null, isJson: false, rawText };
  }
}

export function generateClientOrderIdentifiers(): {
  orderCode: string;
  invoiceNumber: string;
} {
  const timePart = Date.now().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const randomBytes = new Uint8Array(5);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(randomBytes);
  } else {
    randomBytes.forEach((_, index) => {
      randomBytes[index] = Math.floor(Math.random() * 256);
    });
  }
  const randPart = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  const orderCode = `MDO-${timePart}-${randPart}`.slice(0, 36);
  const year = new Date().getFullYear();
  const invoiceNumber = `INV-${year}-${timePart.slice(-6)}${randPart.slice(0, 2)}`.slice(0, 36);
  return { orderCode, invoiceNumber };
}

export async function createPayloadFingerprint(payload: string): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // Fall back to a local stable fingerprint if Web Crypto is unavailable.
  }

  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < payload.length; index += 1) {
    const code = payload.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16)}${(second >>> 0).toString(16)}`;
}

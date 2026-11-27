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
  const randPart = Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const orderCode = `MDO-${timePart}-${randPart}`.slice(0, 36);
  const year = new Date().getFullYear();
  const invoiceNumber = `INV-${year}-${timePart.slice(-6)}${randPart.slice(0, 2)}`.slice(0, 36);
  return { orderCode, invoiceNumber };
}

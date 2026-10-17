import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Gateway pembayaran (Midtrans Snap). Kunci dari api/.env (diisi pemilik akun Midtrans):
 *   MIDTRANS_SERVER_KEY, MIDTRANS_CLIENT_KEY, MIDTRANS_IS_PRODUCTION=true|false
 * PAYMENT_FAKE=1 → gateway simulasi (development/tes, tanpa Midtrans). Bisa diganti di tes
 * lewat `setPaymentGateway`, mengikuti pola `setAiProvider`.
 */
export interface CreateTransactionInput {
  orderId: string;
  amount: number;
  itemId: string;
  itemName: string;
  customer: { name: string; email: string; phone?: string | null };
  finishUrl: string;
  expiryHours: number;
}

/** Status transaksi dari Midtrans (notifikasi atau cek status). */
export interface GatewayStatus {
  orderId: string;
  statusCode: string;
  transactionStatus: string;
  fraudStatus?: string;
  grossAmount: string;
  paymentType?: string;
  transactionId?: string;
}

export interface PaymentGateway {
  readonly fake: boolean;
  readonly clientKey: string | null;
  readonly snapUrl: string | null;
  createTransaction(input: CreateTransactionInput): Promise<{ token: string; redirectUrl: string }>;
  /** Null bila transaksi belum ada di gateway (pembeli belum memilih metode bayar). */
  getStatus(orderId: string): Promise<GatewayStatus | null>;
  /** Cek tanda tangan notifikasi (webhook). */
  verifyNotification(body: Record<string, unknown>): boolean;
}

export class PaymentGatewayError extends Error {}

/** Status pesanan WorksTracker dari status transaksi Midtrans. */
export function mapStatus(s: Pick<GatewayStatus, 'transactionStatus' | 'fraudStatus'>): 'pending' | 'paid' | 'expired' | 'failed' | null {
  switch (s.transactionStatus) {
    case 'settlement':
      return 'paid';
    case 'capture':
      return !s.fraudStatus || s.fraudStatus === 'accept' ? 'paid' : 'pending';
    case 'pending':
    case 'authorize':
      return 'pending';
    case 'expire':
      return 'expired';
    case 'deny':
    case 'cancel':
    case 'failure':
      return 'failed';
    default:
      return null; // refund, chargeback, dll. ditangani manual
  }
}

const sha512 = (s: string) => createHash('sha512').update(s).digest('hex');

export function midtransSignature(orderId: string, statusCode: string, grossAmount: string, serverKey: string) {
  return sha512(`${orderId}${statusCode}${grossAmount}${serverKey}`);
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function toGatewayStatus(body: Record<string, unknown>): GatewayStatus {
  const str = (k: string) => (body[k] == null ? undefined : String(body[k]));
  return {
    orderId: str('order_id') ?? '',
    statusCode: str('status_code') ?? '',
    transactionStatus: str('transaction_status') ?? '',
    fraudStatus: str('fraud_status'),
    grossAmount: str('gross_amount') ?? '',
    paymentType: str('payment_type'),
    transactionId: str('transaction_id'),
  };
}

class MidtransGateway implements PaymentGateway {
  readonly fake = false;
  private readonly serverKey: string;
  readonly clientKey: string;
  private readonly production: boolean;

  constructor() {
    this.serverKey = process.env.MIDTRANS_SERVER_KEY!.trim();
    this.clientKey = process.env.MIDTRANS_CLIENT_KEY!.trim();
    this.production = process.env.MIDTRANS_IS_PRODUCTION === 'true';
  }

  get snapUrl() {
    return this.production ? 'https://app.midtrans.com/snap/snap.js' : 'https://app.sandbox.midtrans.com/snap/snap.js';
  }

  private get auth() {
    return `Basic ${Buffer.from(`${this.serverKey}:`).toString('base64')}`;
  }

  async createTransaction(input: CreateTransactionInput) {
    const base = this.production ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com';
    const res = await fetch(`${base}/snap/v1/transactions`, {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: this.auth },
      body: JSON.stringify({
        transaction_details: { order_id: input.orderId, gross_amount: input.amount },
        item_details: [{ id: input.itemId, price: input.amount, quantity: 1, name: input.itemName.slice(0, 50) }],
        customer_details: {
          first_name: input.customer.name.slice(0, 50),
          email: input.customer.email,
          ...(input.customer.phone ? { phone: input.customer.phone } : {}),
        },
        callbacks: { finish: input.finishUrl },
        expiry: { unit: 'hours', duration: input.expiryHours },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { token?: string; redirect_url?: string; error_messages?: string[] };
    if (!res.ok || !body.token || !body.redirect_url) {
      throw new PaymentGatewayError(`Midtrans menolak transaksi (${res.status}): ${(body.error_messages ?? []).join('; ')}`);
    }
    return { token: body.token, redirectUrl: body.redirect_url };
  }

  async getStatus(orderId: string) {
    const base = this.production ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
    const res = await fetch(`${base}/v2/${encodeURIComponent(orderId)}/status`, {
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: 'application/json', Authorization: this.auth },
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    // Belum ada transaksi (pembeli belum memilih metode bayar).
    if (String(body.status_code ?? res.status) === '404') return null;
    if (!res.ok || !body.transaction_status) throw new PaymentGatewayError(`Cek status Midtrans gagal (${res.status})`);
    return toGatewayStatus(body);
  }

  verifyNotification(body: Record<string, unknown>) {
    const n = toGatewayStatus(body);
    const signature = String(body.signature_key ?? '');
    return !!signature && safeEqual(signature, midtransSignature(n.orderId, n.statusCode, n.grossAmount, this.serverKey));
  }
}

/**
 * Gateway simulasi: transaksi tersimpan di memori. `pay(orderId)` / `setStatus` menandai lunas.
 * Tanda tangan notifikasi memakai kunci "fake-server-key".
 */
export class FakePaymentGateway implements PaymentGateway {
  readonly fake = true;
  readonly clientKey = 'fake-client-key';
  readonly snapUrl = null;
  static readonly SERVER_KEY = 'fake-server-key';
  readonly created: CreateTransactionInput[] = [];
  private readonly statuses = new Map<string, GatewayStatus>();

  async createTransaction(input: CreateTransactionInput) {
    this.created.push(input);
    return { token: `fake-${input.orderId}`, redirectUrl: `${input.finishUrl}?simulasi=1` };
  }

  setStatus(orderId: string, transactionStatus: string, extra: Partial<GatewayStatus> = {}) {
    const order = this.created.find((c) => c.orderId === orderId);
    this.statuses.set(orderId, {
      orderId,
      statusCode: transactionStatus === 'settlement' || transactionStatus === 'capture' ? '200' : transactionStatus === 'pending' ? '201' : '407',
      transactionStatus,
      grossAmount: `${order?.amount ?? extra.grossAmount ?? 0}.00`,
      paymentType: 'qris',
      transactionId: `fake-tx-${orderId}`,
      ...extra,
    });
  }

  pay(orderId: string) {
    this.setStatus(orderId, 'settlement');
  }

  async getStatus(orderId: string) {
    return this.statuses.get(orderId) ?? null;
  }

  /** Notifikasi bertanda tangan seperti yang dikirim Midtrans (untuk tes webhook). */
  notification(orderId: string, overrides: Record<string, unknown> = {}) {
    const s = this.statuses.get(orderId)!;
    const body: Record<string, unknown> = {
      order_id: s.orderId,
      status_code: s.statusCode,
      gross_amount: s.grossAmount,
      transaction_status: s.transactionStatus,
      payment_type: s.paymentType,
      transaction_id: s.transactionId,
      ...overrides,
    };
    body.signature_key = midtransSignature(String(body.order_id), String(body.status_code), String(body.gross_amount), FakePaymentGateway.SERVER_KEY);
    return { ...body, ...('signature_key' in overrides ? { signature_key: overrides.signature_key } : {}) };
  }

  verifyNotification(body: Record<string, unknown>) {
    const n = toGatewayStatus(body);
    const signature = String(body.signature_key ?? '');
    return !!signature && safeEqual(signature, midtransSignature(n.orderId, n.statusCode, n.grossAmount, FakePaymentGateway.SERVER_KEY));
  }
}

let override: PaymentGateway | null = null;
let cached: PaymentGateway | null = null;
let fakeShared: FakePaymentGateway | null = null;

export function setPaymentGateway(gateway: PaymentGateway | null) {
  override = gateway;
}

/** Null bila pembayaran otomatis belum dikonfigurasi (penjualan lewat WhatsApp seperti biasa). */
export function getPaymentGateway(): PaymentGateway | null {
  if (override) return override;
  if (process.env.PAYMENT_FAKE === '1' && process.env.NODE_ENV !== 'production') return (fakeShared ??= new FakePaymentGateway());
  if (!process.env.MIDTRANS_SERVER_KEY?.trim() || !process.env.MIDTRANS_CLIENT_KEY?.trim()) return null;
  cached ??= new MidtransGateway();
  return cached;
}

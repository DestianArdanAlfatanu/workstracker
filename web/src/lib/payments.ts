import { useMutation, useQuery } from '@tanstack/react-query';
import type { CheckoutInput, CheckoutSession, MeCheckoutInput, PaymentConfig, PaymentOrderItem, PaymentOrderPublic } from '@wt/shared';
import { api } from './api';

declare global {
  interface Window {
    snap?: {
      pay: (
        token: string,
        callbacks: { onSuccess?: () => void; onPending?: () => void; onError?: () => void; onClose?: () => void },
      ) => void;
    };
  }
}

/** Status pembayaran otomatis (Midtrans). Tidak aktif → tombol beli kembali ke WhatsApp. */
export function usePaymentConfig() {
  return useQuery({
    queryKey: ['payments', 'config'],
    queryFn: async () => (await api<PaymentConfig>('/checkout/config')).data,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function useCheckout() {
  return useMutation({
    mutationFn: async (input: CheckoutInput) => (await api<CheckoutSession>('/checkout', { method: 'POST', body: input })).data,
  });
}

export function useMeCheckout() {
  return useMutation({
    mutationFn: async (input: MeCheckoutInput) => (await api<CheckoutSession>('/me/checkout', { method: 'POST', body: input })).data,
  });
}

export function usePaymentStatus(orderId: string, poll: boolean) {
  return useQuery({
    queryKey: ['payments', 'status', orderId],
    queryFn: async () => (await api<PaymentOrderPublic>(`/checkout/${encodeURIComponent(orderId)}`)).data,
    refetchInterval: (q) => (poll && q.state.data?.status === 'pending' ? 4000 : false),
    retry: false,
  });
}

export function useMyPayments() {
  return useQuery({ queryKey: ['payments', 'mine'], queryFn: async () => (await api<PaymentOrderItem[]>('/me/payments')).data });
}

export async function simulatePayment(orderId: string) {
  return (await api<PaymentOrderPublic>(`/payments/simulate/${encodeURIComponent(orderId)}`, { method: 'POST' })).data;
}

let snapLoading: Promise<void> | null = null;

/** Muat Snap.js Midtrans sekali (client key dari server, bukan dari build). */
function loadSnap(config: PaymentConfig) {
  if (window.snap) return Promise.resolve();
  snapLoading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = config.snapUrl!;
    script.setAttribute('data-client-key', config.clientKey ?? '');
    script.onload = () => resolve();
    script.onerror = () => {
      snapLoading = null;
      reject(new Error('Halaman pembayaran Midtrans tidak bisa dimuat. Periksa koneksi lalu coba lagi.'));
    };
    document.head.appendChild(script);
  });
  return snapLoading;
}

/**
 * Buka pembayaran: popup Snap Midtrans, lalu ke halaman status pesanan. Mode simulasi langsung
 * ke halaman status (ada tombol "Bayar (simulasi)"). Bila popup gagal dimuat, pakai halaman Midtrans.
 */
export async function openPayment(config: PaymentConfig, session: Pick<CheckoutSession, 'orderId' | 'token' | 'redirectUrl'>, go: (path: string) => void) {
  const statusPath = `/pembayaran/${session.orderId}`;
  if (config.fake || !config.snapUrl) return go(`${statusPath}?simulasi=1`);
  try {
    await loadSnap(config);
  } catch {
    window.location.assign(session.redirectUrl);
    return;
  }
  window.snap!.pay(session.token, {
    onSuccess: () => go(statusPath),
    onPending: () => go(statusPath),
    onError: () => go(statusPath),
    onClose: () => go(statusPath),
  });
}

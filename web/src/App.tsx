import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { RequireFeature } from './components/plan';
import { Button } from './components/ui/button';
import { useAuth } from './lib/auth';
import { AdminAnnouncementsPage } from './pages/AdminAnnouncementsPage';
import { AdminIntegrationsPage } from './pages/AdminIntegrationsPage';
import { AdminOrdersPage } from './pages/AdminOrdersPage';
import { AdminPage } from './pages/AdminPage';
import { ApplicationsPage } from './pages/ApplicationsPage';
import { ChangePasswordPage, ForgotPasswordPage, LoginPage, ResetPasswordPage } from './pages/AuthPages';
import { CalendarPage } from './pages/CalendarPage';
import { CareerProfilePage } from './pages/CareerProfilePage';
import { CvPage } from './pages/CvPage';
import { DashboardPage } from './pages/DashboardPage';
import { InsightPage } from './pages/InsightPage';
import { LandingPage } from './pages/LandingPage';
import { CheckoutPage, PaymentStatusPage } from './pages/PaymentPages';
import { SettingsPage } from './pages/SettingsPage';
import { SharePage } from './pages/SharePage';
import { TasksPage } from './pages/TasksPage';

function FullPageLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      <span className="sr-only">Memuat…</span>
    </div>
  );
}

/**
 * Halaman aplikasi: wajib login dan password default sudah diganti.
 * Pengunjung yang belum login di "/" melihat landing page.
 */
function AppGate() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === 'loading') return <FullPageLoader />;
  if (state.status === 'anonymous') {
    if (location.pathname === '/') return <LandingPage />;
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (state.user.mustChangePassword) return <Navigate to="/ganti-password" replace />;
  return <AppShell />;
}

function RequirePasswordChange({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  if (state.status === 'loading') return <FullPageLoader />;
  if (state.status === 'anonymous') return <Navigate to="/login" replace />;
  if (!state.user.mustChangePassword) return <Navigate to="/" replace />;
  return children;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  if (state.user?.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  if (state.status === 'loading') return <FullPageLoader />;
  if (state.status === 'authenticated') return <Navigate to="/" replace />;
  return children;
}

function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <h2 className="text-xl font-semibold">Halaman tidak ditemukan</h2>
      <Button asChild variant="outline">
        <Link to="/">Kembali ke dashboard</Link>
      </Button>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path="/lupa-password" element={<GuestOnly><ForgotPasswordPage /></GuestOnly>} />
      {/* Tanpa GuestOnly: link dari email tetap bisa dibuka walau tab lain masih login. */}
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/register" element={<Navigate to="/login" replace />} />
      {/* Pembelian & status pembayaran: bisa dibuka tanpa login. */}
      <Route path="/beli/:plan" element={<CheckoutPage />} />
      <Route path="/pembayaran/:orderId" element={<PaymentStatusPage />} />
      <Route path="/ganti-password" element={<RequirePasswordChange><ChangePasswordPage /></RequirePasswordChange>} />
      <Route path="/" element={<AppGate />}>
        <Route index element={<DashboardPage />} />
        <Route path="applications" element={<ApplicationsPage />} />
        <Route path="calendar" element={<RequireFeature feature="calendar"><CalendarPage /></RequireFeature>} />
        <Route path="tasks" element={<RequireFeature feature="tasks"><TasksPage /></RequireFeature>} />
        <Route path="insight" element={<RequireFeature feature="insight"><InsightPage /></RequireFeature>} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="bagikan" element={<RequireFeature feature="mobile_share"><SharePage /></RequireFeature>} />
        <Route path="cv" element={<RequireFeature feature="attachments"><CvPage /></RequireFeature>} />
        <Route path="profil-karier" element={<RequireFeature feature="ai"><CareerProfilePage /></RequireFeature>} />
        <Route path="admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
        <Route path="admin/announcements" element={<RequireAdmin><AdminAnnouncementsPage /></RequireAdmin>} />
        <Route path="admin/orders" element={<RequireAdmin><AdminOrdersPage /></RequireAdmin>} />
        <Route path="admin/integrations" element={<RequireAdmin><AdminIntegrationsPage /></RequireAdmin>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

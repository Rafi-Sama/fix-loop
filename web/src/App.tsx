import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppShell } from './layouts/AppShell';
import { useMe } from './lib/queries';

// Route-level code splitting: outside parties loading a link page never download the PM app.
const Login = lazy(() => import('./pages/auth/Login'));
const Signup = lazy(() => import('./pages/auth/Signup'));
const Forgot = lazy(() => import('./pages/auth/Forgot'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
// Marketing page: its own chunk, shown to guests at `/`.
const Landing = lazy(() => import('./pages/Landing'));
const Requests = lazy(() => import('./pages/requests/RequestList'));
const RequestNew = lazy(() => import('./pages/requests/RequestNew'));
const RequestView = lazy(() => import('./pages/requests/RequestView'));
const WorkOrders = lazy(() => import('./pages/work-orders/WorkOrderList'));
const WorkOrderView = lazy(() => import('./pages/work-orders/WorkOrderView'));
const Properties = lazy(() => import('./pages/portfolio/PropertyList'));
const PropertyView = lazy(() => import('./pages/portfolio/PropertyView'));
const Owners = lazy(() => import('./pages/portfolio/OwnerList'));
const Tenants = lazy(() => import('./pages/portfolio/TenantList'));
const TenantView = lazy(() => import('./pages/portfolio/TenantView'));
const Vendors = lazy(() => import('./pages/vendors/VendorList'));
const VendorView = lazy(() => import('./pages/vendors/VendorView'));
const Reports = lazy(() => import('./pages/reports/Reports'));
const Settings = lazy(() => import('./pages/settings/Settings'));
const Intake = lazy(() => import('./pages/public/Intake'));
const MyRequests = lazy(() => import('./pages/public/MyRequests'));
const LinkPage = lazy(() => import('./pages/links/LinkPage'));
const VerifyEmail = lazy(() => import('./pages/auth/VerifyEmail'));
// Fixloop staff console: its own chunk, never loaded by firm users or link pages.
const OpsApp = lazy(() => import('./pages/ops/OpsApp'));

const Fallback = () => <div className="page" aria-busy="true" />;

function Authed({ children }: { children: ReactNode }) {
  const me = useMe();
  const loc = useLocation();
  if (me.isPending) return <Fallback />;
  if (!me.data) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (!me.data.emailVerified) return <VerifyEmail />;
  return <AppShell>{children}</AppShell>;
}

function Guest({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.isPending) return <Fallback />;
  return me.data ? <Navigate to="/" replace /> : children;
}

const app = (el: ReactNode) => <Authed>{el}</Authed>;

/** `/` is the queue for a signed-in PM and the landing page for everyone else. */
function Home() {
  const me = useMe();
  if (me.isPending) return <Fallback />;
  return me.data ? app(<Dashboard />) : <Landing />;
}

export function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
      <Suspense fallback={<Fallback />}>
        <Routes>
          <Route path="/login" element={<Guest><Login /></Guest>} />
          <Route path="/signup" element={<Guest><Signup /></Guest>} />
          <Route path="/forgot" element={<Guest><Forgot /></Guest>} />
          <Route path="/r/:slug" element={<Intake />} />
          <Route path="/r/:slug/p/:propertyId" element={<Intake />} />
          <Route path="/r/:slug/mine" element={<MyRequests />} />
          <Route path="/l/:token" element={<LinkPage />} />
          <Route path="/ops/*" element={<OpsApp />} />

          <Route path="/" element={<Home />} />
          <Route path="/requests" element={app(<Requests />)} />
          <Route path="/requests/new" element={app(<RequestNew />)} />
          <Route path="/requests/:id" element={app(<RequestView />)} />
          <Route path="/work-orders" element={app(<WorkOrders />)} />
          <Route path="/work-orders/:id" element={app(<WorkOrderView />)} />
          <Route path="/properties" element={app(<Properties />)} />
          <Route path="/properties/:id" element={app(<PropertyView />)} />
          <Route path="/owners" element={app(<Owners />)} />
          <Route path="/tenants" element={app(<Tenants />)} />
          <Route path="/tenants/:id" element={app(<TenantView />)} />
          <Route path="/vendors" element={app(<Vendors />)} />
          <Route path="/vendors/:id" element={app(<VendorView />)} />
          <Route path="/reports/:tab?" element={app(<Reports />)} />
          <Route path="/settings/:tab?" element={app(<Settings />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

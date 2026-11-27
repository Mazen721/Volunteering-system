import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AR } from './constants/ar';
import { AuthProvider } from './context/AuthContext.tsx';
import { ToastProvider } from './context/ToastContext.tsx';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';

// Route-level code splitting: every page beyond the auth entry points is a
// lazy chunk, so the initial bundle carries only the shell + login/register.
// Students never download the staff/report/certificate code (and vice
// versa); the Suspense fallback below covers the brief chunk fetch.
const ActivitiesPage = lazy(() =>
  import('./pages/ActivitiesPage').then((module) => ({ default: module.ActivitiesPage }))
);
const ApprovalsPage = lazy(() =>
  import('./pages/ApprovalsPage').then((module) => ({ default: module.ApprovalsPage }))
);
const CertificatePage = lazy(() =>
  import('./pages/CertificatePage').then((module) => ({ default: module.CertificatePage }))
);
const CheckInPage = lazy(() =>
  import('./pages/CheckInPage').then((module) => ({ default: module.CheckInPage }))
);
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage }))
);
const DeansPage = lazy(() =>
  import('./pages/DeansPage').then((module) => ({ default: module.DeansPage }))
);
const ImportExportPage = lazy(() =>
  import('./pages/ImportExportPage').then((module) => ({ default: module.ImportExportPage }))
);
const MyApplicationsPage = lazy(() =>
  import('./pages/MyApplicationsPage').then((module) => ({ default: module.MyApplicationsPage }))
);
const OpportunitiesBoardPage = lazy(() =>
  import('./pages/OpportunitiesBoardPage').then((module) => ({
    default: module.OpportunitiesBoardPage,
  }))
);
const OpportunitiesManagePage = lazy(() =>
  import('./pages/OpportunitiesManagePage').then((module) => ({
    default: module.OpportunitiesManagePage,
  }))
);
const OpportunityDetailsPage = lazy(() =>
  import('./pages/OpportunityDetailsPage').then((module) => ({
    default: module.OpportunityDetailsPage,
  }))
);
const OpportunityFormPage = lazy(() =>
  import('./pages/OpportunityFormPage').then((module) => ({
    default: module.OpportunityFormPage,
  }))
);
const OpportunityLivePage = lazy(() =>
  import('./pages/OpportunityLivePage').then((module) => ({
    default: module.OpportunityLivePage,
  }))
);
const PendingApprovalPage = lazy(() =>
  import('./pages/PendingApprovalPage').then((module) => ({
    default: module.PendingApprovalPage,
  }))
);
const ReportPrintPage = lazy(() =>
  import('./pages/ReportPrintPage').then((module) => ({ default: module.ReportPrintPage }))
);
const StudentDashboardPage = lazy(() =>
  import('./pages/StudentDashboardPage').then((module) => ({
    default: module.StudentDashboardPage,
  }))
);
const StudentHomePage = lazy(() =>
  import('./pages/StudentHomePage').then((module) => ({ default: module.StudentHomePage }))
);
const StudentProfilePage = lazy(() =>
  import('./pages/StudentProfilePage').then((module) => ({
    default: module.StudentProfilePage,
  }))
);
const VolunteerProfilePage = lazy(() =>
  import('./pages/VolunteerProfilePage').then((module) => ({
    default: module.VolunteerProfilePage,
  }))
);
const VolunteersPage = lazy(() =>
  import('./pages/VolunteersPage').then((module) => ({ default: module.VolunteersPage }))
);

function RouteLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <p className="text-sm font-bold text-mnu-600">{AR.common.loading}</p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Suspense fallback={<RouteLoadingFallback />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/pending" element={<PendingApprovalPage />} />
              </Route>
              <Route element={<ProtectedRoute allowedRoles={['admin', 'dean']} />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/volunteers" element={<VolunteersPage />} />
                <Route path="/volunteers/:volunteerId" element={<VolunteerProfilePage />} />
                <Route path="/activities" element={<ActivitiesPage />} />
                <Route path="/opportunities/manage" element={<OpportunitiesManagePage />} />
                <Route path="/opportunities/new" element={<OpportunityFormPage />} />
                <Route path="/opportunities/:id/edit" element={<OpportunityFormPage />} />
                <Route path="/approvals" element={<ApprovalsPage />} />
                <Route path="/certificate/:volunteerId" element={<CertificatePage />} />
                <Route path="/reports/print" element={<ReportPrintPage />} />
                <Route path="/excel" element={<ImportExportPage />} />
                <Route path="/import-export" element={<ImportExportPage />} />
              </Route>
              <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
                <Route path="/deans" element={<DeansPage />} />
              </Route>
              <Route element={<ProtectedRoute allowedRoles={['admin', 'dean', 'student']} />}>
                <Route path="/opportunities/:id/live" element={<OpportunityLivePage />} />
              </Route>
              <Route element={<ProtectedRoute allowedRoles={['student']} />}>
                <Route path="/home" element={<StudentHomePage />} />
                <Route path="/me" element={<StudentDashboardPage />} />
                <Route path="/me/applications" element={<MyApplicationsPage />} />
                <Route path="/me/profile" element={<StudentProfilePage />} />
                <Route path="/opportunities" element={<OpportunitiesBoardPage />} />
                <Route path="/opportunities/:id" element={<OpportunityDetailsPage />} />
                <Route path="/checkin/:opportunityId" element={<CheckInPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

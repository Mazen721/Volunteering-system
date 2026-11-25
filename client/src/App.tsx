import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext.tsx';
import { ToastProvider } from './context/ToastContext.tsx';
import { ActivitiesPage } from './pages/ActivitiesPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { CertificatePage } from './pages/CertificatePage';
import { CheckInPage } from './pages/CheckInPage';
import { DashboardPage } from './pages/DashboardPage';
import { DeansPage } from './pages/DeansPage';
import { ImportExportPage } from './pages/ImportExportPage';
import { LoginPage } from './pages/LoginPage';
import { MyApplicationsPage } from './pages/MyApplicationsPage';
import { OpportunitiesBoardPage } from './pages/OpportunitiesBoardPage';
import { OpportunitiesManagePage } from './pages/OpportunitiesManagePage';
import { OpportunityDetailsPage } from './pages/OpportunityDetailsPage';
import { OpportunityFormPage } from './pages/OpportunityFormPage';
import { OpportunityLivePage } from './pages/OpportunityLivePage';
import { PendingApprovalPage } from './pages/PendingApprovalPage';
import { RegisterPage } from './pages/RegisterPage';
import { ReportPrintPage } from './pages/ReportPrintPage';
import { StudentDashboardPage } from './pages/StudentDashboardPage';
import { StudentHomePage } from './pages/StudentHomePage';
import { StudentProfilePage } from './pages/StudentProfilePage';
import { VolunteerProfilePage } from './pages/VolunteerProfilePage';
import { VolunteersPage } from './pages/VolunteersPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
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
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

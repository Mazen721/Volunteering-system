import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AR } from './constants/ar';
import { AuthProvider } from './context/AuthContext.tsx';
import { ToastProvider } from './context/ToastContext.tsx';
import { ActivitiesPage } from './pages/ActivitiesPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { CertificatePage } from './pages/CertificatePage';
import { DashboardPage } from './pages/DashboardPage';
import { DeansPage } from './pages/DeansPage';
import { ImportExportPage } from './pages/ImportExportPage';
import { LoginPage } from './pages/LoginPage';
import { PendingApprovalPage } from './pages/PendingApprovalPage';
import { RegisterPage } from './pages/RegisterPage';
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
              <Route path="/approvals" element={<ApprovalsPage />} />
              <Route path="/certificate/:volunteerId" element={<CertificatePage />} />
              <Route path="/excel" element={<ImportExportPage />} />
              <Route path="/import-export" element={<ImportExportPage />} />
            </Route>
            <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
              <Route path="/deans" element={<DeansPage />} />
            </Route>
            <Route element={<ProtectedRoute allowedRoles={['student']} />}>
              <Route
                path="/me"
                element={
                  <div className="min-h-screen flex items-center justify-center p-4">
                    <div className="glass-card rounded-3xl p-8 max-w-md w-full text-center space-y-2">
                      <h2 className="text-lg font-black text-slate-800">{AR.roles.student}</h2>
                    </div>
                  </div>
                }
              />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

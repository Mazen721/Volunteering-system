import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { CertificatePage } from './pages/CertificatePage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { ImportExportPage } from './pages/ImportExportPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { VolunteerProfilePage } from './pages/VolunteerProfilePage.jsx';
import { VolunteersPage } from './pages/VolunteersPage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/volunteers" element={<VolunteersPage />} />
              <Route path="/volunteers/:volunteerId" element={<VolunteerProfilePage />} />
              <Route path="/certificate/:volunteerId" element={<CertificatePage />} />
              <Route path="/import-export" element={<ImportExportPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

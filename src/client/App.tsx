import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { ConnectPage } from './pages/ConnectPage';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { HomePage } from './pages/HomePage';
import { PackageDetailPage } from './pages/PackageDetailPage';
import { UploadPage } from './pages/UploadPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { AdminPage } from './pages/AdminPage';
import { GuidePage } from './pages/GuidePage';
import { MergeRequestPage } from './pages/MergeRequestPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';

export const App: React.FC = () => {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-grow">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/packages/:id" element={<PackageDetailPage />} />
          <Route path="/packages/:id/merge-requests/:number" element={<MergeRequestPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/passwort-vergessen" element={<ForgotPasswordPage />} />
          <Route path="/passwort-zuruecksetzen" element={<ResetPasswordPage />} />
          <Route path="/connect" element={<ConnectPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/anleitung" element={<GuidePage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
};

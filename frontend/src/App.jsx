import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import DashboardLayout from './layouts/DashboardLayout';

import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import LeadDetail from './pages/LeadDetail';
import Calls from './pages/Calls';
import CallDetail from './pages/CallDetail';
import Callbacks from './pages/Callbacks';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import ClientCosting from './pages/ClientCosting';
import PublicLeadForm from './pages/PublicLeadForm';
import Login from './pages/Login';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-cyan-400 font-mono">Verifying credentials...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="test-call" element={<PublicLeadForm />} />
              <Route path="leads" element={<Leads />} />
              <Route path="leads/:id" element={<LeadDetail />} />
              <Route path="calls" element={<Calls />} />
              <Route path="calls/:id" element={<CallDetail />} />
              <Route path="callbacks" element={<Callbacks />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="costing" element={<ClientCosting />} />
              <Route path="settings" element={<Settings />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { PessoasLista } from './pages/PessoasLista';
import { PessoaForm } from './pages/PessoaForm';
import { PessoaDetalhes } from './pages/PessoaDetalhes';
import { AreasLista } from './pages/AreasLista';
import { RuasLista } from './pages/RuasLista';
import { VisitasPendentes } from './pages/VisitasPendentes';
import { CasasLista } from './pages/CasasLista';
import { AgenteTerritorio } from './pages/AgenteTerritorio';

// Guard for protected items
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin mb-4" />
        <p className="text-slate-500 font-medium text-sm">Verificando credenciais...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <Layout>{children}</Layout>;
};

// Guard to prevent logged-in users from seeing the login screen again
const RedirectIfAuthenticated: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin mb-4" />
        <p className="text-slate-500 font-medium text-sm">Verificando credenciais...</p>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public login authentication route */}
          <Route 
            path="/" 
            element={
              <RedirectIfAuthenticated>
                <Login />
              </RedirectIfAuthenticated>
            } 
          />

          {/* Protected dashboard metrics route */}
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } 
          />

          {/* Protected lists representation route */}
          <Route 
            path="/pessoas" 
            element={
              <ProtectedRoute>
                <PessoasLista />
              </ProtectedRoute>
            } 
          />

          {/* Protected new creations route */}
          <Route 
            path="/pessoa/novo" 
            element={
              <ProtectedRoute>
                <PessoaForm />
              </ProtectedRoute>
            } 
          />

          {/* Protected editing route */}
          <Route 
            path="/pessoa/editar/:id" 
            element={
              <ProtectedRoute>
                <PessoaForm />
              </ProtectedRoute>
            } 
          />

          {/* Protected details/visitations log route */}
          <Route 
            path="/pessoa/:id" 
            element={
              <ProtectedRoute>
                <PessoaDetalhes />
              </ProtectedRoute>
            } 
          />

          {/* Protected Area list route */}
          <Route 
            path="/areas" 
            element={
              <ProtectedRoute>
                <AreasLista />
              </ProtectedRoute>
            } 
          />

          {/* Protected Rua list route */}
          <Route 
            path="/ruas" 
            element={
              <ProtectedRoute>
                <RuasLista />
              </ProtectedRoute>
            } 
          />

          {/* Protected Pending Visitas route */}
          <Route 
            path="/visitas-pendentes" 
            element={
              <ProtectedRoute>
                <VisitasPendentes />
              </ProtectedRoute>
            } 
          />

          {/* Protected casas route */}
          <Route 
            path="/casas" 
            element={
              <ProtectedRoute>
                <CasasLista />
              </ProtectedRoute>
            } 
          />

          {/* Protected territory profile route */}
          <Route 
            path="/agente-territorio" 
            element={
              <ProtectedRoute>
                <AgenteTerritorio />
              </ProtectedRoute>
            } 
          />

          {/* Catch-all fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

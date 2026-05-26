import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, Users, LogOut, HeartPulse, Map, Route, CalendarDays, Home, Settings } from 'lucide-react';
import { motion } from 'motion/react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, signOut } = useAuth();
  const location = useLocation();

  const navItems = [
    { label: 'Painel', shortLabel: 'Painel', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Moradores', shortLabel: 'Pessoas', path: '/pessoas', icon: Users },
    { label: 'Áreas', shortLabel: 'Áreas', path: '/areas', icon: Map },
    { label: 'Ruas', shortLabel: 'Ruas', path: '/ruas', icon: Route },
    { label: 'Casas', shortLabel: 'Casas', path: '/casas', icon: Home },
    { label: 'Próximas Visitas', shortLabel: 'Visitas', path: '/visitas-pendentes', icon: CalendarDays },
    { label: 'Meu Território', shortLabel: 'Perfil', path: '/agente-territorio', icon: Settings },
  ];

  if (!user) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col">
      {/* Navbar segment */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-4 sm:gap-8 min-w-0">
              <Link to="/dashboard" className="flex items-center gap-2 group">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg group-hover:bg-emerald-100 transition-all">
                  <HeartPulse className="w-6 h-6" />
                </div>
                <span className="font-display font-bold text-base sm:text-lg tracking-tight text-slate-900 truncate">
                  Saúde em Ação <span className="hidden sm:inline text-emerald-600 font-medium text-sm ml-1 px-1.5 py-0.5 bg-emerald-50 rounded-md">ACS</span>
                </span>
              </Link>

              <nav className="hidden lg:flex items-center gap-1">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.path || (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`relative flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                        isActive
                          ? 'text-emerald-700 bg-emerald-50'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-xs text-slate-400">ACS Logado</span>
                <span className="text-sm font-medium text-slate-700 max-w-[200px] truncate" title={user.email || ''}>
                  {user.email?.split('@')[0]}
                </span>
              </div>

              <button
                onClick={() => signOut()}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-all font-medium text-sm"
                title="Sair do aplicativo"
                id="btn-logout"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sair</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Bottom navigation for mobile */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch gap-1 bg-white/95 backdrop-blur border-t border-slate-200 px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex-1 min-w-0 flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg font-medium text-[11px] transition-all ${
                isActive
                  ? 'text-emerald-700 bg-emerald-50'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="truncate">{item.shortLabel}</span>
            </Link>
          );
        })}
      </nav>

      {/* Main page canvas */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 lg:pb-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {children}
        </motion.div>
      </main>

      <footer className="hidden lg:block bg-slate-100 border-t border-slate-200 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-slate-400">
          Saúde em Ação ACS • Sistema de Gestão e Monitoramento de Visitas
        </div>
      </footer>
    </div>
  );
};

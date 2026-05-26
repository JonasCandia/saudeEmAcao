import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { HeartPulse, Chrome, Mail, Lock, LogIn, UserPlus, AlertCircle, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

export const Login: React.FC = () => {
  const { signInWithEmail, signUpWithEmail, signInGoogle } = useAuth();
  const navigate = useNavigate();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        await signUpWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }
      navigate('/dashboard');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        setError('E-mail ou senha incorretos.');
      } else if (err.code === 'auth/weak-password') {
        setError('A senha deve ter no mínimo 6 caracteres.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Este e-mail já está sendo utilizado.');
      } else if (err.code === 'auth/invalid-email') {
        setError('E-mail inválido.');
      } else {
        setError(err.message || 'Ocorreu um erro ao processar. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInGoogle();
      navigate('/dashboard');
    } catch (err: any) {
      console.error(err);
      if (err.code !== 'auth/popup-closed-by-user') {
        setError('Erro ao iniciar sessão com o Google. Verifique se as janelas popup estão permitidas.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden relative">
        
        {/* Modern colored top brand ribbon */}
        <div className="h-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
        
        <div className="p-8 sm:p-10">
          <div className="flex flex-col items-center mb-8">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl shadow-xs mb-3">
              <HeartPulse className="w-10 h-10 animate-pulse" />
            </div>
            <h1 className="font-display font-bold text-2xl tracking-tight text-slate-900 text-center">
              Saúde em Ação <span className="font-medium text-emerald-600">ACS</span>
            </h1>
            <p className="text-slate-500 text-sm mt-1 text-center font-sans">
              Sistema de Acompanhamento e Suporte para Agentes Comunitários
            </p>
          </div>

          {error && (
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="mb-6 p-4 bg-rose-50 text-rose-700 text-sm rounded-xl border border-rose-100 flex gap-2.5 items-start"
              id="auth-alert"
            >
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                E-mail Institucional
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl focus:ring-1 focus:ring-emerald-500/30 font-medium text-sm text-slate-800 transition-all outline-none"
                  placeholder="nome@saude.gov.br"
                  id="input-email"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                Senha de Acesso
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl focus:ring-1 focus:ring-emerald-500/30 font-medium text-sm text-slate-800 transition-all outline-none"
                  placeholder="Sua senha secreta"
                  id="input-password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 px-4 rounded-xl font-semibold text-sm text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-slate-300 disabled:cursor-not-allowed shadow-md shadow-emerald-600/15 flex items-center justify-center gap-2 transition-all cursor-pointer`}
              id="btn-submit-auth"
            >
              {isSignUp ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
              {loading ? 'Processando...' : isSignUp ? 'Registrar Nova Conta' : 'Entrar no Sistema'}
            </button>
          </form>

          <div className="relative my-6 text-center">
            <span className="absolute inset-0 border-t border-slate-150 top-1/2 -translate-y-1/2" />
            <span className="relative bg-white px-3 font-semibold text-slate-400 text-xs uppercase tracking-wider">
              Ou por outros meios
            </span>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-3 px-4 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 font-semibold text-sm rounded-xl border border-slate-200 shadow-xs flex items-center justify-center gap-2.5 transition-all cursor-pointer"
            id="btn-google-auth"
          >
            <Chrome className="w-4 h-4 text-emerald-600" />
            <span>Entrar com o Google</span>
          </button>

          <div className="mt-8 text-center">
            <button
              type="button"
              className="text-emerald-600 hover:text-emerald-700 font-bold text-sm select-none cursor-pointer transition-colors"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
              }}
              id="btn-toggle-auth-mode"
            >
              {isSignUp ? 'Já possui login? Faça Acesso' : 'Primeiro acesso? Registre-se aqui'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

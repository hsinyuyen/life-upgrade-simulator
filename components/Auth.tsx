
import React, { useState } from 'react';
import { auth } from '../firebase';
import { 
  signInWithEmailAndPassword, 
  signOut 
} from 'firebase/auth';
import { LogIn, LogOut, Loader2, Mail, Lock, ShieldCheck } from 'lucide-react';

export const Auth: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      console.error("Auth error:", err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('帳號或密碼錯誤');
      } else {
        setError('認證失敗，請稍後再試');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-600/20 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-purple-600/20 rounded-full blur-[100px] animate-pulse" />
      </div>

      <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-8 relative z-10 shadow-2xl animate-fade-in">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-blue-600/20 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-blue-500/30">
            <ShieldCheck size={40} className="text-blue-400" />
          </div>
          <h1 className="font-game text-3xl text-white tracking-tighter mb-2">
            WELCOME BACK
          </h1>
          <p className="text-slate-400 text-sm">
            Login to access your life upgrade
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Email Address</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-blue-400 transition-colors">
                <Mail size={18} />
              </div>
              <input 
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 ring-blue-500/50 transition-all"
                placeholder="your@email.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Password</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-blue-400 transition-colors">
                <Lock size={18} />
              </div>
              <input 
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 ring-blue-500/50 transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs py-3 px-4 rounded-xl text-center font-bold">
              {error}
            </div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-game py-4 rounded-2xl shadow-[0_0_20px_rgba(37,99,235,0.4)] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-4"
          >
            {loading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <>
                <LogIn size={20} />
                LOGIN
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export const LogoutButton: React.FC<{ className?: string }> = ({ className }) => {
  const handleLogout = () => signOut(auth);
  return (
    <button 
      onClick={handleLogout}
      className={`flex items-center gap-2 text-slate-400 hover:text-red-400 transition-colors font-bold text-sm ${className}`}
    >
      <LogOut size={18} />
      <span>LOGOUT</span>
    </button>
  );
};

import { useEffect, useState } from 'react';
import { AR } from './constants/ar.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const STATUS_BADGE = {
  checking: {
    label: AR.setup.serverChecking,
    classes: 'bg-amber-50 text-amber-700 border-amber-200',
    dotClasses: 'bg-amber-500',
  },
  connected: {
    label: AR.setup.serverConnected,
    classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClasses: 'bg-emerald-500',
  },
  disconnected: {
    label: AR.setup.serverDisconnected,
    classes: 'bg-rose-50 text-rose-700 border-rose-200',
    dotClasses: 'bg-rose-500',
  },
};

export default function App() {
  const [serverStatus, setServerStatus] = useState('checking');

  useEffect(() => {
    const controller = new AbortController();

    async function checkHealth() {
      try {
        const response = await fetch(`${API_URL}/health`, { signal: controller.signal });
        if (!response.ok) {
          setServerStatus('disconnected');
          return;
        }
        const payload = await response.json();
        setServerStatus(payload?.status === 'ok' ? 'connected' : 'disconnected');
      } catch (err) {
        if (err.name !== 'AbortError') {
          setServerStatus('disconnected');
        }
      }
    }

    checkHealth();
    return () => controller.abort();
  }, []);

  const badge = STATUS_BADGE[serverStatus];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="glass-nav text-white shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-mnu-gold font-extrabold text-lg">
              م
            </div>
            <div>
              <h1 className="font-extrabold text-lg sm:text-xl flex items-center gap-2">
                {AR.brand.university}
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-mnu-gold/20 text-yellow-300 border border-yellow-400/30">
                  {AR.brand.badge}
                </span>
              </h1>
              <p className="text-xs text-blue-200 font-light">{AR.brand.subtitle}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12 flex items-center justify-center">
        <section className="glass-card rounded-3xl p-8 w-full text-center space-y-5">
          <h2 className="text-2xl font-black text-mnu-500">{AR.setup.heading}</h2>
          <p className="text-slate-600 text-sm">{AR.setup.description}</p>

          <div className="pt-2 flex flex-col items-center gap-2">
            <span className="text-xs font-bold text-slate-500">{AR.setup.serverStatusLabel}</span>
            <div
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-bold ${badge.classes}`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${badge.dotClasses}`} />
              <span>{badge.label}</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

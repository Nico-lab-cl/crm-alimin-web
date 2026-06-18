'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Mail, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const leadId = searchParams.get('id');
  
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'success' | 'resubscribed' | 'error'>('success');
  const [email, setEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!leadId) {
      setStatus('error');
      setErrorMsg('El enlace de desuscripción no es válido o está incompleto.');
      setLoading(false);
      return;
    }

    const performUnsubscribe = async () => {
      try {
        const res = await fetch(`/api/leads/unsubscribe?id=${leadId}&action=unsubscribe`, {
          method: 'POST',
        });
        
        if (res.ok) {
          const data = await res.json();
          setEmail(data.email || '');
          setStatus('success');
        } else {
          const data = await res.json();
          setStatus('error');
          setErrorMsg(data.message || 'Ocurrió un error al procesar tu solicitud.');
        }
      } catch (err) {
        console.error('Error during unsubscribe:', err);
        setStatus('error');
        setErrorMsg('Error de red al conectar con el servidor de desuscripción.');
      } finally {
        setLoading(false);
      }
    };

    performUnsubscribe();
  }, [leadId]);

  const handleToggleSubscription = async (action: 'subscribe' | 'unsubscribe') => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/leads/unsubscribe?id=${leadId}&action=${action}`, {
        method: 'POST',
      });
      
      if (res.ok) {
        setStatus(action === 'subscribe' ? 'resubscribed' : 'success');
      } else {
        alert('Ocurrió un error al actualizar tus preferencias.');
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión con el servidor.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
        <RefreshCw className="w-12 h-12 text-[#2d544c] animate-spin" />
        <p className="text-lg font-medium text-[#516f90] animate-pulse font-sans">Procesando tu solicitud...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="p-8 text-center space-y-6">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto shadow-inner">
          <XCircle className="w-10 h-10" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-slate-800 font-sans">Ups, algo salió mal</h2>
          <p className="text-slate-500 max-w-md mx-auto text-sm leading-relaxed">{errorMsg}</p>
        </div>
        <div className="pt-4">
          <a 
            href="https://aliminspa.cl" 
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-[#2d544c] hover:bg-[#1f3a35] text-white font-bold transition-all shadow-md text-sm hover:scale-105 active:scale-95"
          >
            Ir al Sitio Web
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 text-center space-y-6">
      {status === 'success' ? (
        <>
          <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto shadow-inner animate-bounce">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-slate-800 font-sans">Suscripción Cancelada</h2>
            <p className="text-slate-500 max-w-md mx-auto text-sm leading-relaxed">
              El correo electrónico <strong className="text-slate-700">{email}</strong> ha sido dado de baja de nuestras listas de marketing.
            </p>
            <p className="text-xs text-slate-400">Ya no recibirás correos comerciales ni promocionales de nuestra parte.</p>
          </div>
          <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row gap-3 justify-center items-center">
            <button
              onClick={() => handleToggleSubscription('subscribe')}
              disabled={actionLoading}
              className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 rounded-xl border border-[#cbd6e2] hover:bg-slate-50 text-[#33475b] font-bold transition-all text-sm disabled:opacity-50 hover:scale-105 active:scale-95"
            >
              {actionLoading ? 'Procesando...' : 'Re-activar suscripción'}
            </button>
            <a 
              href="https://aliminspa.cl" 
              className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 rounded-xl bg-[#2d544c] hover:bg-[#1f3a35] text-white font-bold transition-all shadow-md text-sm hover:scale-105 active:scale-95"
            >
              Ir al Sitio Web
            </a>
          </div>
        </>
      ) : (
        <>
          <div className="w-16 h-16 bg-[#eaf0f6] text-[#2d544c] rounded-full flex items-center justify-center mx-auto shadow-inner animate-pulse">
            <Mail className="w-10 h-10" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-[#2d544c] font-sans">¡Suscripción Reactivada!</h2>
            <p className="text-slate-500 max-w-md mx-auto text-sm leading-relaxed">
              Has sido re-suscrito correctamente. Volverás a recibir información sobre nuevos proyectos, lotes disponibles y promociones exclusivas.
            </p>
          </div>
          <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row gap-3 justify-center items-center">
            <button
              onClick={() => handleToggleSubscription('unsubscribe')}
              disabled={actionLoading}
              className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 rounded-xl border border-red-200 hover:bg-red-50 text-red-600 font-bold transition-all text-sm disabled:opacity-50 hover:scale-105 active:scale-95"
            >
              {actionLoading ? 'Procesando...' : 'Cancelar suscripción de nuevo'}
            </button>
            <a 
              href="https://aliminspa.cl" 
              className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 rounded-xl bg-[#2d544c] hover:bg-[#1f3a35] text-white font-bold transition-all shadow-md text-sm hover:scale-105 active:scale-95"
            >
              Ir al Sitio Web
            </a>
          </div>
        </>
      )}
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-tr from-[#f6f9fc] via-white to-[#eaf0f6] p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-lg bg-white rounded-3xl border border-[#cbd6e2]/60 shadow-xl overflow-hidden backdrop-blur-md">
        {/* Branding header */}
        <div className="p-6 bg-[#2d544c] text-white flex flex-col items-center gap-2">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-xl font-extrabold text-[#2d544c] shadow-md select-none">
            AL
          </div>
          <h1 className="text-lg font-bold tracking-tight font-sans">ALIMIN INMOBILIARIA</h1>
          <p className="text-xs text-white/70 font-sans">Preferencias de Suscripción</p>
        </div>
        
        <Suspense fallback={
          <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
            <RefreshCw className="w-12 h-12 text-[#2d544c] animate-spin" />
            <p className="text-lg font-medium text-[#516f90] animate-pulse font-sans">Cargando...</p>
          </div>
        }>
          <UnsubscribeContent />
        </Suspense>
      </div>
      <p className="text-xs text-slate-400 mt-6 text-center font-sans">
        © {new Date().getFullYear()} Alimin Inmobiliaria. Todos los derechos reservados.
      </p>
    </div>
  );
}

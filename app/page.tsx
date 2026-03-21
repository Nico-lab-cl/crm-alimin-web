'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface Campaign {
  id: string;
  title: string;
  subject: string;
  status: string;
  created_at: string;
}

interface CampaignLog {
  id: string;
  campaign_title: string;
  email: string;
  status: string;
  sent_at: string;
  opened_at: string;
}

export default function Dashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [logs, setLogs] = useState<CampaignLog[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchLogs, 5000); // Polling para ver actualizaciones de tracking
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    const [cRes, sRes, lRes] = await Promise.all([
      fetch('/api/campaigns'),
      fetch('/api/leads/filters'),
      fetch('/api/campaigns/logs'),
    ]);
    
    if (cRes.ok) setCampaigns(await cRes.json());
    if (sRes.ok) setStatuses(await sRes.json());
    if (lRes.ok) setLogs(await lRes.json());
  };

  const fetchLogs = async () => {
    const lRes = await fetch('/api/campaigns/logs');
    if (lRes.ok) setLogs(await lRes.json());
  };

  const handleExecute = async () => {
    if (!selectedCampaign) return alert('Selecciona una campaña');
    
    setLoading(true);
    try {
      const res = await fetch('/api/campaigns/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: selectedCampaign,
          filters: { status: selectedStatus || undefined },
        }),
      });

      const data = await res.json();
      alert(data.message + (data.leads_processed ? ` (${data.leads_processed} leads)` : ''));
      fetchLogs();
    } catch {
      alert('Error ejecutando campaña');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans p-8">
      <div className="max-w-7xl mx-auto space-y-10">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-white">Email Marketing CRM</h1>
            <p className="text-zinc-400 mt-2">Gestiona tus campañas y trackea resultados en tiempo real.</p>
          </div>
          <Link 
            href="/campaigns/builder"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg transition-all"
          >
            + Nueva Campaña
          </Link>
        </div>

        {/* Execution Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8 backdrop-blur-sm space-y-6">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span>
              Ejecutar Campaña
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Seleccionar Campaña</label>
                <select 
                  className="w-full bg-zinc-800 border-zinc-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={selectedCampaign}
                  onChange={(e) => setSelectedCampaign(e.target.value)}
                >
                  <option value="">-- Elige una --</option>
                  {campaigns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Filtrar por Status (Leads)</label>
                <select 
                  className="w-full bg-zinc-800 border-zinc-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                >
                  <option value="">Todos los leads</option>
                  {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <button 
              onClick={handleExecute}
              disabled={loading || !selectedCampaign}
              className="w-full bg-white text-zinc-950 hover:bg-zinc-200 py-4 rounded-xl font-bold transition-all disabled:opacity-50"
            >
              {loading ? 'Procesando Envíos...' : 'Iniciar Envío Masivo'}
            </button>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8">
            <h2 className="text-xl font-semibold mb-6">Métricas Rápidas</h2>
            <div className="space-y-6">
              <div className="flex justify-between items-end border-b border-zinc-800 pb-4">
                <span className="text-zinc-400">Total Enviados</span>
                <span className="text-2xl font-bold">{logs.length}</span>
              </div>
              <div className="flex justify-between items-end border-b border-zinc-800 pb-4">
                <span className="text-zinc-400">Aperturas</span>
                <span className="text-2xl font-bold text-green-400">
                  {logs.filter(l => l.status === 'OPENED').length}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Campañas Guardadas Table */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden mt-8">
          <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
            <h2 className="text-xl font-semibold">Campañas Guardadas</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-zinc-800/30 text-zinc-400 text-sm">
                  <th className="px-6 py-4 font-medium">Título</th>
                  <th className="px-6 py-4 font-medium">Asunto</th>
                  <th className="px-6 py-4 font-medium">Estado</th>
                  <th className="px-6 py-4 font-medium">Fecha Creación</th>
                  <th className="px-6 py-4 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">
                      No hay campañas guardadas.
                    </td>
                  </tr>
                ) : (
                  campaigns.map((campaign) => (
                    <tr key={campaign.id} className="hover:bg-zinc-800/20 transition-colors">
                      <td className="px-6 py-4 font-medium text-white">{campaign.title}</td>
                      <td className="px-6 py-4 text-zinc-400">{campaign.subject}</td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 bg-zinc-800 text-zinc-300 rounded-full text-xs font-medium">
                          {campaign.status || 'DRAFT'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-zinc-400 text-sm">
                        {new Date(campaign.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/campaigns/builder/${campaign.id}`}
                          className="text-indigo-400 hover:text-indigo-300 font-medium text-sm transition-colors"
                        >
                          Editar Diseño
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Logs Table */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
            <h2 className="text-xl font-semibold">Logs de Envíos Recientes</h2>
            <span className="text-xs bg-zinc-800 px-3 py-1 rounded-full text-zinc-400">Últimos 100</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-zinc-800/30 text-zinc-400 text-sm">
                  <th className="px-6 py-4 font-medium">Campaña</th>
                  <th className="px-6 py-4 font-medium">Destinatario</th>
                  <th className="px-6 py-4 font-medium">Estado</th>
                  <th className="px-6 py-4 font-medium">Enviado</th>
                  <th className="px-6 py-4 font-medium">Abierto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-800/20 transition-colors">
                    <td className="px-6 py-4 font-medium text-white">{log.campaign_title}</td>
                    <td className="px-6 py-4 text-zinc-400">{log.email}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        log.status === 'OPENED' ? 'bg-green-500/10 text-green-500' :
                        log.status === 'SENT' ? 'bg-blue-500/10 text-blue-500' :
                        'bg-zinc-500/10 text-zinc-500'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-zinc-400 text-sm">
                      {log.sent_at ? new Date(log.sent_at).toLocaleString() : '-'}
                    </td>
                    <td className="px-6 py-4 text-zinc-400 text-sm">
                      {log.opened_at ? new Date(log.opened_at).toLocaleString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

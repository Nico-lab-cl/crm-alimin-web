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
  is_automation: boolean;
  automation_formid: string;
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
  const [sources, setSources] = useState<string[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedSource, setSelectedSource] = useState('');
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [previewLeads, setPreviewLeads] = useState<any[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<Campaign | null>(null);
  const [automationLoading, setAutomationLoading] = useState(false);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchLogs, 5000); // Polling para ver actualizaciones de tracking
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchPreview = async () => {
      setPreviewLoading(true);
      try {
        const res = await fetch('/api/campaigns/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            filters: { 
              status: selectedStatus || undefined, 
              source: selectedSource || undefined 
            } 
          })
        });
        if (res.ok) {
          const data = await res.json();
          setPreviewCount(data.count);
          setPreviewLeads(data.preview || []);
        }
      } catch (err) {
        console.error('Error fetching preview:', err);
      } finally {
        setPreviewLoading(false);
      }
    };
    fetchPreview();
  }, [selectedStatus, selectedSource]);

  const fetchData = async () => {
    const [cRes, filtersRes, lRes] = await Promise.all([
      fetch('/api/campaigns'),
      fetch('/api/leads/filters'),
      fetch('/api/campaigns/logs'),
    ]);
    
    if (cRes.ok) setCampaigns(await cRes.json());
    if (filtersRes.ok) {
       const data = await filtersRes.json();
       if (Array.isArray(data)) {
         setStatuses(data);
       } else {
         setStatuses(data.statuses || []);
         setSources(data.sources || []);
       }
    }
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
          filters: { 
            status: selectedStatus || undefined,
            source: selectedSource || undefined
          },
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

  const handleSendTest = async () => {
    if (!selectedCampaign || !testEmail) return alert('Selecciona campaña e ingresa un email');
    
    setTestLoading(true);
    try {
      const res = await fetch('/api/campaigns/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: selectedCampaign, email: testEmail }),
      });

      const data = await res.json();
      alert(data.message);
      fetchLogs();
    } catch {
      alert('Error enviando prueba');
    } finally {
      setTestLoading(false);
    }
  };

  const handleSaveAutomation = async () => {
    if (!editingAutomation) return;
    
    setAutomationLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${editingAutomation.id}/automation`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_automation: editingAutomation.is_automation,
          automation_formid: editingAutomation.automation_formid
        }),
      });

      if (res.ok) {
        setEditingAutomation(null);
        fetchData();
      } else {
        alert('Error al guardar la automatización');
      }
    } catch {
      alert('Error en el servidor');
    } finally {
      setAutomationLoading(false);
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
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span>
                Ejecutar Campaña
              </h2>
              
              {/* Test Send Input */}
              <div className="flex items-center gap-2 bg-zinc-800/50 p-1 rounded-lg border border-zinc-700/50">
                <input 
                  type="email" 
                  placeholder="Email de prueba..."
                  className="bg-transparent border-none text-xs px-3 py-1.5 focus:ring-0 outline-none w-48 text-zinc-300"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
                <button 
                  onClick={handleSendTest}
                  disabled={testLoading || !selectedCampaign || !testEmail}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 rounded-md transition-all disabled:opacity-50"
                >
                  {testLoading ? 'Enviando...' : 'Enviar Prueba'}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                <label className="block text-sm font-medium text-zinc-400 mb-2">Filtrar por Status</label>
                <select 
                  className="w-full bg-zinc-800 border-zinc-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                >
                  <option value="">Todos los leads</option>
                  {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Filtrar por Source</label>
                <select 
                  className="w-full bg-zinc-800 border-zinc-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={selectedSource}
                  onChange={(e) => setSelectedSource(e.target.value)}
                >
                  <option value="">Todos los orígenes</option>
                  {sources.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-xl p-5 mt-2">
               <h3 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                 Previsualización de Destinatarios
               </h3>
               {previewLoading ? (
                 <div className="text-zinc-500 text-sm animate-pulse">Calculando leads compatibles...</div>
               ) : (
                 <>
                   <div className="text-2xl font-bold text-white mb-3">
                     {previewCount !== null ? (
                       <span className="flex items-end gap-2">
                         {previewCount} <span className="text-sm font-normal text-zinc-500 mb-1">Leads coinciden con los filtros</span>
                       </span>
                     ) : 'Selecciona filtros'}
                   </div>
                   {previewCount && previewCount > 0 ? (
                     <div className="text-xs text-zinc-400 max-h-32 overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3f3f46 transparent' }}>
                       <p className="mb-2 font-medium text-zinc-500 uppercase tracking-wider">Muestra de destinatarios ({previewLeads.length}):</p>
                       <ul className="space-y-1.5">
                         {previewLeads.map(l => (
                           <li key={l.id} className="flex items-center gap-2">
                             <span className="w-1.5 h-1.5 rounded-full bg-green-500 opacity-50"></span>
                             <span className="text-zinc-300">{l.email}</span>
                             <span className="text-zinc-600 bg-zinc-800/50 px-2 py-0.5 rounded text-[10px]">{l.source || 'Sin origen'}</span>
                           </li>
                         ))}
                       </ul>
                     </div>
                   ) : null}
                 </>
               )}
            </div>

            <button 
              onClick={handleExecute}
              disabled={loading || !selectedCampaign || previewCount === 0 || previewCount === null}
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
                  <th className="px-6 py-4 font-medium text-right">Automatización</th>
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
                          Diseño
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setEditingAutomation(campaign)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                            campaign.is_automation 
                              ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                              : 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:border-zinc-500'
                          }`}
                        >
                          {campaign.is_automation ? 'ON' : 'OFF'}
                        </button>
                        {campaign.is_automation && campaign.automation_formid && (
                          <div className="text-[10px] text-zinc-500 mt-1 truncate max-w-[100px] float-right">
                            ID: {campaign.automation_formid}
                          </div>
                        )}
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

      {/* Modal de Configuración de Automatización */}
      {editingAutomation && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
              <h3 className="text-xl font-bold">Automatización Meta</h3>
              <button 
                onClick={() => setEditingAutomation(null)}
                className="text-zinc-500 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <p className="text-zinc-400 text-sm">
                Activa esta campaña para que se envíe automáticamente cuando llegue un lead desde Meta.
              </p>

              <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-xl border border-zinc-700">
                <div>
                  <div className="font-bold">Estado de Automatización</div>
                  <div className="text-xs text-zinc-500">{editingAutomation.is_automation ? 'Activado' : 'Desactivado'}</div>
                </div>
                <button
                  onClick={() => setEditingAutomation({...editingAutomation, is_automation: !editingAutomation.is_automation})}
                  className={`w-12 h-6 rounded-full transition-all relative ${editingAutomation.is_automation ? 'bg-indigo-600' : 'bg-zinc-700'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${editingAutomation.is_automation ? 'right-1' : 'left-1'}`}></div>
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400">Meta FormID</label>
                <input 
                  type="text" 
                  placeholder="Ej: 798890826611593"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={editingAutomation.automation_formid || ''}
                  onChange={(e) => setEditingAutomation({...editingAutomation, automation_formid: e.target.value})}
                />
                <div className="flex gap-2 mt-2">
                  <button 
                    onClick={() => setEditingAutomation({...editingAutomation, automation_formid: '798890826611593'})}
                    className="text-[10px] bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded text-zinc-400"
                  >
                    Lomas del Mar
                  </button>
                  <button 
                    onClick={() => setEditingAutomation({...editingAutomation, automation_formid: '1896385304349584'})}
                    className="text-[10px] bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded text-zinc-400"
                  >
                    Arena y Sol
                  </button>
                </div>
              </div>

              <div className="bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-xl">
                <p className="text-xs text-indigo-400 leading-relaxed">
                  <strong>Nota:</strong> Al activar esto, el CRM esperará 5 minutos después de recibir el lead antes de disparar el correo.
                </p>
              </div>
            </div>

            <div className="p-6 bg-zinc-800/20 flex gap-3">
              <button 
                onClick={() => setEditingAutomation(null)}
                className="flex-1 px-4 py-3 rounded-xl border border-zinc-700 font-bold hover:bg-zinc-800 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveAutomation}
                disabled={automationLoading}
                className="flex-1 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold transition-all disabled:opacity-50"
              >
                {automationLoading ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

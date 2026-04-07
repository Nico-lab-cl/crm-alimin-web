'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  Users, 
  Mail, 
  Send, 
  Eye, 
  Plus, 
  Filter, 
  RefreshCcw,
  Zap,
  MoreVertical,
  ArrowUpRight
} from 'lucide-react';

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
    const interval = setInterval(fetchLogs, 5000);
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
    try {
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
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
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

  const openRate = logs.length > 0 ? (logs.filter(l => l.status === 'OPENED').length / logs.length * 100).toFixed(1) : 0;

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-[#2d544c]">Panel de Resumen</h1>
          <p className="text-[#516f90] mt-1">Monitorea el desempeño de tus campañas y la interacción de tus leads.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={fetchData}
            className="p-2.5 bg-white border border-[#cbd6e2] rounded-lg text-[#33475b] hover:bg-[#f5f8fa] transition-all"
            title="Actualizar datos"
          >
            <RefreshCcw className="w-5 h-5" />
          </button>
          <Link 
            href="/campaigns/builder"
            className="bg-[#2d544c] hover:bg-[#1f3a35] text-white px-5 py-2.5 rounded-lg font-bold shadow-sm transition-all flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Crear Campaña
          </Link>
        </div>
      </div>

      {/* Metrics Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Enviados', value: logs.length, icon: Send, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Aperturas Totales', value: logs.filter(l => l.status === 'OPENED').length, icon: Eye, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Tasa de Apertura', value: `${openRate}%`, icon: Zap, color: 'text-[#c49a00]', bg: 'bg-yellow-50' },
          { label: 'Campañas Activas', value: campaigns.length, icon: Mail, color: 'text-[#2d544c]', bg: 'bg-[#eaf0f6]' },
        ].map((stat, i) => (
          <div key={i} className="bg-white border border-[#cbd6e2] rounded-xl p-6 shadow-sm flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-[#516f90] uppercase tracking-wider">{stat.label}</p>
              <h3 className="text-3xl font-bold text-[#33475b] mt-2">{stat.value}</h3>
              <div className="mt-4 flex items-center gap-1 text-xs font-medium text-green-600">
                <ArrowUpRight className="w-3 h-3" />
                <span>+12% vs mes pasado</span>
              </div>
            </div>
            <div className={`p-3 rounded-lg ${stat.bg}`}>
              <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Control Card */}
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-[#cbd6e2] flex items-center justify-between">
              <h2 className="text-xl font-bold text-[#2d544c] flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Lanzar Campaña Directa
              </h2>
              <div className="flex items-center gap-2">
                <input 
                  type="email" 
                  placeholder="Email de prueba..."
                  className="bg-[#f5f8fa] border-[#cbd6e2] border text-sm px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2d544c]/20 w-48"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
                <button 
                  onClick={handleSendTest}
                  disabled={testLoading || !selectedCampaign || !testEmail}
                  className="bg-[#c49a00] hover:bg-[#a68200] text-white px-4 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                >
                  {testLoading ? '...' : 'Enviar Prueba'}
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[#516f90]">1. Seleccionar Campaña</label>
                  <select 
                    className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-sm"
                    value={selectedCampaign}
                    onChange={(e) => setSelectedCampaign(e.target.value)}
                  >
                    <option value="">-- Seleccionar --</option>
                    {campaigns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[#516f90]">2. Segmentar por Estado</label>
                  <select 
                    className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-sm"
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                  >
                    <option value="">Todos los estados</option>
                    {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[#516f90]">3. Filtrar por Origen</label>
                  <select 
                    className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-sm"
                    value={selectedSource}
                    onChange={(e) => setSelectedSource(e.target.value)}
                  >
                    <option value="">Todos los orígenes</option>
                    {sources.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Preview Box */}
              <div className="bg-[#eaf0f6]/50 border border-[#cbd6e2] rounded-xl p-6">
                <h4 className="text-xs font-bold text-[#2d544c] uppercase tracking-widest mb-4">Muestra de Audiencia Seleccionada</h4>
                {previewLoading ? (
                  <div className="flex items-center gap-3 text-[#516f90] animate-pulse">
                    <div className="w-4 h-4 bg-[#cbd6e2] rounded-full" />
                    <span className="text-sm">Analizando leads compatibles...</span>
                  </div>
                ) : previewCount !== null ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-end gap-3">
                      <span className="text-4xl font-black text-[#2d544c]">{previewCount}</span>
                      <span className="text-sm text-[#516f90] mb-1.5 font-medium">leads encontrados</span>
                    </div>
                    {previewLeads.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                        {previewLeads.map(l => (
                          <div key={l.id} className="flex items-center gap-2 text-xs text-[#33475b] bg-white border border-[#cbd6e2]/50 p-2 rounded-md truncate">
                            <span className="w-2 h-2 rounded-full bg-green-500" />
                            {l.email}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-[#516f90]">Selecciona una campaña y filtros para ver la audiencia potencial.</p>
                )}
              </div>

              <button 
                onClick={handleExecute}
                disabled={loading || !selectedCampaign || previewCount === 0 || previewCount === null}
                className="w-full bg-[#2d544c] hover:bg-[#1f3a35] text-white py-4 rounded-xl font-bold shadow-lg transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
              >
                {loading ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                {loading ? 'Procesando Envíos...' : 'Iniciar Envío Masivo'}
              </button>
            </div>
          </section>

          {/* Campaigns Table */}
          <section className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-[#cbd6e2] flex justify-between items-center">
              <h2 className="text-xl font-bold text-[#2d544c]">Mis Campañas</h2>
              <button className="text-sm font-semibold text-[#0091ae] hover:underline">Ver todas</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-[#f5f8fa] text-[#516f90] text-xs font-bold uppercase tracking-wider">
                    <th className="px-6 py-4">Campaña</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4 text-center">Auto</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#cbd6e2]">
                  {campaigns.slice(0, 5).map((campaign) => (
                    <tr key={campaign.id} className="hover:bg-[#f5f8fa] transition-colors group">
                      <td className="px-6 py-4">
                        <p className="font-bold text-[#33475b]">{campaign.title}</p>
                        <p className="text-xs text-[#516f90] truncate max-w-[200px]">{campaign.subject}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                          campaign.status === 'READY' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {campaign.status || 'DRAFT'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-[#516f90]">
                        {new Date(campaign.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button 
                          onClick={() => setEditingAutomation(campaign)}
                          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                            campaign.is_automation ? 'bg-[#eaf0f6] text-[#2d544c]' : 'text-[#cbd6e2] hover:text-[#516f90]'
                          }`}
                        >
                          <Zap className={`w-5 h-5 ${campaign.is_automation ? 'fill-current' : ''}`} />
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/campaigns/builder/${campaign.id}`} className="text-[#0091ae] hover:text-[#007a93] text-sm font-bold">
                          Diseñar
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Side Panel: Recent Activity */}
        <div className="space-y-8">
          <section className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm h-full flex flex-col">
            <div className="p-6 border-b border-[#cbd6e2] flex justify-between items-center">
              <h2 className="text-xl font-bold text-[#2d544c]">Actividad Reciente</h2>
              <span className="text-[10px] bg-[#eaf0f6] text-[#2d544c] px-2 py-0.5 rounded-full font-bold">LIVE</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[800px]">
              {logs.map((log) => (
                <div key={log.id} className="p-4 rounded-xl border border-transparent hover:border-[#cbd6e2] hover:bg-[#f5f8fa] transition-all group">
                  <div className="flex items-start gap-4">
                    <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                      log.status === 'OPENED' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-[#cbd6e2]'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <p className="text-sm font-bold text-[#33475b] truncate">{log.email}</p>
                        <span className="text-[10px] text-[#516f90] whitespace-nowrap">
                          {log.status === 'OPENED' ? 'Justo ahora' : 'Hace poco'}
                        </span>
                      </div>
                      <p className="text-xs text-[#516f90] mt-1 italic line-clamp-1">{log.campaign_title}</p>
                      <div className="mt-3 flex items-center gap-2">
                         <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                           log.status === 'OPENED' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                         }`}>
                           {log.status}
                         </span>
                         {log.opened_at && <Eye className="w-3 h-3 text-green-600" />}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Mail className="w-12 h-12 text-[#cbd6e2] mb-4" />
                  <p className="text-sm text-[#516f90]">No hay actividad de envío todavía.</p>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-[#cbd6e2]">
              <button className="w-full py-2 text-sm font-bold text-[#2d544c] hover:bg-[#eaf0f6] transition-all rounded-lg">
                Ver historial completo
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Modal: Meta Automation */}
      {editingAutomation && (
        <div className="fixed inset-0 bg-[#33475b]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#cbd6e2] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-[#cbd6e2] flex justify-between items-center text-[#2d544c]">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 fill-current" />
                <h3 className="text-xl font-bold">Automatización Meta</h3>
              </div>
              <button 
                onClick={() => setEditingAutomation(null)}
                className="text-[#516f90] hover:text-[#2d544c] p-1 rounded-full hover:bg-[#f5f8fa]"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between p-4 bg-[#f5f8fa] rounded-xl border border-[#cbd6e2]">
                <div className="space-y-1">
                  <div className="font-bold text-[#33475b]">Estado</div>
                  <div className={`text-xs font-bold ${editingAutomation.is_automation ? 'text-green-600' : 'text-[#516f90]'}`}>
                    {editingAutomation.is_automation ? 'ACTIVADA' : 'DESACTIVADA'}
                  </div>
                </div>
                <button
                  onClick={() => setEditingAutomation({...editingAutomation, is_automation: !editingAutomation.is_automation})}
                  className={`w-14 h-7 rounded-full transition-all relative ${editingAutomation.is_automation ? 'bg-[#2d544c]' : 'bg-[#cbd6e2]'}`}
                >
                  <div className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all shadow-sm ${editingAutomation.is_automation ? 'right-1' : 'left-1'}`}></div>
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-[#516f90]">Meta FormID vinculados</label>
                <input 
                  type="text" 
                  placeholder="Ej: 798890826611593"
                  className="w-full bg-[#f5f8fa] border border-[#cbd6e2] rounded-lg px-4 py-3 text-[#33475b] focus:ring-2 focus:ring-[#2d544c]/20 outline-none font-medium"
                  value={editingAutomation.automation_formid || ''}
                  onChange={(e) => setEditingAutomation({...editingAutomation, automation_formid: e.target.value})}
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  {[
                    { label: 'Lomas del Mar', id: '798890826611593' },
                    { label: 'Arena y Sol', id: '1896385304349584' }
                  ].map(preset => (
                    <button 
                      key={preset.id}
                      onClick={() => setEditingAutomation({...editingAutomation, automation_formid: preset.id})}
                      className="text-[10px] bg-white border border-[#cbd6e2] hover:border-[#2d544c] px-2.5 py-1 rounded-full text-[#516f90] hover:text-[#2d544c] transition-all font-bold"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-[#eaf0f6] p-4 rounded-xl border border-[#2d544c]/10">
                <p className="text-xs text-[#2d544c] leading-relaxed font-medium">
                  <strong>💡 Pro-tip:</strong> Al activar la automatización, el CRM enviará este correo automáticamente a cada nuevo lead que ingrese por los formularios seleccionados (con 5 min de espera para mayor realismo).
                </p>
              </div>
            </div>

            <div className="p-6 bg-[#f5f8fa] flex gap-3 border-t border-[#cbd6e2]">
              <button 
                onClick={() => setEditingAutomation(null)}
                className="flex-1 px-4 py-3 rounded-xl border border-[#cbd6e2] font-bold text-[#33475b] hover:bg-white transition-all"
              >
                Cerrar
              </button>
              <button 
                onClick={handleSaveAutomation}
                disabled={automationLoading}
                className="flex-1 px-4 py-3 rounded-xl bg-[#2d544c] hover:bg-[#1f3a35] text-white font-bold transition-all disabled:opacity-50 shadow-md"
              >
                {automationLoading ? '...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

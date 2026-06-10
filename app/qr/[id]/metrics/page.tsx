'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  QrCode, 
  Calendar, 
  Download, 
  Layers, 
  Globe, 
  Monitor, 
  Compass, 
  ExternalLink,
  Loader2,
  RefreshCcw,
  User,
  Zap,
  Info,
  MapPin,
  ChevronsUpDown,
  Search,
  Terminal
} from 'lucide-react';

interface MetricData {
  qrCode: {
    id: string;
    code: string;
    title: string;
    description: string;
    destination_url: string;
    created_at: string;
    is_active: boolean;
  };
  totals: {
    totalScans: number;
    uniqueVisits: number;
    lastScannedAt: string | null;
  };
  timeline: Array<{ date: string; count: number }>;
  byDevice: Array<{ device: string; count: number }>;
  byBrowser: Array<{ browser: string; count: number }>;
  byOs: Array<{ os: string; count: number }>;
  byReferrer: Array<{ referrer: string; count: number }>;
  byCountry: Array<{ country: string; count: number }>;
  byCity: Array<{ city: string; country: string; count: number }>;
}

interface ScanLog {
  id: string;
  scanned_at: string;
  ip_address: string;
  browser: string;
  os: string;
  device: string;
  referrer: string;
  country: string;
  city: string;
  region: string;
  latitude: number | null;
  longitude: number | null;
}

interface PaginationData {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function QrMetricsPage({ params }: { params: { id: string } }) {
  const id = params.id;
  
  // States
  const [metrics, setMetrics] = useState<MetricData | null>(null);
  const [scans, setScans] = useState<ScanLog[]>([]);
  const [pagination, setPagination] = useState<PaginationData | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterDevice, setFilterDevice] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [logPage, setLogPage] = useState(1);
  const [logLimit] = useState(15);

  useEffect(() => {
    fetchMetrics();
    fetchLogs();
  }, [id, startDate, endDate]);

  useEffect(() => {
    fetchLogs();
  }, [logPage, filterDevice, filterCountry]);

  // Fetch aggregated statistics
  const fetchMetrics = async () => {
    setLoading(true);
    try {
      let url = `/api/qr/${id}/metrics`;
      const queryParams = [];
      if (startDate) queryParams.push(`startDate=${startDate}`);
      if (endDate) queryParams.push(`endDate=${endDate}`);
      if (queryParams.length > 0) {
        url += `?${queryParams.join('&')}`;
      }

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch (err) {
      console.error('Error fetching QR metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch paginated raw scans
  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      let url = `/api/qr/${id}/scans?page=${logPage}&limit=${logLimit}`;
      if (startDate) url += `&startDate=${startDate}`;
      if (endDate) url += `&endDate=${endDate}`;
      if (filterDevice) url += `&device=${filterDevice}`;
      if (filterCountry) url += `&country=${filterCountry}`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setScans(data.scans);
        setPagination(data.pagination);
      }
    } catch (err) {
      console.error('Error fetching QR logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  // Date range presets helper
  const setRangePreset = (days: number | null) => {
    if (days === null) {
      setStartDate('');
      setEndDate('');
      return;
    }
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  // Export to CSV
  const exportToCSV = async () => {
    if (!metrics) return;
    setCsvLoading(true);
    try {
      let url = `/api/qr/${id}/scans?limit=100000`;
      if (startDate) url += `&startDate=${startDate}`;
      if (endDate) url += `&endDate=${endDate}`;
      if (filterDevice) url += `&device=${filterDevice}`;
      if (filterCountry) url += `&country=${filterCountry}`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        
        // CSV Construction
        const headers = ['Fecha y Hora (Scan)', 'IP Address', 'Dispositivo', 'Sistema Operativo', 'Navegador', 'Referente / Origen', 'Pais', 'Region', 'Ciudad', 'Latitud', 'Longitud'];
        const rows = data.scans.map((s: ScanLog) => [
          new Date(s.scanned_at).toLocaleString('es-CL'),
          s.ip_address,
          s.device,
          s.os,
          s.browser,
          s.referrer || 'Directo / WhatsApp',
          s.country,
          s.region,
          s.city,
          s.latitude || '',
          s.longitude || ''
        ]);

        const csvContent = "\ufeff" + [
          headers.join(','),
          ...rows.map((r: any) => r.map((val: any) => `"${String(val).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        
        const dateStamp = new Date().toISOString().split('T')[0];
        link.setAttribute('download', `reporte_qr_${metrics.qrCode.code}_${dateStamp}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      console.error('Error generating CSV export:', err);
      alert('Error al exportar datos a CSV');
    } finally {
      setCsvLoading(false);
    }
  };

  // UI calculations
  const totalScans = metrics?.totals.totalScans || 0;
  const uniqueVisits = metrics?.totals.uniqueVisits || 0;
  
  // Calculate relative visitor rate
  const uniqueRate = totalScans > 0 ? ((uniqueVisits / totalScans) * 100).toFixed(1) : '0.0';

  if (loading && !metrics) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-[#516f90]">
        <Loader2 className="w-10 h-10 text-[#2d544c] animate-spin" />
        <p className="font-semibold text-sm">Cargando métricas de campaña...</p>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-6">
        <div className="w-16 h-16 bg-red-50 border border-red-200 text-red-600 rounded-full flex items-center justify-center mx-auto">
          <Info className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[#33475b]">No se pudo cargar el reporte</h2>
          <p className="text-sm text-[#516f90] mt-2">
            El código QR seleccionado no existe o no tiene registros en la base de datos de Alimin.
          </p>
        </div>
        <Link 
          href="/qr" 
          className="inline-flex items-center gap-2 bg-[#2d544c] text-white px-5 py-2.5 rounded-lg font-bold hover:bg-[#1f3a35] transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al Creador
        </Link>
      </div>
    );
  }

  const { qrCode } = metrics;

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
      
      {/* Page Header / Back Button */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <Link 
            href="/qr" 
            className="inline-flex items-center gap-1 text-xs font-bold text-[#2d544c] hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver al Creador
          </Link>
          <h1 className="text-3xl font-bold text-[#2d544c] flex items-center gap-2 mt-1">
            <QrCode className="w-7 h-7" />
            Reporte: {qrCode.title}
          </h1>
          <div className="flex items-center gap-4 text-xs text-[#516f90] font-medium">
            <span>Código: <strong className="font-bold text-[#2d544c]">/q/{qrCode.code}</strong></span>
            <span>Destino: <a href={qrCode.destination_url} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-0.5 hover:text-[#2d544c]">{qrCode.destination_url} <ExternalLink className="w-2.5 h-2.5" /></a></span>
          </div>
        </div>

        {/* Global actions */}
        <div className="flex gap-2 shrink-0">
          <button 
            onClick={() => { fetchMetrics(); fetchLogs(); }}
            className="p-2.5 bg-white border border-[#cbd6e2] rounded-lg text-[#33475b] hover:bg-[#f5f8fa] transition-all"
            title="Refrescar reporte"
          >
            <RefreshCcw className="w-4 h-4" />
          </button>
          <button
            onClick={exportToCSV}
            disabled={csvLoading || totalScans === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#2d544c] hover:bg-[#1f3a35] text-white rounded-lg font-bold transition-all shadow-sm disabled:opacity-50 text-xs"
          >
            {csvLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Date Filters Ribbon */}
      <div className="bg-white border border-[#cbd6e2] rounded-2xl p-5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Todos', value: null },
            { label: 'Hoy', value: 0 },
            { label: 'Últimos 7 días', value: 7 },
            { label: 'Últimos 30 días', value: 30 },
          ].map((p, idx) => (
            <button
              key={idx}
              onClick={() => setRangePreset(p.value)}
              className="px-3.5 py-1.5 bg-[#f5f8fa] hover:bg-[#eaf0f6] text-[#2d544c] border border-[#cbd6e2] rounded-lg text-xs font-bold transition-all"
            >
              {p.label}
            </button>
          ))}
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-[10px] font-bold text-[#516f90] uppercase tracking-wider shrink-0">Desde:</span>
            <input 
              type="date" 
              className="bg-[#f5f8fa] border-[#cbd6e2] border text-xs px-3 py-1.5 rounded-lg focus:outline-none focus:bg-white w-full sm:w-auto"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-[10px] font-bold text-[#516f90] uppercase tracking-wider shrink-0">Hasta:</span>
            <input 
              type="date" 
              className="bg-[#f5f8fa] border-[#cbd6e2] border text-xs px-3 py-1.5 rounded-lg focus:outline-none focus:bg-white w-full sm:w-auto"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* Total Scans */}
        <div className="bg-white border border-[#cbd6e2] rounded-xl p-6 shadow-sm flex items-start justify-between">
          <div>
            <p className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Escaneos Totales</p>
            <h3 className="text-3xl font-extrabold text-[#33475b] mt-2">{totalScans}</h3>
            <p className="text-[10px] text-[#516f90] mt-2">Veces que se cargó la URL de tracking</p>
          </div>
          <div className="p-2.5 bg-[#eaf0f6] rounded-lg text-[#2d544c]">
            <QrCode className="w-5 h-5" />
          </div>
        </div>

        {/* Unique Visits */}
        <div className="bg-white border border-[#cbd6e2] rounded-xl p-6 shadow-sm flex items-start justify-between">
          <div>
            <p className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Visitantes Únicos</p>
            <h3 className="text-3xl font-extrabold text-[#33475b] mt-2">{uniqueVisits}</h3>
            <p className="text-[10px] text-[#516f90] mt-2">Escaneos de direcciones IP distintas</p>
          </div>
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
            <User className="w-5 h-5" />
          </div>
        </div>

        {/* Unique visitor rate */}
        <div className="bg-white border border-[#cbd6e2] rounded-xl p-6 shadow-sm flex items-start justify-between">
          <div>
            <p className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Ratio de Unicidad</p>
            <h3 className="text-3xl font-extrabold text-[#33475b] mt-2">{uniqueRate}%</h3>
            <p className="text-[10px] text-[#516f90] mt-2">Proporción de visitas únicas vs totales</p>
          </div>
          <div className="p-2.5 bg-yellow-50 text-[#c49a00] rounded-lg">
            <Zap className="w-5 h-5" />
          </div>
        </div>

        {/* Last scanned at */}
        <div className="bg-white border border-[#cbd6e2] rounded-xl p-6 shadow-sm flex items-start justify-between">
          <div>
            <p className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Último Registro</p>
            <h3 className="text-sm font-extrabold text-[#33475b] mt-4 max-w-[200px] leading-tight">
              {metrics.totals.lastScannedAt 
                ? new Date(metrics.totals.lastScannedAt).toLocaleString('es-CL', { 
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' 
                  }) 
                : 'Sin escaneos aún'}
            </h3>
            <p className="text-[10px] text-[#516f90] mt-2.5">Última fecha y hora de escaneo</p>
          </div>
          <div className="p-2.5 bg-green-50 text-green-600 rounded-lg">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

      </div>

      {totalScans === 0 ? (
        <div className="bg-white border border-[#cbd6e2] rounded-2xl p-12 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 bg-[#f5f8fa] border border-[#cbd6e2] rounded-full flex items-center justify-center mx-auto text-[#cbd6e2]">
            <Info className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[#33475b]">No hay datos de escaneo para mostrar</h3>
            <p className="text-sm text-[#516f90] mt-1 max-w-sm mx-auto">
              Este código QR dinámico aún no ha sido escaneado. Comparte el enlace de rastreo o imprime el código QR para comenzar a medir las métricas.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Main Visual breakdown graphs grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            
            {/* Devices Card */}
            <div className="bg-white border border-[#cbd6e2] rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-[#2d544c] uppercase tracking-wider flex items-center gap-2 border-b border-[#cbd6e2] pb-3">
                <Monitor className="w-4 h-4 text-[#516f90]" />
                Dispositivo del Cliente
              </h3>
              <div className="space-y-4.5">
                {metrics.byDevice.map((d, idx) => {
                  const pct = ((d.count / totalScans) * 100).toFixed(0);
                  return (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-[#33475b] capitalize">{d.device}</span>
                        <span className="text-[#516f90]">{d.count} ({pct}%)</span>
                      </div>
                      <div className="w-full bg-[#f5f8fa] h-2 rounded-full overflow-hidden">
                        <div 
                          className="bg-[#2d544c] h-full rounded-full transition-all duration-1000" 
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Operating Systems Card */}
            <div className="bg-white border border-[#cbd6e2] rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-[#2d544c] uppercase tracking-wider flex items-center gap-2 border-b border-[#cbd6e2] pb-3">
                <Layers className="w-4 h-4 text-[#516f90]" />
                Sistemas Operativos
              </h3>
              <div className="space-y-4.5">
                {metrics.byOs.map((o, idx) => {
                  const pct = ((o.count / totalScans) * 100).toFixed(0);
                  return (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-[#33475b]">{o.os}</span>
                        <span className="text-[#516f90]">{o.count} ({pct}%)</span>
                      </div>
                      <div className="w-full bg-[#f5f8fa] h-2 rounded-full overflow-hidden">
                        <div 
                          className="bg-blue-600 h-full rounded-full transition-all duration-1000" 
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Browsers Card */}
            <div className="bg-white border border-[#cbd6e2] rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-[#2d544c] uppercase tracking-wider flex items-center gap-2 border-b border-[#cbd6e2] pb-3">
                <Compass className="w-4 h-4 text-[#516f90]" />
                Navegadores
              </h3>
              <div className="space-y-4.5">
                {metrics.byBrowser.map((b, idx) => {
                  const pct = ((b.count / totalScans) * 100).toFixed(0);
                  return (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-[#33475b]">{b.browser}</span>
                        <span className="text-[#516f90]">{b.count} ({pct}%)</span>
                      </div>
                      <div className="w-full bg-[#f5f8fa] h-2 rounded-full overflow-hidden">
                        <div 
                          className="bg-[#c49a00] h-full rounded-full transition-all duration-1000" 
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Geolocation Country Card */}
            <div className="bg-white border border-[#cbd6e2] rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-[#2d544c] uppercase tracking-wider flex items-center gap-2 border-b border-[#cbd6e2] pb-3">
                <Globe className="w-4 h-4 text-[#516f90]" />
                Paises
              </h3>
              <div className="space-y-3.5 max-h-[260px] overflow-y-auto pr-1">
                {metrics.byCountry.map((c, idx) => {
                  const pct = ((c.count / totalScans) * 100).toFixed(0);
                  return (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 font-semibold text-[#33475b]">
                        <span className="w-5 text-[#cbd6e2] font-mono text-[10px]">{idx + 1}.</span>
                        <span>{c.country}</span>
                      </div>
                      <span className="font-bold text-[#2d544c] bg-[#eaf0f6] px-2.5 py-0.5 rounded-full text-[10px]">
                        {c.count} ({pct}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Geolocation Cities Card */}
            <div className="bg-white border border-[#cbd6e2] rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-[#2d544c] uppercase tracking-wider flex items-center gap-2 border-b border-[#cbd6e2] pb-3">
                <MapPin className="w-4 h-4 text-[#516f90]" />
                Ciudades
              </h3>
              <div className="space-y-3.5 max-h-[260px] overflow-y-auto pr-1">
                {metrics.byCity.map((c, idx) => {
                  const pct = ((c.count / totalScans) * 100).toFixed(0);
                  return (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 font-semibold text-[#33475b]">
                        <span className="w-5 text-[#cbd6e2] font-mono text-[10px]">{idx + 1}.</span>
                        <span className="truncate max-w-[120px]" title={c.city}>{c.city}</span>
                        <span className="text-[10px] text-[#516f90] font-normal truncate max-w-[80px]" title={c.country}>({c.country})</span>
                      </div>
                      <span className="font-bold text-[#2d544c] bg-[#eaf0f6] px-2.5 py-0.5 rounded-full text-[10px]">
                        {c.count} ({pct}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Traffic referrers Card */}
            <div className="bg-white border border-[#cbd6e2] rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-[#2d544c] uppercase tracking-wider flex items-center gap-2 border-b border-[#cbd6e2] pb-3">
                <ExternalLink className="w-4 h-4 text-[#516f90]" />
                Origen / Referente
              </h3>
              <div className="space-y-3.5 max-h-[260px] overflow-y-auto pr-1">
                {metrics.byReferrer.map((r, idx) => {
                  const pct = ((r.count / totalScans) * 100).toFixed(0);
                  return (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 font-semibold text-[#33475b] max-w-[180px]">
                        <span className="w-5 text-[#cbd6e2] font-mono text-[10px]">{idx + 1}.</span>
                        <span className="truncate font-mono text-[11px]" title={r.referrer}>{r.referrer}</span>
                      </div>
                      <span className="font-bold text-[#2d544c] bg-[#eaf0f6] px-2.5 py-0.5 rounded-full text-[10px] shrink-0">
                        {r.count} ({pct}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Detailed raw logs list */}
          <div className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm overflow-hidden">
            
            {/* Table Header / Filter ribbon */}
            <div className="p-6 border-b border-[#cbd6e2] flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-[#2d544c]">Registro Detallado de Escaneos</h3>
                <p className="text-xs text-[#516f90] mt-0.5">Audita cada solicitud individual registrada por el tracking.</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Device Filter */}
                <select 
                  className="bg-[#f5f8fa] border-[#cbd6e2] border text-xs px-3 py-2 rounded-lg outline-none font-medium"
                  value={filterDevice}
                  onChange={(e) => { setFilterDevice(e.target.value); setLogPage(1); }}
                >
                  <option value="">Todos los dispositivos</option>
                  <option value="Desktop">Desktop</option>
                  <option value="Mobile">Mobile</option>
                  <option value="Tablet">Tablet</option>
                  <option value="Bot">Bot</option>
                </select>

                {/* Country Filter */}
                <select 
                  className="bg-[#f5f8fa] border-[#cbd6e2] border text-xs px-3 py-2 rounded-lg outline-none font-medium"
                  value={filterCountry}
                  onChange={(e) => { setFilterCountry(e.target.value); setLogPage(1); }}
                >
                  <option value="">Todos los países</option>
                  {metrics.byCountry.map(c => (
                    <option key={c.country} value={c.country}>{c.country}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Table Content */}
            <div className="overflow-x-auto relative">
              {logsLoading && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-xs flex items-center justify-center z-10 animate-in fade-in duration-200">
                  <Loader2 className="w-8 h-8 text-[#2d544c] animate-spin" />
                </div>
              )}

              {scans.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                  <div className="w-12 h-12 bg-[#f5f8fa] border border-[#cbd6e2] rounded-full flex items-center justify-center text-[#cbd6e2] mb-3">
                    <Info className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-[#33475b]">No hay escaneos para mostrar</p>
                  <p className="text-xs text-[#516f90] mt-1">
                    No se encontraron escaneos individuales con los filtros seleccionados.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#f5f8fa] border-b border-[#cbd6e2] text-xs font-bold text-[#516f90] uppercase tracking-wider">
                      <th className="py-3.5 px-6">Fecha y Hora</th>
                      <th className="py-3.5 px-6">Dirección IP</th>
                      <th className="py-3.5 px-6">Ubicación (Geo)</th>
                      <th className="py-3.5 px-6">Dispositivo / SO / Navegador</th>
                      <th className="py-3.5 px-6">Origen (Referente)</th>
                      <th className="py-3.5 px-6 text-right">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#cbd6e2] text-xs text-[#33475b] font-medium">
                    {scans.map((scan) => (
                      <tr key={scan.id} className="hover:bg-[#f5f8fa]/30 transition-colors">
                        
                        {/* Timestamp */}
                        <td className="py-3.5 px-6 font-semibold">
                          {new Date(scan.scanned_at).toLocaleString('es-CL', {
                            day: 'numeric', month: 'numeric', year: 'numeric',
                            hour: '2-digit', minute: '2-digit', second: '2-digit'
                          })}
                        </td>

                        {/* IP Address */}
                        <td className="py-3.5 px-6 font-mono select-all">
                          {scan.ip_address}
                        </td>

                        {/* Geo Location */}
                        <td className="py-3.5 px-6">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0" />
                            <span>
                              {scan.city && scan.city !== 'Unknown' && scan.city !== 'Desconocido' ? `${scan.city}, ` : ''}
                              {scan.country && scan.country !== 'Unknown' && scan.country !== 'Desconocido' ? scan.country : 'Desconocido'}
                            </span>
                          </div>
                        </td>

                        {/* Device / OS / Browser */}
                        <td className="py-3.5 px-6">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[#2d544c] bg-[#eaf0f6] px-1.5 py-0.5 rounded text-[10px]">
                              {scan.device}
                            </span>
                            <span className="text-[#516f90]">{scan.os} • {scan.browser}</span>
                          </div>
                        </td>

                        {/* Referrer */}
                        <td className="py-3.5 px-6 max-w-[150px] truncate font-mono text-[10px] text-[#516f90]" title={scan.referrer}>
                          {scan.referrer || 'Directo / WhatsApp'}
                        </td>

                        {/* Coordinates Details link */}
                        <td className="py-3.5 px-6 text-right">
                          {scan.latitude && scan.longitude ? (
                            <a 
                              href={`https://www.google.com/maps?q=${scan.latitude},${scan.longitude}`} 
                              target="_blank" 
                              rel="noreferrer"
                              className="text-blue-600 hover:underline inline-flex items-center gap-0.5"
                            >
                              Mapa <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ) : (
                            <span className="text-[#cbd6e2] font-semibold">Sin GPS</span>
                          )}
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination Controls Footer */}
            {pagination && pagination.totalPages > 1 && (
              <div className="p-4 bg-[#f5f8fa] border-t border-[#cbd6e2] flex items-center justify-between text-xs">
                <span className="text-[#516f90] font-semibold">
                  Mostrando del {((logPage - 1) * logLimit) + 1} al {Math.min(logPage * logLimit, pagination.total)} de {pagination.total} registros
                </span>
                
                <div className="flex gap-2">
                  <button
                    disabled={logPage === 1}
                    onClick={() => setLogPage(prev => Math.max(1, prev - 1))}
                    className="px-3 py-1.5 border border-[#cbd6e2] bg-white rounded-lg text-[#33475b] font-bold hover:bg-[#eaf0f6] transition-all disabled:opacity-45"
                  >
                    Anterior
                  </button>
                  <span className="px-3 py-1.5 bg-white border border-[#cbd6e2] rounded-lg font-bold text-[#2d544c]">
                    Pág. {logPage} de {pagination.totalPages}
                  </span>
                  <button
                    disabled={logPage === pagination.totalPages}
                    onClick={() => setLogPage(prev => Math.min(pagination.totalPages, prev + 1))}
                    className="px-3 py-1.5 border border-[#cbd6e2] bg-white rounded-lg text-[#33475b] font-bold hover:bg-[#eaf0f6] transition-all disabled:opacity-45"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}

          </div>
        </>
      )}

    </div>
  );
}

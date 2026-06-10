'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { 
  QrCode, 
  Link as LinkIcon, 
  Copy, 
  Download, 
  Trash2, 
  Edit3, 
  Eye, 
  Plus, 
  Search, 
  Check, 
  X, 
  ExternalLink,
  Settings,
  Calendar,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Loader2
} from 'lucide-react';
import QRCode from 'qrcode';

interface QRCodeData {
  id: string;
  code: string;
  title: string;
  description: string;
  destination_url: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  scan_count: number;
}

export default function QrCreatorPage() {
  const [qrs, setQrs] = useState<QRCodeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Form States
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [codeSlug, setCodeSlug] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formActive, setFormActive] = useState(true);
  
  // Customization States
  const [fgColor, setFgColor] = useState('#2d544c'); // Primary brand color
  const [bgColor, setBgColor] = useState('#ffffff');
  const [qrSize, setQrSize] = useState(500);

  // Status/Alert States
  const [submitLoading, setSubmitLoading] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Base URL for tracking links
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
    fetchQRs();
  }, []);

  // Fetch QR codes list
  const fetchQRs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/qr');
      if (res.ok) {
        const data = await res.json();
        setQrs(data);
      }
    } catch (err) {
      console.error('Error fetching QRs:', err);
    } finally {
      setLoading(false);
    }
  };

  // Live Preview Generator
  const previewText = codeSlug.trim() 
    ? `${origin}/q/${codeSlug.trim()}`
    : `${origin}/q/ejemplo`;

  useEffect(() => {
    if (previewCanvasRef.current) {
      QRCode.toCanvas(
        previewCanvasRef.current,
        previewText,
        {
          width: 220,
          margin: 1,
          color: {
            dark: fgColor,
            light: bgColor,
          },
        },
        (error) => {
          if (error) console.error('Error generating preview QR:', error);
        }
      );
    }
  }, [previewText, fgColor, bgColor]);

  // Handle Form Submission (Create or Update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    setAlert(null);

    // Validations
    if (!title.trim() || !destinationUrl.trim()) {
      setAlert({ type: 'error', message: 'El título y la URL de destino son requeridos' });
      setSubmitLoading(false);
      return;
    }

    try {
      new URL(destinationUrl);
    } catch {
      setAlert({ type: 'error', message: 'La URL de destino no es válida. Asegúrate de incluir http:// o https://' });
      setSubmitLoading(false);
      return;
    }

    try {
      const payload = {
        title,
        description,
        destination_url: destinationUrl,
        code: codeSlug.trim() || undefined,
        is_active: formActive
      };

      const url = isEditing ? `/api/qr/${editId}` : '/api/qr';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        setAlert({
          type: 'success',
          message: isEditing ? 'Código QR actualizado con éxito' : 'Código QR creado con éxito'
        });
        resetForm();
        fetchQRs();
      } else {
        setAlert({ type: 'error', message: data.error || 'Ocurrió un error al procesar el código QR' });
      }
    } catch (err) {
      setAlert({ type: 'error', message: 'Error de red en el servidor' });
    } finally {
      setSubmitLoading(false);
    }
  };

  // Toggle QR code active status directly
  const toggleActiveStatus = async (qr: QRCodeData) => {
    try {
      const res = await fetch(`/api/qr/${qr.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: qr.title,
          description: qr.description,
          destination_url: qr.destination_url,
          code: qr.code,
          is_active: !qr.is_active
        }),
      });

      if (res.ok) {
        setQrs(qrs.map(q => q.id === qr.id ? { ...q, is_active: !q.is_active } : q));
      }
    } catch (err) {
      console.error('Error toggling QR active status:', err);
    }
  };

  // Edit QR Mode Setup
  const handleEdit = (qr: QRCodeData) => {
    setIsEditing(true);
    setEditId(qr.id);
    setTitle(qr.title);
    setDescription(qr.description || '');
    setDestinationUrl(qr.destination_url);
    setCodeSlug(qr.code);
    setFormActive(qr.is_active);
    setAlert(null);
    
    // Scroll smoothly to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Delete QR Code
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar el código QR "${name}"?\nEsta acción no se puede deshacer y borrará todo el historial de escaneos.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/qr/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setAlert({ type: 'success', message: 'Código QR eliminado exitosamente' });
        fetchQRs();
        if (isEditing && editId === id) {
          resetForm();
        }
      } else {
        const data = await res.json();
        setAlert({ type: 'error', message: data.error || 'Error al eliminar el código QR' });
      }
    } catch (err) {
      setAlert({ type: 'error', message: 'Error al conectar con el servidor' });
    }
  };

  // Copy Tracking Link helper
  const copyToClipboard = (code: string, id: string) => {
    const trackingUrl = `${origin}/q/${code}`;
    navigator.clipboard.writeText(trackingUrl).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // Reset Form helper
  const resetForm = () => {
    setTitle('');
    setDescription('');
    setDestinationUrl('');
    setCodeSlug('');
    setIsEditing(false);
    setEditId(null);
    setFormActive(true);
  };

  // Trigger high resolution download for a specific code
  const downloadQR = (code: string, name: string) => {
    const trackingUrl = `${origin}/q/${code}`;
    
    // Create hidden canvas for high-res rendering
    const tempCanvas = document.createElement('canvas');
    
    QRCode.toCanvas(
      tempCanvas,
      trackingUrl,
      {
        width: qrSize,
        margin: 1,
        color: {
          dark: fgColor,
          light: bgColor,
        },
      },
      (error) => {
        if (error) {
          console.error('Error generating download QR:', error);
          window.alert('Error al descargar el código QR');
          return;
        }

        const dataUrl = tempCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataUrl;
        
        // Clean filename: Replace spaces/special chars
        const safeName = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
        link.download = `qr_alimin_${safeName}_${code}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    );
  };

  // Filter QR list
  const filteredQRs = qrs.filter(qr => 
    qr.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    qr.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    qr.destination_url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-[#2d544c] flex items-center gap-2">
            <QrCode className="w-8 h-8 text-[#2d544c]" />
            Creador de Códigos QR
          </h1>
          <p className="text-[#516f90] mt-1">
            Diseña códigos QR dinámicos y realiza un seguimiento detallado de todos los escaneos.
          </p>
        </div>
      </div>

      {/* Alert banner */}
      {alert && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300 ${
          alert.type === 'success' 
            ? 'bg-green-50 border-green-200 text-green-800' 
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <AlertCircle className={`w-5 h-5 shrink-0 mt-0.5 ${alert.type === 'success' ? 'text-green-600' : 'text-red-600'}`} />
          <div className="flex-1 font-medium text-sm">
            {alert.message}
          </div>
          <button onClick={() => setAlert(null)} className="text-[#516f90] hover:text-[#33475b] transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Grid: Form / Creator and Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Creator Form */}
        <div className="lg:col-span-2 bg-white border border-[#cbd6e2] rounded-2xl shadow-sm overflow-hidden flex flex-col justify-between">
          <div className="p-6 border-b border-[#cbd6e2]">
            <h2 className="text-lg font-bold text-[#2d544c] flex items-center gap-2">
              <Settings className="w-5 h-5" />
              {isEditing ? 'Editar Código QR Dinámico' : 'Crear Código QR Dinámico'}
            </h2>
            <p className="text-xs text-[#516f90] mt-0.5">
              Los códigos dinámicos te permiten modificar la URL de destino final cuando quieras, sin alterar la imagen del QR impreso.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6 flex-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#2d544c] uppercase tracking-wider block">Título de Campaña *</label>
                <input 
                  type="text" 
                  placeholder="Ej: Folleto Lomas del Mar - Verano" 
                  className="w-full bg-[#f5f8fa] border-[#cbd6e2] border text-sm px-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2d544c]/20"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              {/* Destination URL */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#2d544c] uppercase tracking-wider block font-semibold">URL de Destino Final *</label>
                <input 
                  type="url" 
                  placeholder="https://aliminspa.cl/lotes/lomas-del-mar" 
                  className="w-full bg-[#f5f8fa] border-[#cbd6e2] border text-sm px-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2d544c]/20"
                  value={destinationUrl}
                  onChange={(e) => setDestinationUrl(e.target.value)}
                  required
                />
              </div>

              {/* Custom Slug Code */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-[#2d544c] uppercase tracking-wider block">Slug Personalizado (Código Corto)</label>
                  <span className="text-[10px] text-[#516f90]">Opcional</span>
                </div>
                <div className="flex rounded-lg overflow-hidden border border-[#cbd6e2] shadow-sm">
                  <span className="bg-[#eaf0f6] text-[#516f90] px-3 py-2.5 text-xs font-semibold border-r border-[#cbd6e2] flex items-center">
                    /q/
                  </span>
                  <input 
                    type="text" 
                    placeholder="lomas-verano (auto si vacío)" 
                    className="flex-1 bg-[#f5f8fa] text-sm px-4 py-2.5 focus:outline-none focus:bg-white"
                    value={codeSlug}
                    onChange={(e) => setCodeSlug(e.target.value)}
                  />
                </div>
              </div>

              {/* Status active/inactive checkbox */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#2d544c] uppercase tracking-wider block">Estado Inicial</label>
                <div className="flex items-center gap-3 py-1">
                  <button
                    type="button"
                    onClick={() => setFormActive(!formActive)}
                    className="text-[#2d544c] hover:scale-105 transition-all outline-none"
                  >
                    {formActive ? (
                      <ToggleRight className="w-10 h-10 text-[#2d544c]" />
                    ) : (
                      <ToggleLeft className="w-10 h-10 text-[#516f90]" />
                    )}
                  </button>
                  <span className="text-sm font-semibold text-[#33475b]">
                    {formActive ? 'Activo (Redirecciona)' : 'Inactivo (Pausado)'}
                  </span>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-bold text-[#2d544c] uppercase tracking-wider block">Descripción / Notas internas</label>
                <textarea 
                  placeholder="Describe dónde se imprimirá este QR o qué campaña representa..." 
                  className="w-full bg-[#f5f8fa] border-[#cbd6e2] border text-sm px-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2d544c]/20 h-20 resize-none"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

            </div>

            {/* Buttons */}
            <div className="pt-4 flex justify-end gap-3 border-t border-[#cbd6e2]">
              {isEditing && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-5 py-2.5 border border-[#cbd6e2] bg-white text-[#33475b] rounded-lg font-bold hover:bg-[#f5f8fa] transition-all"
                >
                  Cancelar Edición
                </button>
              )}
              <button
                type="submit"
                disabled={submitLoading}
                className="bg-[#2d544c] hover:bg-[#1f3a35] text-white px-6 py-2.5 rounded-lg font-bold shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {submitLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    {isEditing ? <Edit3 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {isEditing ? 'Actualizar QR' : 'Crear QR'}
                  </>
                )}
              </button>
            </div>

          </form>
        </div>

        {/* Live Customize & Preview Panel */}
        <div className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm p-6 flex flex-col items-center justify-between text-center min-h-[500px]">
          <div className="w-full">
            <h2 className="text-lg font-bold text-[#2d544c] uppercase tracking-wide border-b border-[#cbd6e2] pb-3 mb-4">
              Previsualización y Diseño
            </h2>
            
            {/* Live Canvas */}
            <div className="bg-[#f5f8fa] border border-dashed border-[#cbd6e2] p-6 rounded-xl flex items-center justify-center shadow-inner relative group mb-6">
              <canvas ref={previewCanvasRef} className="rounded-lg shadow-sm" />
              <div className="absolute bottom-2 bg-white/90 backdrop-blur-sm border border-[#cbd6e2] px-3 py-1 rounded-full text-[10px] font-bold text-[#2d544c] opacity-0 group-hover:opacity-100 transition-opacity">
                {codeSlug.trim() ? `/q/${codeSlug}` : '/q/ejemplo'}
              </div>
            </div>
            
            {/* Customize colors and size */}
            <div className="space-y-4 text-left">
              <h3 className="text-xs font-bold text-[#2d544c] uppercase tracking-wider">Ajustes de Diseño (Descarga)</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-[#516f90] uppercase block">Color QR</span>
                  <div className="flex gap-2 items-center">
                    <input 
                      type="color" 
                      className="w-8 h-8 rounded-lg overflow-hidden border border-[#cbd6e2] cursor-pointer"
                      value={fgColor}
                      onChange={(e) => setFgColor(e.target.value)}
                    />
                    <span className="text-xs font-mono font-semibold">{fgColor}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-[#516f90] uppercase block">Color Fondo</span>
                  <div className="flex gap-2 items-center">
                    <input 
                      type="color" 
                      className="w-8 h-8 rounded-lg overflow-hidden border border-[#cbd6e2] cursor-pointer"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                    />
                    <span className="text-xs font-mono font-semibold">{bgColor}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-[#516f90] uppercase block">Resolución de Descarga</span>
                <select 
                  className="w-full bg-[#f5f8fa] border-[#cbd6e2] border text-xs px-3 py-2 rounded-lg outline-none font-medium"
                  value={qrSize}
                  onChange={(e) => setQrSize(parseInt(e.target.value))}
                >
                  <option value={250}>250px x 250px (Web / Digital)</option>
                  <option value={500}>500px x 500px (Impresión Pequeña)</option>
                  <option value={1000}>1000px x 1000px (Impresión Alta Resolución)</option>
                  <option value={2000}>2000px x 2000px (Carteles Grandes / Vallas)</option>
                </select>
              </div>
            </div>
          </div>
          
          <div className="w-full pt-4 border-t border-[#cbd6e2] mt-6 flex gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(previewText);
                setAlert({ type: 'success', message: 'Enlace de rastreo copiado al portapapeles' });
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border border-[#cbd6e2] bg-white text-[#33475b] rounded-lg text-xs font-bold hover:bg-[#f5f8fa] transition-all active:scale-95"
            >
              <Copy className="w-3.5 h-3.5" />
              Copiar Enlace
            </button>
            <button
              onClick={() => downloadQR(codeSlug.trim() || 'ejemplo', title || 'Vista Previa')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[#2d544c] hover:bg-[#1f3a35] text-white rounded-lg text-xs font-bold transition-all active:scale-95 shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              Descargar PNG
            </button>
          </div>
        </div>

      </div>

      {/* QR List Section */}
      <div className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm overflow-hidden">
        
        {/* Search header */}
        <div className="p-6 border-b border-[#cbd6e2] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-[#2d544c]">Historial de Códigos QR</h2>
            <p className="text-xs text-[#516f90]">Administra todos los códigos generados y consulta sus escaneos.</p>
          </div>

          <div className="relative w-full md:w-80">
            <input 
              type="text" 
              placeholder="Buscar por título, slug o URL..." 
              className="w-full bg-[#f5f8fa] border-[#cbd6e2] border text-sm pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2d544c]/20"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search className="w-4 h-4 text-[#cbd6e2] absolute left-3.5 top-3" />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-3 text-[#516f90] hover:text-[#33475b]"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* List Content */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-[#516f90]">
              <Loader2 className="w-8 h-8 text-[#2d544c] animate-spin" />
              <p className="font-semibold text-sm">Cargando códigos QR...</p>
            </div>
          ) : filteredQRs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-4 px-6">
              <div className="w-16 h-16 bg-[#eaf0f6] rounded-full flex items-center justify-center text-[#2d544c]">
                <QrCode className="w-8 h-8" />
              </div>
              <div>
                <p className="text-lg font-bold text-[#33475b]">No se encontraron códigos QR</p>
                <p className="text-sm text-[#516f90] mt-1 max-w-sm">
                  {searchQuery 
                    ? 'No hay códigos QR que coincidan con los criterios de búsqueda.'
                    : 'Aún no has creado ningún código QR. Completa el formulario de arriba para generar el primero.'}
                </p>
              </div>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#f5f8fa] border-b border-[#cbd6e2] text-xs font-bold text-[#516f90] uppercase tracking-wider">
                  <th className="py-4 px-6">Código QR y Título</th>
                  <th className="py-4 px-6">Enlace de Rastre y Destino</th>
                  <th className="py-4 px-6 text-center">Escaneos</th>
                  <th className="py-4 px-6">Estado</th>
                  <th className="py-4 px-6">Fecha de Creación</th>
                  <th className="py-4 px-6 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#cbd6e2] text-sm text-[#33475b]">
                {filteredQRs.map((qr) => {
                  const trackingUrl = `${origin}/q/${qr.code}`;
                  return (
                    <tr key={qr.id} className="hover:bg-[#f5f8fa]/50 transition-colors">
                      
                      {/* Qr icon and Title */}
                      <td className="py-4 px-6">
                        <div className="flex items-start gap-3">
                          <button 
                            onClick={() => downloadQR(qr.code, qr.title)}
                            className="w-10 h-10 border border-[#cbd6e2] bg-white rounded-lg flex items-center justify-center shrink-0 hover:bg-[#eaf0f6] group transition-all"
                            title="Descargar código QR"
                          >
                            <QrCode className="w-5 h-5 text-[#2d544c] group-hover:scale-110 transition-transform" />
                          </button>
                          <div>
                            <span className="font-bold text-[#2d544c] block hover:underline cursor-pointer" onClick={() => handleEdit(qr)}>
                              {qr.title}
                            </span>
                            {qr.description && (
                              <span className="text-xs text-[#516f90] line-clamp-1 mt-0.5 max-w-xs block">
                                {qr.description}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Redirect links */}
                      <td className="py-4 px-6">
                        <div className="space-y-1.5 max-w-xs md:max-w-md">
                          
                          {/* Tracking URL */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 font-mono select-all truncate max-w-[200px]">
                              {trackingUrl}
                            </span>
                            <button
                              onClick={() => copyToClipboard(qr.code, qr.id)}
                              className="text-[#516f90] hover:text-[#2d544c] transition-all p-1 hover:bg-[#eaf0f6] rounded"
                              title="Copiar enlace de rastreo"
                            >
                              {copiedId === qr.id ? (
                                <Check className="w-3.5 h-3.5 text-green-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>

                          {/* Destination URL */}
                          <div className="flex items-center gap-1 text-xs text-[#516f90] hover:text-[#2d544c] truncate">
                            <LinkIcon className="w-3 h-3 shrink-0" />
                            <a 
                              href={qr.destination_url} 
                              target="_blank" 
                              rel="noreferrer"
                              className="hover:underline truncate"
                              title={qr.destination_url}
                            >
                              {qr.destination_url}
                            </a>
                            <ExternalLink className="w-2.5 h-2.5 opacity-40 shrink-0" />
                          </div>

                        </div>
                      </td>

                      {/* Scans Count */}
                      <td className="py-4 px-6 text-center">
                        <div className="inline-flex items-center justify-center font-bold px-3 py-1 bg-[#eaf0f6] text-[#2d544c] rounded-full text-xs">
                          {qr.scan_count || 0}
                        </div>
                      </td>

                      {/* Status toggle button */}
                      <td className="py-4 px-6">
                        <button
                          onClick={() => toggleActiveStatus(qr)}
                          className="focus:outline-none transition-transform active:scale-95"
                          title={qr.is_active ? 'Haga clic para desactivar' : 'Haga clic para activar'}
                        >
                          {qr.is_active ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-50 border border-green-200 px-2.5 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                              Activo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 px-2.5 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 bg-red-400 rounded-full" />
                              Inactivo
                            </span>
                          )}
                        </button>
                      </td>

                      {/* Date */}
                      <td className="py-4 px-6 text-xs font-semibold text-[#516f90]">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-[#cbd6e2]" />
                          <span>{new Date(qr.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/qr/${qr.id}/metrics`}
                            className="p-2 border border-[#cbd6e2] bg-white text-[#2d544c] hover:bg-[#eaf0f6] rounded-lg transition-all"
                            title="Ver métricas y analíticas"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => handleEdit(qr)}
                            className="p-2 border border-[#cbd6e2] bg-white text-[#33475b] hover:bg-[#f5f8fa] rounded-lg transition-all"
                            title="Editar destino"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => downloadQR(qr.code, qr.title)}
                            className="p-2 border border-[#cbd6e2] bg-white text-[#516f90] hover:bg-[#f5f8fa] rounded-lg transition-all"
                            title="Descargar imagen"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(qr.id, qr.title)}
                            className="p-2 border border-red-100 bg-white text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Eliminar QR"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

      </div>

    </div>
  );
}

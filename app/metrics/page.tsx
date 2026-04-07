'use client';

import { BarChart3, TrendingUp, Calendar, Download } from 'lucide-react';

export default function MetricsPage() {
  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-[#2d544c]">Análisis y Métricas</h1>
          <p className="text-[#516f90] mt-1">Visualiza el rendimiento histórico de tus campañas.</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 border border-[#cbd6e2] bg-white text-[#33475b] rounded-lg font-bold hover:bg-[#f5f8fa] transition-all">
            <Calendar className="w-4 h-4" />
            Últimos 30 días
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-[#2d544c] text-white rounded-lg font-bold hover:bg-[#1f3a35] transition-all shadow-sm">
            <Download className="w-4 h-4" />
            Reporte PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm p-8 h-96 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-[#eaf0f6] rounded-full flex items-center justify-center mb-6">
            <TrendingUp className="w-8 h-8 text-[#2d544c]" />
          </div>
          <p className="text-xl font-bold text-[#33475b]">Gráficos de Crecimiento</p>
          <p className="text-[#516f90] mt-2 max-w-xs">Aquí aparecerán las tendencias de captura de leads y apertura de correos.</p>
        </div>

        <div className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm p-8 h-96 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-[#eaf0f6] rounded-full flex items-center justify-center mb-6">
            <BarChart3 className="w-8 h-8 text-[#2d544c]" />
          </div>
          <p className="text-xl font-bold text-[#33475b]">Desempeño por Fuente</p>
          <p className="text-[#516f90] mt-2 max-w-xs">Comparativa de efectividad entre Lomas del Mar, Arena y Sol y otras fuentes.</p>
        </div>
      </div>
    </div>
  );
}

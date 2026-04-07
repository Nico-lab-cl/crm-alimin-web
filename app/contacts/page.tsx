'use client';

import { Users, UserPlus, Filter, Search, Download } from 'lucide-react';

export default function ContactsPage() {
  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-[#2d544c]">Contactos</h1>
          <p className="text-[#516f90] mt-1">Gestiona todos tus leads y clientes desde una sola vista.</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 border border-[#cbd6e2] bg-white text-[#33475b] rounded-lg font-bold hover:bg-[#f5f8fa] transition-all">
            <Download className="w-4 h-4" />
            Exportar
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-[#2d544c] text-white rounded-lg font-bold hover:bg-[#1f3a35] transition-all shadow-sm">
            <UserPlus className="w-4 h-4" />
            Añadir Contacto
          </button>
        </div>
      </div>

      <div className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[#cbd6e2] bg-[#f5f8fa] flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#516f90]" />
              <input 
                type="text" 
                placeholder="Filtrar contactos..." 
                className="bg-white border-[#cbd6e2] border rounded-lg py-1.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d544c]/20 w-64"
              />
            </div>
            <button className="flex items-center gap-2 text-sm font-semibold text-[#516f90] hover:text-[#2d544c]">
              <Filter className="w-4 h-4" />
              Más filtros
            </button>
          </div>
          <div className="text-sm font-medium text-[#516f90]">
            Mostrando <span className="text-[#2d544c]">0</span> contactos
          </div>
        </div>

        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 bg-[#eaf0f6] rounded-full flex items-center justify-center mb-6">
            <Users className="w-10 h-10 text-[#2d544c]" />
          </div>
          <p className="text-xl font-bold text-[#33475b]">Aún no hay contactos</p>
          <p className="text-[#516f90] mt-2 max-w-xs">Empieza a capturar leads desde tus formularios de Meta o añádelos manualmente.</p>
        </div>
      </div>
    </div>
  );
}

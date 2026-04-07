'use client';

import { Search, Bell, HelpCircle, Plus } from 'lucide-react';

export default function Header() {
  return (
    <header className="h-16 border-b border-[#cbd6e2] bg-white flex items-center justify-between px-8 sticky top-0 z-30">
      {/* Search Bar */}
      <div className="flex-1 max-w-xl">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#516f90] group-focus-within:text-[#2d544c] transition-colors" />
          <input 
            type="text" 
            placeholder="Buscar contactos, campañas..." 
            className="w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-full py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d544c]/20 focus:border-[#2d544c] transition-all"
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-4">
        <button className="flex items-center gap-2 bg-[#c49a00] hover:bg-[#a68200] text-white px-4 py-2 rounded-md text-sm font-semibold transition-all shadow-sm active:scale-95">
          <Plus className="w-4 h-4" />
          <span>Acción Rápida</span>
        </button>

        <div className="h-6 w-px bg-[#cbd6e2] mx-2" />

        <button className="p-2 text-[#516f90] hover:bg-[#f5f8fa] rounded-full transition-all relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-[#ff4747] rounded-full border-2 border-white" />
        </button>

        <button className="p-2 text-[#516f90] hover:bg-[#f5f8fa] rounded-full transition-all">
          <HelpCircle className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}

'use client';

import { usePathname } from 'next/navigation';
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Routes that should be public and render without Sidebar or Header
  const isPublicRoute = pathname?.startsWith('/unsubscribe') || pathname?.startsWith('/login') || pathname?.startsWith('/q/');

  if (isPublicRoute) {
    return <main className="min-h-screen w-full bg-[#f6f9fc]">{children}</main>;
  }

  return (
    <div className="flex min-h-screen">
      {/* Menu Lateral Sections */}
      <Sidebar />
      
      <div className="flex-1 flex flex-col min-w-0">
        {/* Cabecera Principal */}
        <Header />
        
        {/* Area de Contenido */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

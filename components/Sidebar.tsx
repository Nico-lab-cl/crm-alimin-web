'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  BarChart3, 
  Users, 
  Mail, 
  Settings, 
  Home,
  ChevronRight
} from 'lucide-react';
import Image from 'next/image';

const navItems = [
  { name: 'Dashboard', href: '/', icon: Home },
  { name: 'Contactos', href: '/contacts', icon: Users },
  { name: 'Email Marketing', href: '/campaigns', icon: Mail },
  { name: 'Métricas', href: '/metrics', icon: BarChart3 },
  { name: 'Configuración', href: '/settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-screen w-64 bg-white border-r border-[#cbd6e2] sticky top-0">
      {/* Logo */}
      <div className="p-6 border-b border-[#cbd6e2] flex items-center gap-3">
        <div className="relative w-10 h-10 overflow-hidden rounded-lg">
          <Image 
            src="/img/logo.png" 
            alt="Alimin Logo" 
            fill 
            className="object-cover"
          />
        </div>
        <span className="text-xl font-bold text-[#2d544c] tracking-tight">ALIMIN</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg transition-all group ${
                isActive 
                ? 'bg-[#eaf0f6] text-[#2d544c] font-semibold' 
                : 'text-[#33475b] hover:bg-[#f5f8fa] hover:text-[#2d544c]'
              }`}
            >
              <div className="flex items-center gap-3">
                <item.icon className={`w-5 h-5 ${isActive ? 'text-[#2d544c]' : 'text-[#516f90] group-hover:text-[#2d544c]'}`} />
                <span>{item.name}</span>
              </div>
              {isActive && <div className="w-1.5 h-6 bg-[#2d544c] rounded-full absolute left-0" />}
              {!isActive && <ChevronRight className="w-4 h-4 text-[#cbd6e2] opacity-0 group-hover:opacity-100 transition-opacity" />}
            </Link>
          );
        })}
      </nav>

      {/* Footer / User Profile Placeholder */}
      <div className="p-4 border-t border-[#cbd6e2]">
        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#f5f8fa] cursor-pointer transition-all">
          <div className="w-10 h-10 rounded-full bg-[#2d544c] flex items-center justify-center text-white font-bold text-sm">
            AD
          </div>
          <div className="flex-1 truncate">
            <p className="text-sm font-semibold text-[#33475b]">Admin</p>
            <p className="text-xs text-[#516f90] truncate">admin@alimin.com</p>
          </div>
        </div>
      </div>
    </div>
  );
}

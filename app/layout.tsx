import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Alimin CRM - Marketing & Leads",
  description: "Sistema de gestión de clientes y marketing automatizado para Alimin Lomas del Mar",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.className} antialiased bg-[#f6f9fc] text-[#33475b]`}>
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
      </body>
    </html>
  );
}

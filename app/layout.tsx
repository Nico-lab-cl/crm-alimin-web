import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import LayoutWrapper from "@/components/LayoutWrapper";

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
        <LayoutWrapper>{children}</LayoutWrapper>
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SIGETRAP | Sistema de Gestión de Prácticas Empresariales',
  description: 'Sistema Web para la Gestión, Trazabilidad y Seguimiento de Prácticas Empresariales del Programa de Ingeniería de Sistemas',
  icons: {
    icon: '/ufps-logo.png',
    shortcut: '/ufps-logo.png',
    apple: '/ufps-logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="antialiased bg-slate-950 text-slate-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}

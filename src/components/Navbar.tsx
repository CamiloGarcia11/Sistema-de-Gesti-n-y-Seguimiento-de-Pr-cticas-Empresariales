'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Shield, User, LogOut, GraduationCap } from 'lucide-react';
import { UserResponseDTO } from '@/types';

interface NavbarProps {
  currentUser?: UserResponseDTO | null;
  onLogout?: () => void;
}

export default function Navbar({ currentUser, onLogout }: NavbarProps) {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST' });
      if (onLogout) {
        onLogout();
      } else {
        router.push('/login');
        router.refresh();
      }
    } catch (e) {
      console.error(e);
      router.push('/login');
    }
  };

  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'DIRECTOR_PROGRAMA':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'DOCENTE_PRACTICA':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'TUTOR_EMPRESARIAL':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'ESTUDIANTE':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
      {/* Top red institutional bar */}
      <div className="h-1.5 bg-gradient-to-r from-red-700 via-red-600 to-red-800 w-full" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo & Brand */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-lg bg-red-700 text-white flex items-center justify-center font-bold text-xl shadow-md group-hover:bg-red-800 transition-colors">
              S
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-gray-900 text-lg tracking-tight">SIGETRAP</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded">
                  UFPS
                </span>
              </div>
              <p className="text-[11px] text-gray-500 font-medium">
                Prácticas Empresariales • Ingeniería de Sistemas
              </p>
            </div>
          </Link>

          {/* Navigation Links & User Profile */}
          <div className="flex items-center gap-4">
            {currentUser ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-sm font-semibold text-gray-900">{currentUser.name}</span>
                  <div className="flex items-center justify-end gap-1.5 mt-0.5">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getRoleBadgeColor(
                        currentUser.role
                      )}`}
                    >
                      {currentUser.role.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                <div className="w-9 h-9 rounded-full bg-red-50 border border-red-200 text-red-700 flex items-center justify-center font-bold text-sm">
                  {currentUser.name.charAt(0)}
                </div>

                <button
                  onClick={handleLogout}
                  title="Cerrar sesión"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:text-red-700 hover:bg-red-50 rounded-lg border border-gray-200 hover:border-red-200 transition-all"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden md:inline">Salir</span>
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-lg shadow-sm transition-all"
              >
                <User className="w-4 h-4" />
                Iniciar Sesión
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

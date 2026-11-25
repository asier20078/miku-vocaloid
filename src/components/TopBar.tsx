import React from 'react';
import { Download } from 'lucide-react';

export type StudioView = 'editor' | 'cpp' | 'setup';

interface TopBarProps {
  activeView: StudioView;
  isExportingWav?: boolean;
  onChangeView: (view: StudioView) => void;
  onExportSongWav: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeView,
  isExportingWav = false,
  onChangeView,
  onExportSongWav,
}) => {
  const navItems: { id: StudioView; label: string }[] = [
    { id: 'editor', label: 'Editor Vocal' },
    { id: 'cpp', label: 'Motor C++' },
    { id: 'setup', label: 'Compilación' },
  ];

  return (
    <header className="border-b border-slate-800/80 bg-[#0B0E14]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3 sm:px-6 md:gap-8">
        {/* Zone 1: Single-line Brand wordmark */}
        <button
          type="button"
          onClick={() => onChangeView('editor')}
          className="font-display text-lg font-bold tracking-tight text-slate-50 whitespace-nowrap shrink-0 hover:text-orange-400 transition-colors focus-visible:outline-2 focus-visible:outline-orange-500 focus-visible:outline-offset-4"
        >
          VoxDSP
        </button>

        {/* Zone 2 (desktop): Clean single-line navigation links */}
        <nav aria-label="Navegación principal" className="hidden md:flex items-center gap-6">
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeView(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`py-1 text-sm font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors focus-visible:outline-2 focus-visible:outline-orange-500 focus-visible:outline-offset-4 ${
                  isActive
                    ? 'border-orange-500 text-slate-50'
                    : 'border-transparent text-slate-400 hover:text-slate-100 hover:border-slate-700'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single primary action matching active workspace */}
        <div className="shrink-0">
          {activeView === 'editor' ? (
            <button
              type="button"
              disabled={isExportingWav}
              onClick={onExportSongWav}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-orange-400 focus-visible:outline-offset-2 sm:px-4"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isExportingWav ? 'Renderizando...' : 'Exportar Canción (.wav)'}</span>
            </button>
          ) : (
            <a
              href="/api/download-cpp-zip"
              download="voxdsp-cpp-portaudio.zip"
              className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-orange-500 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-orange-400 focus-visible:outline-offset-2 sm:px-4"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Descargar C++ (.zip)</span>
            </a>
          )}
        </div>
      </div>

      {/* Mobile navigation row (< md) */}
      <nav
        aria-label="Navegación móvil"
        className="flex md:hidden items-center justify-around border-t border-slate-800/60 px-3 py-1.5"
      >
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeView(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`px-2 py-1 text-xs font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                isActive
                  ? 'border-orange-500 text-slate-50'
                  : 'border-transparent text-slate-400 hover:text-slate-100'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
};

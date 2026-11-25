import React, { useEffect, useState } from 'react';
import { Check, Copy, FileCode2 } from 'lucide-react';

interface CppFileEntry {
  path: string;
  size: number;
  content: string;
}

export const CppProjectExplorer: React.FC = () => {
  const [files, setFiles] = useState<CppFileEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    const loadFiles = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/cpp-files');
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as { files: CppFileEntry[] };
        if (!cancelled) {
          setFiles(data.files);
          if (data.files.length > 0) {
            const preferred =
              data.files.find((f) => f.path === 'include/voxdsp/AudioEngine.hpp') ?? data.files[0];
            setSelectedPath(preferred.path);
          }
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error cargando archivos C++.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void loadFiles();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeFile = files.find((f) => f.path === selectedPath) ?? null;

  const handleCopy = async () => {
    if (!activeFile) return;
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard may be unavailable in restricted contexts
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="border-b border-slate-800/80 pb-4">
        <h1 className="text-xl font-semibold text-slate-50">
          Código Fuente del Motor C++20 y PortAudio
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Inspecciona los {files.length} archivos reales de <span className="font-mono text-slate-200">cpp-engine/</span> listos para compilar con CMake en tu equipo.
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-800/80 bg-[#111622] p-8 text-sm text-slate-400">
          Cargando archivos del motor C++...
        </div>
      ) : error ? (
        <div role="alert" className="rounded-xl border border-red-900/70 bg-red-950/30 p-6 text-sm text-red-300">
          No se pudieron cargar los archivos del proyecto: {error}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
          {/* File tree */}
          <nav
            aria-label="Archivos del proyecto C++"
            className="flex flex-col divide-y divide-slate-800/60 rounded-xl border border-slate-800/80 bg-[#111622] p-2"
          >
            {files.map((file) => {
              const isSelected = file.path === selectedPath;
              const displayPath = file.path.replace(/^include\/voxdsp\//, 'voxdsp/');
              return (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => setSelectedPath(file.path)}
                  title={`cpp-engine/${file.path}`}
                  className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                    isSelected
                      ? 'bg-orange-600/15 text-orange-300'
                      : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <FileCode2 className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
                    <span className="truncate font-mono text-xs">{displayPath}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-slate-500">
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Code viewer */}
          <div className="flex min-w-0 flex-col rounded-xl border border-slate-800/80 bg-[#0D1119]">
            {activeFile && (
              <>
                <div className="flex items-center justify-between gap-4 border-b border-slate-800/80 px-4 py-2.5">
                  <span className="truncate font-mono text-xs text-slate-300">
                    cpp-engine/{activeFile.path}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 hover:border-slate-500 hover:text-white transition-colors whitespace-nowrap shrink-0"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                        <span>Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="max-h-[640px] overflow-auto p-4 font-mono text-xs leading-relaxed text-slate-200">
                  <code>{activeFile.content}</code>
                </pre>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

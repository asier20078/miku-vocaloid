import React, { useRef } from 'react';
import { Mic, Play, Repeat, Square, Trash2, Upload } from 'lucide-react';
import { formatDuration } from '../audio/dspMath';
import { VoiceSlot } from '../audio/webAudioEngine';

interface VoiceBankPanelProps {
  slots: VoiceSlot[];
  selectedSlotId: string | null;
  isRecording: boolean;
  uploadError: string | null;
  onSelectSlot: (id: string) => void;
  onPlaySlot: (slot: VoiceSlot, loop: boolean) => void;
  onDeleteSlot: (id: string) => void;
  onUploadFiles: (files: FileList) => void;
  onToggleRecord: () => void;
}

export const VoiceBankPanel: React.FC<VoiceBankPanelProps> = ({
  slots,
  selectedSlotId,
  isRecording,
  uploadError,
  onSelectSlot,
  onPlaySlot,
  onDeleteSlot,
  onUploadFiles,
  onToggleRecord,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const sourceLabel = (type: VoiceSlot['sourceType']) => {
    if (type === 'upload') return 'Archivo subido';
    if (type === 'mic') return 'Grabación mic';
    return 'Voz demo';
  };

  return (
    <aside aria-label="Banco de voces reales" className="flex flex-col gap-4 rounded-xl border border-slate-800/80 bg-[#111622] p-4">
      <div>
        <h2 className="text-base font-semibold text-slate-100">Banco de Voces</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          Sube tus propias grabaciones (.wav, .mp3, .ogg) o graba desde el micrófono para procesarlas en tiempo real.
        </p>
      </div>

      {/* Upload & Record actions */}
      <div className="flex flex-col gap-2">
        <input
          ref={fileInputRef}
          id="voice-file-upload"
          type="file"
          accept="audio/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onUploadFiles(e.target.files);
              e.target.value = '';
            }
          }}
        />
        <label
          htmlFor="voice-file-upload"
          className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 bg-[#0D1119] px-4 py-2.5 text-xs font-semibold text-slate-200 hover:border-orange-500/70 hover:text-orange-300 transition-colors"
        >
          <Upload className="h-4 w-4 text-orange-400" aria-hidden="true" />
          <span>Subir voz real (.wav / .mp3)</span>
        </label>

        <button
          type="button"
          onClick={onToggleRecord}
          className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-orange-500 ${
            isRecording
              ? 'border-red-500/70 bg-red-950/50 text-red-200 hover:bg-red-900/60'
              : 'border-slate-700 bg-slate-900/60 text-slate-200 hover:border-slate-600 hover:bg-slate-800'
          }`}
        >
          {isRecording ? (
            <>
              <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              <span>Detener grabación</span>
            </>
          ) : (
            <>
              <Mic className="h-3.5 w-3.5 text-slate-300" aria-hidden="true" />
              <span>Grabar con micrófono</span>
            </>
          )}
        </button>

        {uploadError && (
          <p role="alert" className="rounded-md border border-red-900/70 bg-red-950/40 px-3 py-2 text-xs text-red-300">
            {uploadError}
          </p>
        )}
      </div>

      {/* Slot list */}
      <div className="flex flex-col divide-y divide-slate-800/70" data-testid="voice-bank-list">
        {slots.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            No hay voces cargadas. Sube un archivo de audio para empezar.
          </div>
        ) : (
          slots.map((slot) => {
            const selected = slot.id === selectedSlotId;
            return (
              <div
                key={slot.id}
                className={`py-3 transition-colors ${selected ? 'bg-slate-900/40 -mx-2 px-2 rounded-lg' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectSlot(slot.id)}
                    className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-orange-500 rounded"
                  >
                    <div className="truncate text-sm font-medium text-slate-100">
                      {slot.name}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] tabular-nums text-slate-400">
                      <span>{sourceLabel(slot.sourceType)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatDuration(slot.durationSec)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{(slot.sampleRate / 1000).toFixed(1)} kHz</span>
                    </div>
                  </button>

                  {slot.sourceType !== 'demo' && (
                    <button
                      type="button"
                      onClick={() => onDeleteSlot(slot.id)}
                      aria-label={`Eliminar "${slot.name}"`}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-red-400 transition-colors focus-visible:outline-2 focus-visible:outline-orange-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>

                {/* Mini waveform bars */}
                <div className="mt-2 flex h-5 items-center gap-px" aria-hidden="true">
                  {slot.peaks.slice(0, 48).map((p, idx) => (
                    <span
                      key={idx}
                      className={`w-1 flex-1 rounded-xs ${selected ? 'bg-orange-400/80' : 'bg-slate-600/60'}`}
                      style={{ height: `${Math.max(12, Math.round(p * 100))}%` }}
                    />
                  ))}
                </div>

                {/* Slot transport actions */}
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onPlaySlot(slot, false)}
                    aria-label={`Reproducir "${slot.name}"`}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-orange-600 hover:text-white transition-colors whitespace-nowrap"
                  >
                    <Play className="h-3 w-3 fill-current" aria-hidden="true" />
                    <span>Reproducir</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onPlaySlot(slot, true)}
                    aria-label={`Bucle "${slot.name}"`}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-700 bg-transparent px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-500 hover:text-white transition-colors whitespace-nowrap"
                  >
                    <Repeat className="h-3 w-3" aria-hidden="true" />
                    <span>Bucle</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};

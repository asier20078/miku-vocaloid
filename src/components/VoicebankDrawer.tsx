import React from 'react';
import { Check, Mic, Square, Trash2, Upload, Volume2 } from 'lucide-react';
import { formatDuration } from '../audio/dspMath';
import { BUILTIN_VOICEBANKS, VoicebankProfile } from '../audio/phonetics';
import { VoiceSlot } from '../audio/webAudioEngine';

interface VoicebankDrawerProps {
  activeVoicebankId: string;
  customSlots: VoiceSlot[];
  isRecording: boolean;
  uploadError: string | null;
  onSelectVoicebank: (profile: VoicebankProfile) => void;
  onUploadFiles: (files: FileList) => void;
  onToggleRecord: () => void;
  onDeleteCustomSlot: (slotId: string) => void;
}

export const VoicebankDrawer: React.FC<VoicebankDrawerProps> = ({
  activeVoicebankId,
  customSlots,
  isRecording,
  uploadError,
  onSelectVoicebank,
  onUploadFiles,
  onToggleRecord,
  onDeleteCustomSlot,
}) => {
  return (
    <section
      aria-label="Selector de Voz y Banco de Muestras"
      className="rounded-xl border border-slate-800 bg-[#111622] p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">
            Voicebank Activo — Sintetizador Vocal o Tu Voz Real
          </h2>
          <p className="text-xs text-slate-400">
            Elige una voz sintética de formantes o sube tu propia voz (.wav/.mp3) para que cante toda la melodía del Piano Roll.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            id="voicebank-file-upload"
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
            htmlFor="voicebank-file-upload"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-orange-500/60 bg-[#0D1119] px-3 py-1.5 text-xs font-semibold text-orange-300 hover:bg-orange-950/30 transition-colors"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Subir tu voz (.wav / .mp3)</span>
          </label>

          <button
            type="button"
            onClick={onToggleRecord}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              isRecording
                ? 'border-red-500 bg-red-950/60 text-red-200'
                : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500'
            }`}
          >
            {isRecording ? (
              <>
                <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                <span>Detener grabación</span>
              </>
            ) : (
              <>
                <Mic className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Grabar voz real</span>
              </>
            )}
          </button>
        </div>
      </div>

      {uploadError && (
        <p role="alert" className="mt-3 rounded-md border border-red-900/70 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          {uploadError}
        </p>
      )}

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {BUILTIN_VOICEBANKS.map((vb) => {
          const active = activeVoicebankId === vb.id;
          return (
            <button
              key={vb.id}
              type="button"
              onClick={() => onSelectVoicebank(vb)}
              className={`flex items-start justify-between gap-2 rounded-lg border p-3 text-left transition-colors ${
                active
                  ? 'border-orange-500 bg-orange-600/15'
                  : 'border-slate-800 bg-[#0D1119] hover:border-slate-700'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
                  <Volume2 className="h-3.5 w-3.5 text-orange-400 shrink-0" aria-hidden="true" />
                  <span className="truncate">{vb.name}</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">{vb.subtitle}</p>
              </div>
              {active && <Check className="h-4 w-4 shrink-0 text-orange-400" aria-hidden="true" />}
            </button>
          );
        })}

        {customSlots.map((slot) => {
          const vbId = `custom-${slot.id}`;
          const active = activeVoicebankId === vbId;
          const profile: VoicebankProfile = {
            id: vbId,
            name: slot.name,
            subtitle: `Voz subida · ${formatDuration(slot.durationSec)}`,
            baseFormantShift: 1.0,
            breathiness: 0.08,
            brightness: 1.05,
            vibratoDepth: 0.22,
            vibratoRate: 5.4,
            customSlotId: slot.id,
          };

          return (
            <div
              key={slot.id}
              className={`flex items-start justify-between gap-2 rounded-lg border p-3 transition-colors ${
                active
                  ? 'border-orange-500 bg-orange-600/15'
                  : 'border-slate-800 bg-[#0D1119] hover:border-slate-700'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectVoicebank(profile)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-lime-300">
                  <Volume2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{slot.name}</span>
                </div>
                <p className="mt-1 font-mono text-[11px] tabular-nums text-slate-400">
                  Voz real · {formatDuration(slot.durationSec)} · {(slot.sampleRate / 1000).toFixed(1)} kHz
                </p>
              </button>

              <div className="flex items-center gap-1 shrink-0">
                {active && <Check className="h-4 w-4 text-orange-400" aria-hidden="true" />}
                <button
                  type="button"
                  onClick={() => onDeleteCustomSlot(slot.id)}
                  aria-label={`Eliminar "${slot.name}"`}
                  className="rounded p-1 text-slate-500 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

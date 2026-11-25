import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { midiToNoteName, VocalNote } from '../audio/phonetics';
import { VIBRATO_PRESETS, VibratoPresetId } from '../audio/vocaloidParams';

interface NoteInspectorBarProps {
  selectedNote: VocalNote | null;
  onUpdateNote: (noteId: string, patch: Partial<VocalNote>) => void;
}

export const NoteInspectorBar: React.FC<NoteInspectorBarProps> = ({
  selectedNote,
  onUpdateNote,
}) => {
  if (!selectedNote) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#14151A] bg-[#22242A] px-3 py-1 text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
          <span>
            <strong className="font-semibold text-slate-200">Propiedades de Nota:</strong>{' '}
            Selecciona una nota para editar VEL, OPE, Accent, Decay, Vibrato y Portamento · Doble clic para editar la sílaba.
          </span>
        </div>
      </div>
    );
  }

  const vel = selectedNote.velocity ?? 64;
  const ope = selectedNote.opening ?? 100;
  const accent = selectedNote.accent ?? 50;
  const decay = selectedNote.decay ?? 50;
  const vibratoType: VibratoPresetId = selectedNote.vibratoType ?? 'normal';
  const portEnabled = selectedNote.portamentoEnabled !== false;

  return (
    <section
      aria-label="Propiedades de Nota Vocaloid"
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-[#14151A] bg-[#23262E] px-3 py-1.5 text-[11px] text-slate-200"
    >
      <div className="flex items-center gap-2 border-r border-[#14151A] pr-3">
        <span className="font-mono font-bold text-emerald-400">
          {midiToNoteName(selectedNote.midi)}
        </span>
        <span className="rounded-[2px] bg-[#14161B] px-1.5 py-0.5 font-semibold text-white">
          {selectedNote.lyric}
        </span>
        <span className="font-mono text-[11px] text-sky-300">
          [{selectedNote.phonetic}]
        </span>
      </div>

      <label className="flex items-center gap-1.5">
        <span className="font-mono text-[10px] font-semibold text-emerald-300">VEL</span>
        <input
          type="range"
          min={0}
          max={127}
          step={1}
          aria-label="Velocity de nota"
          value={vel}
          onChange={(e) => onUpdateNote(selectedNote.id, { velocity: Number(e.target.value) })}
          className="daw-slider w-16"
        />
        <span className="w-6 font-mono text-[10px] tabular-nums text-slate-300">{vel}</span>
      </label>

      <label className="flex items-center gap-1.5">
        <span className="font-mono text-[10px] font-semibold text-rose-300">OPE</span>
        <input
          type="range"
          min={0}
          max={127}
          step={1}
          aria-label="Opening de nota"
          value={ope}
          onChange={(e) => onUpdateNote(selectedNote.id, { opening: Number(e.target.value) })}
          className="daw-slider w-16"
        />
        <span className="w-6 font-mono text-[10px] tabular-nums text-slate-300">{ope}</span>
      </label>

      <label className="flex items-center gap-1.5">
        <span className="text-[10px] font-medium text-slate-300">Accent</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          aria-label="Accent de nota"
          value={accent}
          onChange={(e) => onUpdateNote(selectedNote.id, { accent: Number(e.target.value) })}
          className="daw-slider w-14"
        />
        <span className="w-8 font-mono text-[10px] tabular-nums text-slate-300">{accent}%</span>
      </label>

      <label className="flex items-center gap-1.5">
        <span className="text-[10px] font-medium text-slate-300">Decay</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          aria-label="Decay de nota"
          value={decay}
          onChange={(e) => onUpdateNote(selectedNote.id, { decay: Number(e.target.value) })}
          className="daw-slider w-14"
        />
        <span className="w-8 font-mono text-[10px] tabular-nums text-slate-300">{decay}%</span>
      </label>

      <label className="flex items-center gap-1.5">
        <span className="text-[10px] font-medium text-slate-300">Vibrato</span>
        <select
          aria-label="Tipo de vibrato de nota"
          value={vibratoType}
          onChange={(e) => {
            const presetId = e.target.value as VibratoPresetId;
            const spec = VIBRATO_PRESETS[presetId];
            onUpdateNote(selectedNote.id, {
              vibratoType: presetId,
              vibratoRate: spec.rateHz,
              vibratoDepth: spec.depthSemitones,
            });
          }}
          className="rounded-[2px] border border-[#14161B] bg-[#16181D] px-2 py-0.5 text-[10px] text-sky-300 focus:border-sky-400 focus:outline-none"
        >
          {Object.values(VIBRATO_PRESETS).map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={() => onUpdateNote(selectedNote.id, { portamentoEnabled: !portEnabled })}
        className={`rounded-[2px] border px-2 py-0.5 font-mono text-[10px] font-semibold transition-colors ${
          portEnabled
            ? 'border-sky-500/60 bg-sky-500/20 text-sky-300'
            : 'border-[#14161B] bg-[#16181D] text-slate-400'
        }`}
      >
        POR {portEnabled ? 'ON' : 'OFF'}
      </button>
    </section>
  );
};

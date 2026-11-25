import React, { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { VoicebankProfile } from '../audio/phonetics';
import {
  BreathMode,
  formatPanLabel,
  RobotVoiceMode,
  STYLE_PRESETS,
  StylePresetId,
  VocaloidStyleSettings,
  VocalTrackChannel,
} from '../audio/vocaloidParams';
import { RotaryKnob } from './RotaryKnob';
import { VocaloidMascotArt } from './VocaloidMascotArt';

interface VocaloidSidebarProps {
  tracks: VocalTrackChannel[];
  selectedTrackId: string;
  voicebanks: VoicebankProfile[];
  activeVoicebank: VoicebankProfile;
  styleSettings: VocaloidStyleSettings;
  meterLevel: number; // 0..1 live playback level
  onSelectTrack: (trackId: string) => void;
  onUpdateTrack: (trackId: string, patch: Partial<VocalTrackChannel>) => void;
  onSelectVoicebank: (vb: VoicebankProfile) => void;
  onUpdateStyle: (patch: Partial<VocaloidStyleSettings>) => void;
  onSelectStylePreset: (presetId: StylePresetId) => void;
  onOpenVoicebankDrawer: () => void;
}

export const VocaloidSidebar: React.FC<VocaloidSidebarProps> = ({
  tracks,
  selectedTrackId,
  voicebanks,
  activeVoicebank,
  styleSettings,
  meterLevel,
  onSelectTrack,
  onUpdateTrack,
  onSelectVoicebank,
  onUpdateStyle,
  onSelectStylePreset,
  onOpenVoicebankDrawer,
}) => {
  const [voiceOpen, setVoiceOpen] = useState(true);
  const [styleOpen, setStyleOpen] = useState(true);
  const [colorOpen, setColorOpen] = useState(true);
  const [savedToast, setSavedToast] = useState(false);

  const selectedTrack = tracks.find((t) => t.id === selectedTrackId) ?? tracks[0];
  const presetEntries = Object.entries(STYLE_PRESETS) as Array<
    [StylePresetId, { label: string; patch: Partial<VocaloidStyleSettings> }]
  >;
  const currentPresetIdx = Math.max(
    0,
    presetEntries.findIndex(([id]) => id === styleSettings.stylePreset)
  );

  const cyclePreset = (dir: -1 | 1) => {
    const nextIdx = (currentPresetIdx + dir + presetEntries.length) % presetEntries.length;
    onSelectStylePreset(presetEntries[nextIdx][0]);
  };

  const meterPct = Math.round(Math.max(4, Math.min(100, meterLevel * 100)));

  return (
    <aside
      aria-label="Inspector AI Track y Voice Color"
      className="daw-scroll flex h-full w-[228px] shrink-0 flex-col overflow-y-auto border-r border-[#14151A] bg-[#282A30] text-[11px] text-slate-200 select-none"
    >
      {/* AI TRACK SECTION */}
      <div className="border-b border-[#18191E] px-2.5 py-2">
        <div className="mb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="rounded-[2px] border border-slate-500/70 bg-[#1B1D22] px-1 py-0.2 font-mono text-[9px] font-bold text-slate-200">
              AI
            </span>
            <span className="font-display text-[12px] font-bold tracking-wide text-slate-100">
              TRACK
            </span>
          </div>
          <span className="font-mono text-[10px] text-slate-400">
            CH {tracks.findIndex((t) => t.id === selectedTrack?.id) + 1}
          </span>
        </div>

        {/* Track selector dropdown */}
        <select
          aria-label="Pista activa"
          value={selectedTrack?.id ?? ''}
          onChange={(e) => onSelectTrack(e.target.value)}
          className="mb-2 h-6 w-full rounded-[2px] border border-[#14161B] bg-[#1A1C21] px-2 text-[11px] font-medium text-slate-100 focus:border-sky-400 focus:outline-none"
        >
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        {/* Live Emerald Meter + E M S R */}
        {selectedTrack && (
          <>
            <div className="mb-2 flex items-center gap-1.5">
              <div className="relative h-3.5 flex-1 overflow-hidden rounded-[2px] border border-[#121418] bg-[#13151A]">
                <div
                  className="h-full bg-gradient-to-r from-[#16A34A] via-[#22C55E] to-[#4ADE80] transition-[width] duration-75"
                  style={{ width: `${selectedTrack.muted ? 0 : meterPct}%` }}
                />
              </div>

              <div className="flex items-center gap-[2px]">
                <button
                  type="button"
                  title="Activar efectos de pista (E)"
                  onClick={() =>
                    onUpdateTrack(selectedTrack.id, {
                      effectEnabled: !selectedTrack.effectEnabled,
                    })
                  }
                  className={`h-4 w-4 rounded-[2px] font-mono text-[9px] font-bold transition-colors ${
                    selectedTrack.effectEnabled
                      ? 'bg-[#229A5B] text-white'
                      : 'bg-[#1A1C21] text-slate-400 hover:text-white'
                  }`}
                >
                  E
                </button>
                <button
                  type="button"
                  title="Silenciar pista (M)"
                  onClick={() =>
                    onUpdateTrack(selectedTrack.id, { muted: !selectedTrack.muted })
                  }
                  className={`h-4 w-4 rounded-[2px] font-mono text-[9px] font-bold transition-colors ${
                    selectedTrack.muted
                      ? 'bg-amber-600 text-white'
                      : 'bg-[#1A1C21] text-slate-400 hover:text-white'
                  }`}
                >
                  M
                </button>
                <button
                  type="button"
                  title="Solo pista (S)"
                  onClick={() =>
                    onUpdateTrack(selectedTrack.id, { solo: !selectedTrack.solo })
                  }
                  className={`h-4 w-4 rounded-[2px] font-mono text-[9px] font-bold transition-colors ${
                    selectedTrack.solo
                      ? 'bg-sky-500 text-slate-950'
                      : 'bg-[#1A1C21] text-slate-400 hover:text-white'
                  }`}
                >
                  S
                </button>
                <button
                  type="button"
                  title="Armar pista (R)"
                  onClick={() =>
                    onUpdateTrack(selectedTrack.id, { armed: !selectedTrack.armed })
                  }
                  className={`h-4 w-4 rounded-[2px] font-mono text-[9px] font-bold transition-colors ${
                    selectedTrack.armed
                      ? 'bg-rose-600 text-white'
                      : 'bg-[#1A1C21] text-slate-400 hover:text-white'
                  }`}
                >
                  R
                </button>
              </div>
            </div>

            {/* Volume dB slider */}
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="w-4 text-center font-mono text-[9px] text-slate-400" title="Volumen">
                ◢
              </span>
              <input
                type="range"
                min={-24}
                max={6}
                step={0.5}
                aria-label="Volumen de pista dB"
                value={selectedTrack.volumeDb}
                onChange={(e) =>
                  onUpdateTrack(selectedTrack.id, { volumeDb: Number(e.target.value) })
                }
                className="daw-slider flex-1"
              />
              <span className="w-9 rounded-[2px] border border-[#14161B] bg-[#131419] px-1 py-0.5 text-right font-mono text-[10px] tabular-nums text-slate-200">
                {selectedTrack.volumeDb.toFixed(1)}
              </span>
            </div>

            {/* Pan slider */}
            <div className="flex items-center gap-1.5">
              <span className="w-4 text-center font-mono text-[9px] text-slate-400" title="Panorama">
                ⊿
              </span>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.05}
                aria-label="Pan de pista"
                value={selectedTrack.pan}
                onChange={(e) =>
                  onUpdateTrack(selectedTrack.id, { pan: Number(e.target.value) })
                }
                className="daw-slider flex-1"
              />
              <span className="w-9 rounded-[2px] border border-[#14161B] bg-[#131419] px-1 py-0.5 text-right font-mono text-[10px] tabular-nums text-slate-200">
                {formatPanLabel(selectedTrack.pan)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* VOICE SECTION */}
      <div className="border-b border-[#18191E] px-2.5 py-2">
        <div className="mb-1 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setVoiceOpen((v) => !v)}
            className="flex items-center gap-1 font-display text-[11px] font-bold tracking-wider text-slate-100 hover:text-white"
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform ${voiceOpen ? '' : '-rotate-90'}`}
              aria-hidden="true"
            />
            <span>VOICE</span>
          </button>
          <button
            type="button"
            onClick={onOpenVoicebankDrawer}
            className="rounded-[2px] bg-[#1A1C21] px-1.5 py-0.5 text-[9px] font-semibold text-sky-400 hover:bg-[#22252C]"
          >
            + Voz
          </button>
        </div>

        {voiceOpen && (
          <div className="flex flex-col gap-1.5">
            <select
              aria-label="Selector de Voicebank"
              value={activeVoicebank.id}
              onChange={(e) => {
                const found = voicebanks.find((v) => v.id === e.target.value);
                if (found) onSelectVoicebank(found);
              }}
              className="h-6 w-full rounded-[2px] border border-[#14161B] bg-[#1A1C21] px-2 text-[11px] font-medium text-slate-100 focus:border-sky-400 focus:outline-none"
            >
              {voicebanks.map((vb) => (
                <option key={vb.id} value={vb.id}>
                  {vb.name}
                </option>
              ))}
            </select>

            <VocaloidMascotArt
              voicebankId={activeVoicebank.id}
              voicebankName={activeVoicebank.name}
              variant="card"
            />

            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-slate-400">TYPE</span>
              <span className="flex-1 truncate rounded-[2px] border border-[#14161B] bg-[#131419] px-1.5 py-0.5 font-mono text-[10px] text-slate-200">
                {activeVoicebank.name}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* STYLE SECTION */}
      <div className="border-b border-[#18191E] px-2.5 py-2">
        <div className="mb-1 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStyleOpen((v) => !v)}
            className="flex items-center gap-1 font-display text-[11px] font-bold tracking-wider text-slate-100 hover:text-white"
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform ${styleOpen ? '' : '-rotate-90'}`}
              aria-hidden="true"
            />
            <span>STYLE</span>
          </button>
          <button
            type="button"
            title="Guardar ajuste de estilo"
            onClick={() => {
              setSavedToast(true);
              setTimeout(() => setSavedToast(false), 1200);
            }}
            className={`rounded-[2px] p-1 transition-colors ${
              savedToast ? 'text-emerald-400' : 'text-slate-300 hover:bg-[#1A1C21] hover:text-white'
            }`}
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        {styleOpen && (
          <div className="flex flex-col gap-1.5">
            {/* Preset dropdown with < > arrows */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Estilo anterior"
                onClick={() => cyclePreset(-1)}
                className="flex h-6 w-5 items-center justify-center rounded-[2px] bg-[#1A1C21] text-slate-300 hover:text-white"
              >
                <ChevronLeft className="h-3 w-3" aria-hidden="true" />
              </button>
              <select
                aria-label="Preset de estilo"
                value={styleSettings.stylePreset}
                onChange={(e) => onSelectStylePreset(e.target.value as StylePresetId)}
                className="h-6 min-w-0 flex-1 rounded-[2px] border border-[#14161B] bg-[#1A1C21] px-1.5 text-[10px] font-medium text-slate-100 focus:border-sky-400 focus:outline-none"
              >
                {presetEntries.map(([id, spec]) => (
                  <option key={id} value={id}>
                    {spec.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label="Siguiente estilo"
                onClick={() => cyclePreset(1)}
                className="flex h-6 w-5 items-center justify-center rounded-[2px] bg-[#1A1C21] text-slate-300 hover:text-white"
              >
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>

            {/* ROBOT VOICE */}
            <div className="flex items-center justify-between gap-1.5">
              <label className="flex cursor-pointer items-center gap-1.5 text-[10px] font-semibold text-slate-300">
                <input
                  type="checkbox"
                  checked={styleSettings.robotVoice !== 'off'}
                  onChange={(e) =>
                    onUpdateStyle({ robotVoice: e.target.checked ? 'soft' : 'off' })
                  }
                  className="h-3 w-3 rounded-[2px] accent-sky-400"
                />
                <span>ROBOT VOICE</span>
              </label>
              <select
                aria-label="Modo Robot Voice"
                value={styleSettings.robotVoice}
                onChange={(e) =>
                  onUpdateStyle({ robotVoice: e.target.value as RobotVoiceMode })
                }
                className="h-5 w-[82px] rounded-[2px] border border-[#14161B] bg-[#1A1C21] px-1 text-[10px] text-slate-200 focus:border-sky-400 focus:outline-none"
              >
                <option value="off">Off</option>
                <option value="soft">Soft</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            {/* BREATH */}
            <div className="flex items-center justify-between gap-1.5">
              <label className="flex cursor-pointer items-center gap-1.5 text-[10px] font-semibold text-slate-300">
                <input
                  type="checkbox"
                  checked={styleSettings.breathMode !== 'off'}
                  onChange={(e) =>
                    onUpdateStyle({ breathMode: e.target.checked ? 'sometimes' : 'off' })
                  }
                  className="h-3 w-3 rounded-[2px] accent-sky-400"
                />
                <span>BREATH</span>
              </label>
              <select
                aria-label="Frecuencia de respiración"
                value={styleSettings.breathMode}
                onChange={(e) =>
                  onUpdateStyle({ breathMode: e.target.value as BreathMode })
                }
                className="h-5 w-[82px] rounded-[2px] border border-[#14161B] bg-[#1A1C21] px-1 text-[10px] text-slate-200 focus:border-sky-400 focus:outline-none"
              >
                <option value="off">Off</option>
                <option value="sometimes">Sometimes</option>
                <option value="always">Always</option>
              </select>
            </div>

            {/* EXHALATION */}
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold text-slate-400">EXHALATION</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="range"
                  min={0}
                  max={20}
                  step={1}
                  aria-label="Exhalation"
                  value={styleSettings.exhalation}
                  onChange={(e) =>
                    onUpdateStyle({ exhalation: Number(e.target.value) })
                  }
                  className="daw-slider flex-1"
                />
                <span className="w-8 rounded-[2px] border border-[#14161B] bg-[#131419] px-1 py-0.5 text-right font-mono text-[10px] tabular-nums text-slate-200">
                  {styleSettings.exhalation}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* VOICE COLOR SECTION */}
      <div className="px-2.5 py-2">
        <div className="mb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setColorOpen((v) => !v)}
              className="flex items-center gap-1 font-display text-[11px] font-bold tracking-wider text-slate-100 hover:text-white"
            >
              <ChevronDown
                className={`h-3 w-3 transition-transform ${colorOpen ? '' : '-rotate-90'}`}
                aria-hidden="true"
              />
            </button>
            <label className="flex cursor-pointer items-center gap-1.5 font-display text-[11px] font-bold tracking-wider text-slate-100">
              <input
                type="checkbox"
                checked={styleSettings.voiceColorEnabled}
                onChange={(e) =>
                  onUpdateStyle({ voiceColorEnabled: e.target.checked })
                }
                className="h-3 w-3 rounded-[2px] accent-sky-400"
              />
              <span>VOICE COLOR</span>
            </label>
          </div>
        </div>

        {colorOpen && (
          <div className="flex flex-col gap-1.5">
            {/* Large Rotary EXPRESSION Knob */}
            <RotaryKnob
              label="EXPRESSION"
              value={styleSettings.expression}
              min={0}
              max={100}
              defaultValue={79}
              size={64}
              disabled={!styleSettings.voiceColorEnabled}
              onChange={(expression) => onUpdateStyle({ expression })}
            />

            {/* AIR */}
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold text-slate-400">AIR</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  disabled={!styleSettings.voiceColorEnabled}
                  aria-label="Air"
                  value={styleSettings.air}
                  onChange={(e) => onUpdateStyle({ air: Number(e.target.value) })}
                  className="daw-slider flex-1"
                />
                <span className="w-8 rounded-[2px] border border-[#14161B] bg-[#131419] px-1 py-0.5 text-right font-mono text-[10px] tabular-nums text-slate-200">
                  {styleSettings.air}
                </span>
              </div>
            </div>

            {/* CHARACTER */}
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold text-slate-400">CHARACTER</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="range"
                  min={-50}
                  max={50}
                  step={1}
                  disabled={!styleSettings.voiceColorEnabled}
                  aria-label="Character"
                  value={styleSettings.character}
                  onChange={(e) => onUpdateStyle({ character: Number(e.target.value) })}
                  className="daw-slider flex-1"
                />
                <span className="w-8 rounded-[2px] border border-[#14161B] bg-[#131419] px-1 py-0.5 text-right font-mono text-[10px] tabular-nums text-slate-200">
                  {styleSettings.character}
                </span>
              </div>
            </div>

            {/* ATTACK */}
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold text-slate-400">ATTACK</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  disabled={!styleSettings.voiceColorEnabled}
                  aria-label="Attack"
                  value={styleSettings.attack}
                  onChange={(e) => onUpdateStyle({ attack: Number(e.target.value) })}
                  className="daw-slider flex-1"
                />
                <span className="w-8 rounded-[2px] border border-[#14161B] bg-[#131419] px-1 py-0.5 text-right font-mono text-[10px] tabular-nums text-slate-200">
                  {styleSettings.attack}
                </span>
              </div>
            </div>

            {/* TAKE 1..4 */}
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-[10px] font-semibold text-slate-400">TAKE</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Take anterior"
                  onClick={() =>
                    onUpdateStyle({
                      take: styleSettings.take <= 1 ? 4 : styleSettings.take - 1,
                    })
                  }
                  className="flex h-5 w-5 items-center justify-center rounded-[2px] bg-[#1A1C21] text-slate-300 hover:text-white"
                >
                  <ChevronLeft className="h-3 w-3" aria-hidden="true" />
                </button>
                <span className="w-10 rounded-[2px] border border-[#14161B] bg-[#131419] py-0.5 text-center font-mono text-[10px] font-semibold text-slate-100">
                  {styleSettings.take}
                </span>
                <button
                  type="button"
                  aria-label="Siguiente Take"
                  onClick={() =>
                    onUpdateStyle({
                      take: styleSettings.take >= 4 ? 1 : styleSettings.take + 1,
                    })
                  }
                  className="flex h-5 w-5 items-center justify-center rounded-[2px] bg-[#1A1C21] text-slate-300 hover:text-white"
                >
                  <ChevronRight className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

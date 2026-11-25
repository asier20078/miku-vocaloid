import React, { useMemo } from 'react';
import { Clock, Music2, Plus, Trash2 } from 'lucide-react';
import { VocalNote } from '../audio/phonetics';
import { formatPanLabel, VocalTrackChannel } from '../audio/vocaloidParams';
import { VocaloidMascotArt } from './VocaloidMascotArt';

interface ArrangementTimelineProps {
  tracks: VocalTrackChannel[];
  selectedTrackId: string;
  notes: VocalNote[];
  bpm: number;
  playheadBeat: number;
  activeVoicebankId: string;
  activeVoicebankName: string;
  onSelectTrack: (trackId: string) => void;
  onAddHarmonyTrack: () => void;
  onDeleteTrack: (trackId: string) => void;
  onUpdateTrack: (trackId: string, patch: Partial<VocalTrackChannel>) => void;
  onChangeBpm: (bpm: number) => void;
  onScrubBeat: (beat: number) => void;
}

const BEAT_PX = 22;

export const ArrangementTimeline: React.FC<ArrangementTimelineProps> = ({
  tracks,
  selectedTrackId,
  notes,
  bpm,
  playheadBeat,
  activeVoicebankId,
  activeVoicebankName,
  onSelectTrack,
  onAddHarmonyTrack,
  onDeleteTrack,
  onUpdateTrack,
  onChangeBpm,
  onScrubBeat,
}) => {
  const { totalBars, clipStartBeat, clipEndBeat, miniContourPath } = useMemo(() => {
    const maxEnd = notes.reduce((acc, n) => Math.max(acc, n.startBeat + n.durationBeats), 16);
    const minStart = notes.reduce((acc, n) => Math.min(acc, n.startBeat), 0);
    const bars = Math.max(10, Math.ceil((maxEnd + 4) / 4));

    const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat);
    let path = '';
    if (sorted.length > 0) {
      const minM = sorted.reduce((acc, n) => Math.min(acc, n.midi), 84) - 2;
      const maxM = sorted.reduce((acc, n) => Math.max(acc, n.midi), 48) + 2;
      const span = Math.max(6, maxM - minM);
      sorted.forEach((n, idx) => {
        const x1 = n.startBeat * BEAT_PX;
        const x2 = (n.startBeat + n.durationBeats) * BEAT_PX;
        const y = 38 - ((n.midi - minM) / span) * 28;
        path += idx === 0 ? `M ${x1.toFixed(1)} ${y.toFixed(1)} L ${x2.toFixed(1)} ${y.toFixed(1)} ` : `L ${x1.toFixed(1)} ${y.toFixed(1)} L ${x2.toFixed(1)} ${y.toFixed(1)} `;
      });
    }

    return {
      totalBars: bars,
      clipStartBeat: Math.max(0, Math.floor(minStart)),
      clipEndBeat: Math.max(12, Math.ceil(maxEnd / 4) * 4),
      miniContourPath: path,
    };
  }, [notes]);

  const timelineWidth = totalBars * 4 * BEAT_PX;
  const anyMuted = tracks.every((t) => t.muted);
  const anySolo = tracks.some((t) => t.solo);

  return (
    <section
      aria-label="Ventana de Arreglo Multipista"
      className="flex h-[156px] shrink-0 overflow-hidden border-b border-[#111216] bg-[#1F2026] select-none"
    >
      {/* Left Track List Header & Channel Strips */}
      <div className="flex w-[220px] shrink-0 flex-col border-r border-[#121318] bg-[#24262C]">
        {/* Top Arrangement Micro-Bar */}
        <div className="flex h-[24px] items-center justify-between border-b border-[#16171C] bg-[#2C2E35] px-1.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onAddHarmonyTrack}
              title="Añadir pista de armonía / coro (3ª, 5ª, Bajo)"
              aria-label="Añadir pista de armonía"
              className="flex h-5 w-7 items-center justify-center rounded-[2px] bg-[#3B3E47] text-slate-100 hover:bg-sky-500 hover:text-slate-950 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <Music2 className="h-3 w-3 text-sky-400" aria-hidden="true" />
            <Clock className="h-3 w-3 text-slate-400" aria-hidden="true" />
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              title="Silenciar todas las pistas"
              onClick={() => tracks.forEach((t) => onUpdateTrack(t.id, { muted: !anyMuted }))}
              className={`h-4 w-4 rounded-[2px] font-mono text-[9px] font-bold ${
                anyMuted ? 'bg-amber-600 text-white' : 'bg-[#191B20] text-slate-300'
              }`}
            >
              M
            </button>
            <button
              type="button"
              title="Limpiar Solo global"
              onClick={() => tracks.forEach((t) => onUpdateTrack(t.id, { solo: false }))}
              className={`h-4 w-4 rounded-[2px] font-mono text-[9px] font-bold ${
                anySolo ? 'bg-sky-500 text-slate-950' : 'bg-[#191B20] text-slate-300'
              }`}
            >
              S
            </button>
          </div>
        </div>

        {/* TIMESIG / TEMPO / MAIN Strip */}
        <div className="flex flex-col border-b border-[#16171C] bg-[#1E2025] px-2 py-0.5 text-[9px] font-semibold text-slate-400">
          <div className="flex items-center justify-between">
            <span>TIMESIG</span>
            <span className="font-mono text-slate-200">4/4</span>
          </div>
          <div className="flex items-center justify-between">
            <span>TEMPO</span>
            <input
              type="number"
              min={60}
              max={200}
              aria-label="Tempo Arrangement BPM"
              value={bpm}
              onChange={(e) => onChangeBpm(Math.max(60, Math.min(200, Number(e.target.value) || 120)))}
              className="w-10 bg-transparent text-right font-mono text-[10px] font-bold text-sky-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Scrollable Track Strips */}
        <div className="daw-scroll flex-1 overflow-y-auto">
          {tracks.map((track, idx) => {
            const isSel = track.id === selectedTrackId;
            return (
              <div
                key={track.id}
                onClick={() => onSelectTrack(track.id)}
                className={`flex h-[68px] cursor-pointer border-b border-[#14161B] transition-colors ${
                  isSel ? 'bg-[#2C2F37]' : 'bg-[#23252B] hover:bg-[#282B32]'
                }`}
              >
                {/* Emerald Left Track Number Badge */}
                <div
                  className="flex w-9 shrink-0 flex-col items-center justify-center gap-1 border-r border-[#14161B] py-1"
                  style={{ backgroundColor: track.color }}
                >
                  {idx === 0 ? (
                    <VocaloidMascotArt
                      voicebankId={activeVoicebankId}
                      voicebankName={activeVoicebankName}
                      variant="avatar"
                    />
                  ) : (
                    <span className="rounded-[2px] bg-black/30 px-1 font-mono text-[9px] font-bold text-white">
                      {track.role.toUpperCase()}
                    </span>
                  )}
                  <span className="font-mono text-[10px] font-bold text-white">{idx + 1}</span>
                </div>

                {/* Track Controls */}
                <div className="flex min-w-0 flex-1 flex-col justify-between p-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-[10px] font-semibold text-slate-100">
                      {track.name}
                    </span>
                    <div className="flex items-center gap-[2px]">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateTrack(track.id, { effectEnabled: !track.effectEnabled });
                        }}
                        className={`h-3.5 w-3.5 rounded-[1px] font-mono text-[8px] font-bold ${
                          track.effectEnabled
                            ? 'bg-[#229A5B] text-white'
                            : 'bg-[#17191E] text-slate-400'
                        }`}
                      >
                        E
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateTrack(track.id, { muted: !track.muted });
                        }}
                        className={`h-3.5 w-3.5 rounded-[1px] font-mono text-[8px] font-bold ${
                          track.muted ? 'bg-amber-600 text-white' : 'bg-[#17191E] text-slate-400'
                        }`}
                      >
                        M
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateTrack(track.id, { solo: !track.solo });
                        }}
                        className={`h-3.5 w-3.5 rounded-[1px] font-mono text-[8px] font-bold ${
                          track.solo ? 'bg-sky-500 text-slate-950' : 'bg-[#17191E] text-slate-400'
                        }`}
                      >
                        S
                      </button>
                      {idx > 0 && (
                        <button
                          type="button"
                          title="Eliminar pista"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteTrack(track.id);
                          }}
                          className="ml-0.5 text-slate-500 hover:text-rose-400"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="truncate rounded-[2px] bg-[#17181D] px-1.5 py-0.5 font-mono text-[9px] text-slate-300">
                    {idx === 0 ? activeVoicebankName : track.voiceLabel}
                  </div>

                  {/* Mini Vol & Pan */}
                  <div className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min={-24}
                      max={6}
                      step={0.5}
                      aria-label={`Volumen ${track.name}`}
                      value={track.volumeDb}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        onUpdateTrack(track.id, { volumeDb: Number(e.target.value) })
                      }
                      className="daw-slider w-12"
                    />
                    <span className="font-mono text-[9px] tabular-nums text-slate-400">
                      {track.volumeDb.toFixed(1)}
                    </span>
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.05}
                      aria-label={`Pan ${track.name}`}
                      value={track.pan}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        onUpdateTrack(track.id, { pan: Number(e.target.value) })
                      }
                      className="daw-slider w-10"
                    />
                    <span className="font-mono text-[9px] text-slate-400">
                      {formatPanLabel(track.pan)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Timeline Grid & Emerald Clip Regions */}
      <div className="daw-scroll relative flex-1 overflow-x-auto overflow-y-auto bg-[#131418]">
        <div className="relative min-h-full" style={{ width: timelineWidth }}>
          {/* Measure Ruler */}
          <div
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const b = Math.max(0, (e.clientX - rect.left) / BEAT_PX);
              onScrubBeat(Number(b.toFixed(2)));
            }}
            className="sticky top-0 z-20 flex h-[24px] cursor-pointer items-center border-b border-[#2B2D35] bg-[#1F2127]"
          >
            {Array.from({ length: totalBars }).map((_, barIdx) => (
              <div
                key={barIdx}
                className="flex h-full shrink-0 items-center border-r border-[#333640] pl-1 font-mono text-[10px] font-semibold tabular-nums text-slate-300"
                style={{ width: BEAT_PX * 4 }}
              >
                {barIdx + 1}
              </div>
            ))}
          </div>

          {/* Tempo & TimeSig Automation Track Header Band */}
          <div className="relative h-[32px] border-b border-[#25272F] bg-[#15161B]">
            <div className="px-2 pt-0.5 font-mono text-[9px] text-slate-300">4/4</div>
            <div className="absolute right-0 left-0 top-[20px] h-[1px] bg-sky-500/50" />
          </div>

          {/* Track Lanes */}
          {tracks.map((track) => {
            const clipLeft = clipStartBeat * BEAT_PX;
            const clipWidth = Math.max(88, (clipEndBeat - clipStartBeat) * BEAT_PX);
            return (
              <div
                key={track.id}
                onClick={() => onSelectTrack(track.id)}
                className={`relative h-[68px] border-b border-[#22242B] ${
                  track.muted ? 'opacity-40' : ''
                }`}
              >
                {/* Vertical Measure Dividers */}
                <div className="pointer-events-none absolute inset-0 flex">
                  {Array.from({ length: totalBars }).map((_, barIdx) => (
                    <div
                      key={barIdx}
                      className="h-full shrink-0 border-r border-[#24262E]"
                      style={{ width: BEAT_PX * 4 }}
                    />
                  ))}
                </div>

                {/* Emerald Vocal Clip Region */}
                {notes.length > 0 && (
                  <div
                    className="absolute top-1 bottom-1 overflow-hidden rounded-[2px] border-t-2 border-[#34D399] bg-[#166E3E]/85 shadow-inner"
                    style={{ left: clipLeft, width: clipWidth }}
                  >
                    <svg
                      width={clipWidth}
                      height={56}
                      className="pointer-events-none opacity-85"
                    >
                      <path
                        d={miniContourPath}
                        fill="none"
                        stroke="#6EE7B7"
                        strokeWidth={1.3}
                      />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}

          {/* Vertical White Playhead */}
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-30 w-[1.5px] bg-white"
            style={{ left: playheadBeat * BEAT_PX }}
          >
            <div className="-ml-[4.5px] h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-white" />
          </div>
        </div>
      </div>
    </section>
  );
};

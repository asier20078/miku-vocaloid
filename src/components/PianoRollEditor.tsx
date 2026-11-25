import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Eraser,
  MoveHorizontal,
  MousePointer,
  Pencil,
  RotateCcw,
  Scissors,
  SlidersHorizontal,
  TrendingUp,
  User,
  Volume2,
  VolumeX,
  Waves,
} from 'lucide-react';
import { DspParams } from '../audio/dspMath';
import { syllableToG2P } from '../audio/g2p';
import {
  evaluatePitchAtBeat,
  isBlackKey,
  midiToNoteName,
  PitchControlPoint,
  VocalNote,
} from '../audio/phonetics';
import {
  evaluateParamLaneAtBeat,
  ParamAutomationMap,
  ParamAutomationPoint,
  RobotVoiceMode,
  VOCALOID_PARAM_SPECS,
  VocaloidParamKey,
} from '../audio/vocaloidParams';
import { VocaloidMascotArt } from './VocaloidMascotArt';

export type EditorTool =
  | 'select'
  | 'notes'
  | 'scissors'
  | 'eraser'
  | 'pitch'
  | 'vibrato'
  | 'timing'
  | 'width';

export type GridDivision = 4 | 1 | 0.5 | 0.25 | 0.125;

interface PianoRollEditorProps {
  notes: VocalNote[];
  pitchPoints: PitchControlPoint[];
  paramAutomation: ParamAutomationMap;
  activeParamLane: VocaloidParamKey;
  showParamLane: boolean;
  showMascot: boolean;
  dspParams: DspParams;
  bpm: number;
  playheadBeat: number;
  isPlaying: boolean;
  autoScroll: boolean;
  selectedNoteId: string | null;
  activeTool: EditorTool;
  gridDivision: GridDivision;
  voicebankId: string;
  voicebankName: string;
  robotVoice: RobotVoiceMode;
  activeTrackNumber: number;
  onSelectNote: (id: string | null) => void;
  onChangeNotes: (notes: VocalNote[], pushHistory?: boolean) => void;
  onChangePitchPoints: (points: PitchControlPoint[]) => void;
  onChangeParamAutomation: (
    lane: Exclude<VocaloidParamKey, 'VEL'>,
    points: ParamAutomationPoint[]
  ) => void;
  onChangeActiveParamLane: (lane: VocaloidParamKey) => void;
  onToggleParamLane: () => void;
  onToggleMascot: () => void;
  onChangePbs: (pbs: number) => void;
  onAuditionKey: (midi: number) => void;
  onScrubBeat: (beat: number) => void;
  onChangeTool: (tool: EditorTool) => void;
  onChangeGrid: (grid: GridDivision) => void;
  onAutoHarmonize: () => void;
}

const MIN_MIDI = 40; // E2
const MAX_MIDI = 83; // B5
const TOTAL_ROWS = MAX_MIDI - MIN_MIDI + 1;
const ROW_HEIGHT = 24;
const BEAT_WIDTH = 82;
const KEYBOARD_WIDTH = 56;
const LANE_HEIGHT = 86;

export const PianoRollEditor: React.FC<PianoRollEditorProps> = ({
  notes,
  pitchPoints,
  paramAutomation,
  activeParamLane,
  showParamLane,
  showMascot,
  dspParams,
  bpm,
  playheadBeat,
  isPlaying,
  autoScroll,
  selectedNoteId,
  activeTool,
  gridDivision,
  voicebankId,
  voicebankName,
  robotVoice,
  activeTrackNumber,
  onSelectNote,
  onChangeNotes,
  onChangePitchPoints,
  onChangeParamAutomation,
  onChangeActiveParamLane,
  onToggleParamLane,
  onToggleMascot,
  onChangePbs,
  onAuditionKey,
  onScrubBeat,
  onChangeTool,
  onChangeGrid,
  onAutoHarmonize,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const laneScrollRef = useRef<HTMLDivElement | null>(null);
  const laneCanvasRef = useRef<HTMLDivElement | null>(null);

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [auditionOnEdit, setAuditionOnEdit] = useState<boolean>(true);
  const [showPitchOverlay, setShowPitchOverlay] = useState<boolean>(true);

  const dragStateRef = useRef<{
    kind: 'move' | 'resize' | 'pitch' | 'lane';
    noteId?: string;
    startClientX: number;
    startClientY: number;
    origBeat: number;
    origMidi: number;
    origDuration: number;
    snapshotNotes: VocalNote[];
  } | null>(null);

  const totalBeats = useMemo(() => {
    const maxBeat = notes.reduce((acc, n) => Math.max(acc, n.startBeat + n.durationBeats), 24);
    return Math.max(28, Math.ceil((maxBeat + 4) / 4) * 4);
  }, [notes]);

  const totalBars = Math.ceil(totalBeats / 4);
  const gridWidth = totalBeats * BEAT_WIDTH;
  const gridHeight = TOTAL_ROWS * ROW_HEIGHT;

  // Center initial vertical scroll around C4..D5
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const topTargetMidi = 75; // D#5
    const row = MAX_MIDI - topTargetMidi;
    el.scrollTop = Math.max(0, row * ROW_HEIGHT);
  }, []);

  const activeLaneMeta = useMemo(
    () => VOCALOID_PARAM_SPECS.find((s) => s.key === activeParamLane) ?? VOCALOID_PARAM_SPECS[0],
    [activeParamLane]
  );

  const getLaneBaseDefault = (key: VocaloidParamKey): number => {
    switch (key) {
      case 'VEL': return dspParams.vel ?? 64;
      case 'DYN': return dspParams.dyn ?? 84;
      case 'BRE': return Math.round(((dspParams.breathiness ?? 0.09) / 0.5) * 127);
      case 'BRI': return dspParams.bri ?? 86;
      case 'CLE': return dspParams.cle ?? 68;
      case 'OPE': return dspParams.ope ?? 100;
      case 'GEN': return dspParams.gen ?? 48;
      case 'GWL': return dspParams.gwl ?? 0;
      case 'PIT': return 0;
    }
  };

  const paintLaneAtPointer = (clientX: number, clientY: number) => {
    const canvas = laneCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const y = Math.max(0, Math.min(LANE_HEIGHT, clientY - rect.top));
    const beat = Math.max(0, Number((x / BEAT_WIDTH).toFixed(2)));
    const normY = 1 - y / LANE_HEIGHT;

    if (activeParamLane === 'VEL') {
      const velVal = Math.round(Math.max(0, Math.min(127, normY * 127)));
      let nearest: VocalNote | null = null;
      let bestDist = 0.45;
      for (const n of notes) {
        const dist = Math.abs(n.startBeat - beat);
        if (dist < bestDist) {
          bestDist = dist;
          nearest = n;
        }
      }
      if (nearest) {
        onChangeNotes(
          notes.map((n) => (n.id === nearest!.id ? { ...n, velocity: velVal } : n)),
          false
        );
      }
      return;
    }

    const rawVal =
      activeParamLane === 'PIT'
        ? Math.round(-64 + normY * 127)
        : Math.round(normY * 127);
    const existing = paramAutomation[activeParamLane] ?? [];
    const filtered = existing.filter((p) => Math.abs(p.beat - beat) > 0.08);
    const nextPts = [...filtered, { beat, value: rawVal }].sort((a, b) => a.beat - b.beat);
    onChangeParamAutomation(activeParamLane, nextPts);
  };

  useEffect(() => {
    if (!isPlaying || !autoScroll) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const playX = playheadBeat * BEAT_WIDTH;
    const visibleWidth = el.clientWidth - KEYBOARD_WIDTH;
    if (playX > el.scrollLeft + visibleWidth * 0.78 || playX < el.scrollLeft) {
      el.scrollLeft = Math.max(0, playX - visibleWidth * 0.22);
      if (laneScrollRef.current) {
        laneScrollRef.current.scrollLeft = el.scrollLeft;
      }
    }
  }, [playheadBeat, isPlaying, autoScroll]);

  useEffect(() => {
    const handlePointerMove = (ev: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;

      const snapStep = Math.min(1, gridDivision);

      if (drag.kind === 'move' && drag.noteId) {
        const dx = ev.clientX - drag.startClientX;
        const dy = ev.clientY - drag.startClientY;
        const dBeats = Math.round(dx / BEAT_WIDTH / snapStep) * snapStep;
        const dRows = Math.round(dy / ROW_HEIGHT);
        const nextBeat = Math.max(0, Number((drag.origBeat + dBeats).toFixed(2)));
        const nextMidi = Math.max(MIN_MIDI, Math.min(MAX_MIDI, drag.origMidi - dRows));

        onChangeNotes(
          drag.snapshotNotes.map((n) =>
            n.id === drag.noteId ? { ...n, startBeat: nextBeat, midi: nextMidi } : n
          ),
          false
        );
      } else if (drag.kind === 'resize' && drag.noteId) {
        const dx = ev.clientX - drag.startClientX;
        const dBeats = Math.round(dx / BEAT_WIDTH / snapStep) * snapStep;
        const nextDur = Math.max(Math.max(0.125, snapStep), Number((drag.origDuration + dBeats).toFixed(2)));

        onChangeNotes(
          drag.snapshotNotes.map((n) =>
            n.id === drag.noteId ? { ...n, durationBeats: nextDur } : n
          ),
          false
        );
      } else if (drag.kind === 'pitch') {
        const el = scrollContainerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const xInGrid = ev.clientX - rect.left + el.scrollLeft - KEYBOARD_WIDTH;
        const yInGrid = ev.clientY - rect.top + el.scrollTop - 24;
        const beat = Math.max(0, Number((xInGrid / BEAT_WIDTH).toFixed(2)));
        const pointerMidi = MAX_MIDI - yInGrid / ROW_HEIGHT + 0.5;

        const targetNote = notes.find(
          (n) => beat >= n.startBeat - 0.15 && beat <= n.startBeat + n.durationBeats + 0.15
        );
        if (targetNote) {
          const offset = Math.max(-4, Math.min(4, Number((pointerMidi - targetNote.midi).toFixed(2))));
          const filtered = pitchPoints.filter((p) => Math.abs(p.beat - beat) > 0.08);
          onChangePitchPoints([...filtered, { beat, offsetSemitones: offset }]);
        }
      } else if (drag.kind === 'lane') {
        paintLaneAtPointer(ev.clientX, ev.clientY);
      }
    };

    const handlePointerUp = () => {
      if (!dragStateRef.current) return;
      const wasNoteEdit =
        dragStateRef.current.kind === 'move' ||
        dragStateRef.current.kind === 'resize' ||
        (dragStateRef.current.kind === 'lane' && activeParamLane === 'VEL');
      dragStateRef.current = null;
      if (wasNoteEdit) {
        onChangeNotes(notes, true);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  });

  // Compute orange pitch curve + red inflection segments (matching VOCALOID6/7 screenshot)
  const { normalPitchD, steepPitchD } = useMemo(() => {
    if (notes.length === 0 || !showPitchOverlay) {
      return { normalPitchD: '', steepPitchD: '' };
    }
    const maxBeat = notes.reduce((acc, n) => Math.max(acc, n.startBeat + n.durationBeats), 0) + 0.5;
    const step = 0.06;
    let normalD = '';
    let steepD = '';
    let prevX: number | null = null;
    let prevY: number | null = null;
    let prevMidi: number | null = null;

    for (let b = 0; b <= maxBeat; b += step) {
      const midiVal = evaluatePitchAtBeat(
        notes,
        pitchPoints,
        b,
        bpm,
        paramAutomation.PIT,
        dspParams.pbs ?? 4,
        robotVoice
      );
      if (midiVal === null) {
        prevX = null;
        prevY = null;
        prevMidi = null;
        continue;
      }
      const x = b * BEAT_WIDTH;
      const y = (MAX_MIDI - midiVal + 0.5) * ROW_HEIGHT;

      if (prevX !== null && prevY !== null && prevMidi !== null) {
        const slope = Math.abs(midiVal - prevMidi) / step;
        if (slope > 2.2) {
          steepD += `M ${prevX.toFixed(1)} ${prevY.toFixed(1)} L ${x.toFixed(1)} ${y.toFixed(1)} `;
        } else {
          normalD += `M ${prevX.toFixed(1)} ${prevY.toFixed(1)} L ${x.toFixed(1)} ${y.toFixed(1)} `;
        }
      }
      prevX = x;
      prevY = y;
      prevMidi = midiVal;
    }
    return { normalPitchD: normalD, steepPitchD: steepD };
  }, [notes, pitchPoints, bpm, paramAutomation.PIT, dspParams.pbs, robotVoice, showPitchOverlay]);

  const laneSvgPaths = useMemo(() => {
    if (activeParamLane === 'VEL') return { lineD: '', areaD: '' };
    const pts = paramAutomation[activeParamLane] ?? [];
    const defaultVal = getLaneBaseDefault(activeParamLane);
    const minV = activeLaneMeta.min;
    const spanV = activeLaneMeta.max - activeLaneMeta.min;
    const step = 0.25;
    let lineD = '';
    let areaD = '';
    const baseY =
      activeParamLane === 'PIT'
        ? LANE_HEIGHT * 0.5
        : LANE_HEIGHT * (1 - (defaultVal - minV) / spanV);

    for (let b = 0; b <= totalBeats; b += step) {
      const v = evaluateParamLaneAtBeat(pts, b, defaultVal);
      const norm = (v - minV) / spanV;
      const x = b * BEAT_WIDTH;
      const y = Math.max(1, Math.min(LANE_HEIGHT - 1, (1 - norm) * LANE_HEIGHT));
      if (b === 0) {
        lineD += `M ${x.toFixed(1)} ${y.toFixed(1)} `;
        areaD += `M ${x.toFixed(1)} ${baseY.toFixed(1)} L ${x.toFixed(1)} ${y.toFixed(1)} `;
      } else {
        lineD += `L ${x.toFixed(1)} ${y.toFixed(1)} `;
        areaD += `L ${x.toFixed(1)} ${y.toFixed(1)} `;
      }
    }
    areaD += `L ${(totalBeats * BEAT_WIDTH).toFixed(1)} ${baseY.toFixed(1)} Z`;
    return { lineD, areaD };
  }, [activeParamLane, activeLaneMeta, paramAutomation, totalBeats, dspParams]);

  const handleGridPointerDown = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (ev.button !== 0) return;

    const rect = ev.currentTarget.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;

    if (activeTool === 'pitch') {
      dragStateRef.current = {
        kind: 'pitch',
        startClientX: ev.clientX,
        startClientY: ev.clientY,
        origBeat: 0,
        origMidi: 60,
        origDuration: 0,
        snapshotNotes: notes,
      };
      return;
    }

    if (activeTool === 'select' || activeTool === 'eraser' || activeTool === 'scissors') {
      onSelectNote(null);
      return;
    }

    // Pencil / Timing / Width / Vibrato click creates a note on grid
    const snap = Math.min(1, gridDivision);
    const rawBeat = x / BEAT_WIDTH;
    const snappedBeat = Math.max(0, Math.floor(rawBeat / snap) * snap);
    const row = Math.floor(y / ROW_HEIGHT);
    const midi = Math.max(MIN_MIDI, Math.min(MAX_MIDI, MAX_MIDI - row));

    const g2p = syllableToG2P('la', 'auto', 'none', false);
    const newNote: VocalNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      midi,
      startBeat: Number(snappedBeat.toFixed(2)),
      durationBeats: Math.max(0.5, snap),
      lyric: g2p.text,
      phonetic: g2p.ipaDisplay,
      vibratoDepth: 0.22,
      vibratoRate: 6.0,
      portamentoMs: 35,
      isStressed: g2p.isStressed,
      punctuation: g2p.punctuation,
      g2pLanguage: g2p.language,
    };

    if (auditionOnEdit) onAuditionKey(midi);
    onSelectNote(newNote.id);
    onChangeNotes([...notes, newNote], true);
  };

  const handleSplitNote = (note: VocalNote, clickClientX: number, targetEl: HTMLDivElement) => {
    const rect = targetEl.getBoundingClientRect();
    const ratio = Math.max(0.25, Math.min(0.75, (clickClientX - rect.left) / Math.max(12, rect.width)));
    const firstDur = Number((note.durationBeats * ratio).toFixed(2));
    const secondDur = Number((note.durationBeats - firstDur).toFixed(2));
    if (firstDur < 0.15 || secondDur < 0.15) return;

    const first: VocalNote = { ...note, durationBeats: firstDur };
    const second: VocalNote = {
      ...note,
      id: `note-split-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      startBeat: Number((note.startBeat + firstDur).toFixed(2)),
      durationBeats: secondDur,
      lyric: '-',
      phonetic: note.phonetic.split(' ').slice(-1)[0] || 'a',
    };
    onChangeNotes(
      notes.flatMap((n) => (n.id === note.id ? [first, second] : [n])),
      true
    );
    onSelectNote(second.id);
  };

  const commitInlineLyric = (noteId: string) => {
    const clean = editingText.trim() || 'la';
    const target = notes.find((n) => n.id === noteId);
    const g2p = syllableToG2P(
      clean,
      target?.g2pLanguage ?? 'auto',
      'none',
      Boolean(target?.isStressed)
    );
    onChangeNotes(
      notes.map((n) =>
        n.id === noteId
          ? {
              ...n,
              lyric: g2p.text,
              phonetic: g2p.ipaDisplay,
              punctuation: g2p.punctuation,
              g2pLanguage: g2p.language,
            }
          : n
      ),
      true
    );
    setEditingNoteId(null);
  };

  const handleEditorAction = (action: string) => {
    if (!action) return;
    if (action === 'quantize') {
      const snap = Math.min(1, gridDivision);
      onChangeNotes(
        notes.map((n) => ({
          ...n,
          startBeat: Number((Math.round(n.startBeat / snap) * snap).toFixed(2)),
          durationBeats: Math.max(snap, Number((Math.round(n.durationBeats / snap) * snap).toFixed(2))),
        })),
        true
      );
    } else if (action === 'clear-pitch') {
      onChangePitchPoints([]);
    } else if (action === 'oct-up') {
      onChangeNotes(
        notes.map((n) => ({ ...n, midi: Math.min(MAX_MIDI, n.midi + 12) })),
        true
      );
    } else if (action === 'oct-down') {
      onChangeNotes(
        notes.map((n) => ({ ...n, midi: Math.max(MIN_MIDI, n.midi - 12) })),
        true
      );
    } else if (action === 'harmonize') {
      onAutoHarmonize();
    }
  };

  const toolButtons: Array<{
    id: EditorTool;
    title: string;
    icon: React.ReactNode;
  }> = [
    { id: 'select', title: 'Puntero / Seleccionar', icon: <MousePointer className="h-3.5 w-3.5" /> },
    { id: 'notes', title: 'Lápiz / Dibujar notas', icon: <Pencil className="h-3.5 w-3.5" /> },
    { id: 'scissors', title: 'Tijeras / Dividir nota', icon: <Scissors className="h-3.5 w-3.5" /> },
    { id: 'eraser', title: 'Borrador / Eliminar nota', icon: <Eraser className="h-3.5 w-3.5" /> },
    { id: 'pitch', title: 'Curva de Pitch (Expresión)', icon: <TrendingUp className="h-3.5 w-3.5" /> },
    { id: 'vibrato', title: 'Vibrato', icon: <Waves className="h-3.5 w-3.5" /> },
    { id: 'timing', title: 'Timing', icon: <SlidersHorizontal className="h-3.5 w-3.5" /> },
    { id: 'width', title: 'Duración de Nota', icon: <MoveHorizontal className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#131418]">
      {/* VOCALOID6/7 Piano Roll Sub-Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#111216] bg-[#282A30] px-2.5 py-1 select-none">
        <div className="flex flex-wrap items-center gap-1">
          {/* Audition toggle (Blue speaker button matching screenshot) */}
          <button
            type="button"
            title="Audición al seleccionar o crear nota"
            onClick={() => setAuditionOnEdit((v) => !v)}
            className={`mr-1 flex h-6 w-8 items-center justify-center rounded-[2px] border border-[#14161B] transition-colors ${
              auditionOnEdit
                ? 'bg-[#0099FF] text-white'
                : 'bg-[#1D1F25] text-slate-400 hover:text-white'
            }`}
          >
            {auditionOnEdit ? (
              <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>

          {/* Editing tools */}
          <div className="flex items-center rounded-[2px] border border-[#16171C] bg-[#1F2127] p-0.5">
            {toolButtons.map((tb) => {
              const active = activeTool === tb.id;
              return (
                <button
                  key={tb.id}
                  type="button"
                  title={tb.title}
                  aria-label={tb.title}
                  onClick={() => onChangeTool(tb.id)}
                  className={`flex h-5 w-6 items-center justify-center rounded-[2px] transition-colors ${
                    active
                      ? 'bg-[#0099FF] text-white'
                      : 'text-slate-300 hover:bg-[#2F323B] hover:text-white'
                  }`}
                >
                  {tb.icon}
                </button>
              );
            })}
          </div>

          {/* Acción dropdown */}
          <select
            aria-label="Acción de edición rápida"
            value=""
            onChange={(e) => {
              handleEditorAction(e.target.value);
              e.target.value = '';
            }}
            className="ml-1 h-6 rounded-[2px] border border-[#14161B] bg-[#1C1E23] px-2 text-[10px] font-medium text-slate-200 focus:border-sky-400 focus:outline-none"
          >
            <option value="">Acción</option>
            <option value="quantize">Cuantizar a GRID</option>
            <option value="harmonize">Añadir Coros 3ª y 5ª</option>
            <option value="clear-pitch">Limpiar Pitch Bend</option>
            <option value="oct-up">Subir +1 Octava</option>
            <option value="oct-down">Bajar -1 Octava</option>
          </select>

          {/* GRID Selector */}
          <div className="ml-1 flex items-center gap-1 rounded-[2px] border border-[#14161B] bg-[#1C1E23] px-1.5 py-0.5">
            <span className="text-[9px] font-bold text-slate-400">GRID</span>
            <select
              aria-label="Rejilla de Piano Roll"
              value={gridDivision}
              onChange={(e) => onChangeGrid(Number(e.target.value) as GridDivision)}
              className="bg-transparent font-mono text-[10px] font-semibold text-slate-100 focus:outline-none"
            >
              <option value={4} className="bg-[#1C1E23]">1/1</option>
              <option value={1} className="bg-[#1C1E23]">1/4</option>
              <option value={0.5} className="bg-[#1C1E23]">1/8</option>
              <option value={0.25} className="bg-[#1C1E23]">1/16</option>
              <option value={0.125} className="bg-[#1C1E23]">1/32</option>
            </select>
          </div>
        </div>

        {/* Right Piano Roll View Toggles (Pitch Curve, Param Lane, Character Mascot) */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Mostrar/ocultar curva de Pitch naranja/roja"
            aria-label="Mostrar curva de Pitch"
            onClick={() => setShowPitchOverlay((v) => !v)}
            className={`flex h-6 w-7 items-center justify-center rounded-[2px] border border-[#14161B] transition-colors ${
              showPitchOverlay
                ? 'bg-[#0099FF] text-white'
                : 'bg-[#1C1E23] text-slate-400 hover:text-white'
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          <button
            type="button"
            title="Mostrar/ocultar pista de Parámetros Crypton (DYN, PIT, VEL, BRE, BRI...)"
            aria-label="Mostrar pista de Parámetros"
            onClick={onToggleParamLane}
            className={`flex h-6 w-7 items-center justify-center rounded-[2px] border border-[#14161B] transition-colors ${
              showParamLane
                ? 'bg-[#0099FF] text-white'
                : 'bg-[#1C1E23] text-slate-400 hover:text-white'
            }`}
          >
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          <button
            type="button"
            title="Mostrar/ocultar ilustración de personaje en Piano Roll"
            aria-label="Mostrar personaje vocal"
            onClick={onToggleMascot}
            className={`flex h-6 w-7 items-center justify-center rounded-[2px] border border-[#14161B] transition-colors ${
              showMascot
                ? 'bg-[#0099FF] text-white'
                : 'bg-[#1C1E23] text-slate-400 hover:text-white'
            }`}
          >
            <User className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Main Scrollable Dark Piano Roll */}
      <div
        ref={scrollContainerRef}
        data-testid="piano-roll-viewport"
        onScroll={(e) => {
          if (laneScrollRef.current) {
            laneScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
          }
        }}
        className="daw-scroll relative min-h-[260px] flex-1 overflow-auto bg-[#131418] select-none"
      >
        <div
          className="relative"
          style={{ width: KEYBOARD_WIDTH + gridWidth, height: 24 + gridHeight }}
        >
          {/* Sticky Top-Left Emerald "AI 1" Badge */}
          <div
            title={`Pista ${activeTrackNumber}: ${voicebankName}`}
            className="sticky top-0 left-0 z-30 flex h-[24px] w-[56px] items-center justify-center gap-1 border-r border-b border-[#0E1014] bg-[#229A5B] font-mono text-[10px] font-bold text-white"
          >
            <span className="rounded-[1px] bg-black/25 px-1 text-[8px]">AI</span>
            <span>{activeTrackNumber}</span>
          </div>

          {/* Sticky Top Measure Ruler */}
          <div
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const beat = Math.max(0, (e.clientX - rect.left) / BEAT_WIDTH);
              onScrubBeat(Number(beat.toFixed(2)));
            }}
            className="sticky top-0 z-20 -mt-[24px] ml-[56px] flex h-[24px] cursor-pointer items-center border-b border-[#2C2F38] bg-[#22242A]"
            style={{ width: gridWidth }}
          >
            {Array.from({ length: totalBars }).map((_, barIdx) => (
              <div
                key={barIdx}
                className="relative flex h-full shrink-0 items-center border-r border-[#3A3E4A] pl-1.5 font-mono text-[11px] font-semibold tabular-nums text-slate-300"
                style={{ width: BEAT_WIDTH * 4 }}
              >
                {barIdx + 1}
              </div>
            ))}

            {/* Playhead triangle in ruler */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-30 w-[1.5px] bg-white"
              style={{ left: playheadBeat * BEAT_WIDTH }}
            >
              <div className="-ml-[4.5px] h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-white" />
            </div>
          </div>

          {/* Sticky Left Piano Keyboard (White #E8EBEF & Black #181A20) */}
          <div
            className="sticky left-0 z-20 flex flex-col border-r border-[#2C2F38] bg-[#E8EBEF]"
            style={{ width: KEYBOARD_WIDTH, height: gridHeight }}
          >
            {Array.from({ length: TOTAL_ROWS }).map((_, r) => {
              const midi = MAX_MIDI - r;
              const black = isBlackKey(midi);
              const isC = midi % 12 === 0;
              return (
                <button
                  key={midi}
                  type="button"
                  onClick={() => onAuditionKey(midi)}
                  aria-label={`Tecla ${midiToNoteName(midi)}`}
                  style={{ height: ROW_HEIGHT }}
                  className={`relative flex w-full items-center justify-end border-b pr-1.5 font-mono text-[10px] font-semibold transition-colors ${
                    black
                      ? 'border-[#121318] bg-[#181A20] text-slate-400 hover:bg-[#2B2E38]'
                      : 'border-[#CBD5E1] bg-[#E8EBEF] text-slate-700 hover:bg-sky-100'
                  }`}
                >
                  {isC && <span className="font-bold text-slate-800">{midiToNoteName(midi)}</span>}
                </button>
              );
            })}
          </div>

          {/* Interactive Dark Note Grid Canvas */}
          <div
            data-testid="piano-roll-grid"
            onPointerDown={handleGridPointerDown}
            className={`relative ml-[56px] ${
              activeTool === 'pitch'
                ? 'cursor-crosshair'
                : activeTool === 'eraser'
                  ? 'cursor-not-allowed'
                  : 'cursor-cell'
            }`}
            style={{ width: gridWidth, height: gridHeight, marginTop: -gridHeight }}
          >
            {/* Horizontal Dark Pitch Rows */}
            {Array.from({ length: TOTAL_ROWS }).map((_, r) => {
              const midi = MAX_MIDI - r;
              const black = isBlackKey(midi);
              const isC = midi % 12 === 0;
              return (
                <div
                  key={midi}
                  style={{ height: ROW_HEIGHT }}
                  className={`w-full border-b ${
                    isC ? 'border-[#2E313B]' : 'border-[#1D1F26]'
                  } ${black ? 'bg-[#0D0E12]' : 'bg-[#14161B]'}`}
                />
              );
            })}

            {/* Vertical Beat & Bar Lines */}
            <div className="pointer-events-none absolute inset-0 flex">
              {Array.from({ length: totalBeats }).map((_, beatIdx) => {
                const isBarStart = beatIdx % 4 === 0;
                return (
                  <div
                    key={beatIdx}
                    style={{ width: BEAT_WIDTH }}
                    className={`h-full shrink-0 border-r ${
                      isBarStart ? 'border-[#333642]' : 'border-[#1F2129]'
                    }`}
                  />
                );
              })}
            </div>

            {/* Translucent Emerald Vocal Notes ("lyric [phonetic]") */}
            {notes.map((note) => {
              const row = MAX_MIDI - note.midi;
              const top = row * ROW_HEIGHT + 1;
              const left = note.startBeat * BEAT_WIDTH;
              const width = Math.max(28, note.durationBeats * BEAT_WIDTH);
              const isSelected = note.id === selectedNoteId;
              const isEditing = note.id === editingNoteId;

              return (
                <div
                  key={note.id}
                  style={{ left, top, width, height: ROW_HEIGHT - 2 }}
                  className="absolute z-10"
                >
                  <div
                    onPointerDown={(e) => {
                      if (activeTool === 'pitch') return;
                      e.stopPropagation();

                      if (activeTool === 'eraser') {
                        onChangeNotes(
                          notes.filter((n) => n.id !== note.id),
                          true
                        );
                        if (selectedNoteId === note.id) onSelectNote(null);
                        return;
                      }

                      if (activeTool === 'scissors') {
                        handleSplitNote(note, e.clientX, e.currentTarget);
                        return;
                      }

                      onSelectNote(note.id);
                      if (auditionOnEdit) onAuditionKey(note.midi);
                      dragStateRef.current = {
                        kind: activeTool === 'width' ? 'resize' : 'move',
                        noteId: note.id,
                        startClientX: e.clientX,
                        startClientY: e.clientY,
                        origBeat: note.startBeat,
                        origMidi: note.midi,
                        origDuration: note.durationBeats,
                        snapshotNotes: notes,
                      };
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingNoteId(note.id);
                      setEditingText(note.lyric);
                    }}
                    className={`relative flex h-full w-full cursor-grab items-center rounded-[2px] px-1.5 text-[11px] font-medium text-slate-100 active:cursor-grabbing ${
                      isSelected
                        ? 'border border-[#6EE7B7] bg-[#229A5B]/85 ring-1 ring-sky-400'
                        : 'border border-[#34D399]/75 bg-[#1D7A46]/70 hover:bg-[#229A5B]/80'
                    }`}
                  >
                    {isEditing ? (
                      <input
                        autoFocus
                        type="text"
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onBlur={() => commitInlineLyric(note.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitInlineLyric(note.id);
                          if (e.key === 'Escape') setEditingNoteId(null);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="w-full rounded bg-[#0F1115] px-1 text-[11px] font-semibold text-white outline-none"
                      />
                    ) : (
                      <span className="truncate whitespace-nowrap text-[11px] drop-shadow-sm">
                        {note.lyric}{' '}
                        <span className="font-mono text-[9.5px] text-emerald-100/90">
                          [{note.phonetic}]
                        </span>
                      </span>
                    )}

                    {/* Right-edge duration resize handle */}
                    <div
                      onPointerDown={(e) => {
                        if (activeTool === 'pitch' || activeTool === 'eraser' || activeTool === 'scissors') return;
                        e.stopPropagation();
                        onSelectNote(note.id);
                        dragStateRef.current = {
                          kind: 'resize',
                          noteId: note.id,
                          startClientX: e.clientX,
                          startClientY: e.clientY,
                          origBeat: note.startBeat,
                          origMidi: note.midi,
                          origDuration: note.durationBeats,
                          snapshotNotes: notes,
                        };
                      }}
                      title="Arrastrar para cambiar duración"
                      className="absolute top-0 right-0 bottom-0 w-2 cursor-ew-resize hover:bg-emerald-300/35"
                    />
                  </div>
                </div>
              );
            })}

            {/* Expressive Orange & Red Pitch Curve Overlay */}
            <svg
              width={gridWidth}
              height={gridHeight}
              className="pointer-events-none absolute inset-0 z-10 overflow-visible"
            >
              {normalPitchD && (
                <path
                  d={normalPitchD}
                  fill="none"
                  stroke="#E07B24"
                  strokeWidth={1.7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {steepPitchD && (
                <path
                  d={steepPitchD}
                  fill="none"
                  stroke="#DC2626"
                  strokeWidth={2.0}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </svg>

            {/* Vertical White Playhead Line */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-20 w-[1.5px] bg-white"
              style={{ left: playheadBeat * BEAT_WIDTH }}
            />
          </div>
        </div>

        {/* Toggleable Right-side Character Mascot Overlay matching screenshot */}
        {showMascot && (
          <div className="pointer-events-none sticky right-0 bottom-0 z-10 -mt-[340px] ml-auto h-[340px] w-[220px]">
            <VocaloidMascotArt
              voicebankId={voicebankId}
              voicebankName={voicebankName}
              variant="overlay"
            />
          </div>
        )}
      </div>

      {/* Crypton 9-Parameter Automation Lane */}
      {showParamLane && (
        <div
          aria-label="Pista de Parámetros de Expresión Vocaloid"
          className="flex shrink-0 flex-col border-t border-[#111216] bg-[#181A20]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#111216] bg-[#24262D] px-2.5 py-1 text-[11px]">
            <div
              className="flex flex-wrap items-center gap-1"
              role="tablist"
              aria-label="Parámetros Crypton Vocaloid"
            >
              {VOCALOID_PARAM_SPECS.map((spec) => {
                const active = activeParamLane === spec.key;
                return (
                  <button
                    key={spec.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    title={`${spec.name}: ${spec.description}`}
                    onClick={() => onChangeActiveParamLane(spec.key)}
                    className={`rounded-[2px] px-2 py-0.5 font-mono text-[10px] font-bold transition-colors ${
                      active
                        ? 'bg-[#0099FF] text-white'
                        : 'bg-[#191B20] text-slate-300 hover:bg-[#2F323B] hover:text-white'
                    }`}
                  >
                    {spec.shortLabel}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-300">
              <span className="hidden md:inline text-slate-400">
                {activeLaneMeta.name} — {activeLaneMeta.description}
              </span>

              {activeParamLane === 'PIT' && (
                <label className="flex items-center gap-1 font-mono text-sky-300">
                  <span>PBS</span>
                  <select
                    aria-label="Pitch Bend Sensitivity"
                    value={dspParams.pbs ?? 4}
                    onChange={(e) => onChangePbs(Number(e.target.value))}
                    className="rounded-[2px] border border-[#14161B] bg-[#14151A] px-1.5 py-0.5 text-[10px] text-sky-300 focus:outline-none"
                  >
                    <option value={2}>±2 st</option>
                    <option value={4}>±4 st</option>
                    <option value={12}>±12 st</option>
                    <option value={24}>±24 st</option>
                  </select>
                </label>
              )}

              <button
                type="button"
                onClick={() => {
                  if (activeParamLane === 'VEL') {
                    onChangeNotes(
                      notes.map((n) => ({ ...n, velocity: 64 })),
                      true
                    );
                  } else {
                    onChangeParamAutomation(activeParamLane, []);
                  }
                }}
                className="inline-flex items-center gap-1 rounded-[2px] border border-[#14161B] bg-[#191B20] px-2 py-0.5 text-[10px] text-slate-300 hover:text-white"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                <span>Limpiar {activeParamLane}</span>
              </button>
            </div>
          </div>

          <div className="flex" style={{ height: LANE_HEIGHT }}>
            <div
              className="flex shrink-0 flex-col justify-between border-r border-[#2C2F38] bg-[#1E2026] px-1.5 py-1 text-right font-mono text-[9px] font-semibold text-slate-400 select-none"
              style={{ width: KEYBOARD_WIDTH }}
            >
              <span>{activeParamLane === 'PIT' ? `+${dspParams.pbs ?? 4}st` : '127'}</span>
              <span className="text-sky-400">
                {activeParamLane === 'PIT' ? '0' : getLaneBaseDefault(activeParamLane)}
              </span>
              <span>{activeParamLane === 'PIT' ? `-${dspParams.pbs ?? 4}st` : '0'}</span>
            </div>

            <div ref={laneScrollRef} className="relative flex-1 overflow-hidden bg-[#121318]">
              <div
                ref={laneCanvasRef}
                data-testid="vocaloid-param-lane"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  dragStateRef.current = {
                    kind: 'lane',
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                    origBeat: 0,
                    origMidi: 60,
                    origDuration: 0,
                    snapshotNotes: notes,
                  };
                  paintLaneAtPointer(e.clientX, e.clientY);
                }}
                className="relative h-full cursor-crosshair select-none"
                style={{ width: gridWidth }}
              >
                <div className="pointer-events-none absolute inset-0 flex">
                  {Array.from({ length: totalBeats }).map((_, beatIdx) => (
                    <div
                      key={beatIdx}
                      style={{ width: BEAT_WIDTH }}
                      className={`h-full shrink-0 border-r ${
                        beatIdx % 4 === 0 ? 'border-[#333642]' : 'border-[#1E2028]'
                      }`}
                    />
                  ))}
                </div>

                <div
                  className="pointer-events-none absolute right-0 left-0 border-t border-dashed border-[#343844]"
                  style={{
                    top:
                      activeParamLane === 'PIT'
                        ? LANE_HEIGHT * 0.5
                        : LANE_HEIGHT * (1 - getLaneBaseDefault(activeParamLane) / 127),
                  }}
                />

                {activeParamLane === 'VEL' ? (
                  notes.map((n) => {
                    const vel = n.velocity ?? dspParams.vel ?? 64;
                    const stemH = Math.max(4, (vel / 127) * (LANE_HEIGHT - 6));
                    const x = n.startBeat * BEAT_WIDTH + 6;
                    return (
                      <div
                        key={`vel-${n.id}`}
                        className="pointer-events-none absolute bottom-0 flex flex-col items-center"
                        style={{ left: x - 5 }}
                      >
                        <div className="h-2 w-2 rounded-[1px] border border-emerald-200 bg-emerald-400" />
                        <div className="w-1 bg-emerald-500/80" style={{ height: stemH }} />
                      </div>
                    );
                  })
                ) : (
                  <svg
                    width={gridWidth}
                    height={LANE_HEIGHT}
                    className="pointer-events-none absolute inset-0"
                  >
                    <path
                      d={laneSvgPaths.areaD}
                      fill={activeLaneMeta.color}
                      fillOpacity={0.18}
                    />
                    <path
                      d={laneSvgPaths.lineD}
                      fill="none"
                      stroke={activeLaneMeta.color}
                      strokeWidth={1.8}
                      strokeLinejoin="round"
                    />
                  </svg>
                )}

                <div
                  className="pointer-events-none absolute top-0 bottom-0 z-10 w-[1.5px] bg-white"
                  style={{ left: playheadBeat * BEAT_WIDTH }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

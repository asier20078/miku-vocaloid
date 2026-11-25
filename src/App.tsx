import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRightToLine,
  Code2,
  Cpu,
  Download,
  Eraser,
  FileText,
  HelpCircle,
  Mic,
  MousePointer,
  PanelLeft,
  Pencil,
  Play,
  Redo2,
  Repeat,
  Scissors,
  Sliders,
  Square,
  Timer,
  Undo2,
  X,
} from 'lucide-react';
import {
  clampDspParams,
  DEFAULT_DSP_PARAMS,
  DSP_PRESETS,
  DspParams,
} from './audio/dspMath';
import { convertLyricsToG2P, G2PLanguage } from './audio/g2p';
import {
  buildNotesFromLyrics,
  BUILTIN_VOICEBANKS,
  createDemoSongNotes,
  DEMO_SONG_LYRICS,
  PitchControlPoint,
  VocalNote,
  VoicebankProfile,
} from './audio/phonetics';
import {
  breToAmount,
  DEFAULT_STYLE_SETTINGS,
  DEFAULT_VOCAL_TRACKS,
  genToFormantShift,
  ParamAutomationMap,
  ParamAutomationPoint,
  STYLE_PRESETS,
  StylePresetId,
  VocaloidParamKey,
  VocaloidStyleSettings,
  VocalTrackChannel,
} from './audio/vocaloidParams';
import { SingingSequencer } from './audio/singingSynth';
import { VoiceSlot, WebAudioDspEngine } from './audio/webAudioEngine';
import { ArrangementTimeline } from './components/ArrangementTimeline';
import { BuildGuideView } from './components/BuildGuideView';
import { CppProjectExplorer } from './components/CppProjectExplorer';
import { DspRack } from './components/DspRack';
import { LyricsEditorModal } from './components/LyricsEditorModal';
import { NoteInspectorBar } from './components/NoteInspectorBar';
import { EditorTool, GridDivision, PianoRollEditor } from './components/PianoRollEditor';
import { StudioView } from './components/TopBar';
import { VocaloidSidebar } from './components/VocaloidSidebar';
import { VoicebankDrawer } from './components/VoicebankDrawer';
import { WaveformScope } from './components/WaveformScope';

export default function App() {
  const engine = useMemo(() => new WebAudioDspEngine(), []);
  const sequencer = useMemo(() => new SingingSequencer(), []);

  const [activeView, setActiveView] = useState<StudioView>('editor');
  const [songTitle, setSongTitle] = useState<string>('Nueva Canción Vocal');
  const [bpm, setBpm] = useState<number>(118);

  const [notes, setNotes] = useState<VocalNote[]>(() => createDemoSongNotes());
  const [undoStack, setUndoStack] = useState<VocalNote[][]>([]);
  const [redoStack, setRedoStack] = useState<VocalNote[][]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  const [pitchPoints, setPitchPoints] = useState<PitchControlPoint[]>([]);
  const [paramAutomation, setParamAutomation] = useState<ParamAutomationMap>({});
  const [activeParamLane, setActiveParamLane] = useState<VocaloidParamKey>('DYN');
  const [showParamLane, setShowParamLane] = useState<boolean>(true);
  const [showSidebar, setShowSidebar] = useState<boolean>(true);
  const [showMascot, setShowMascot] = useState<boolean>(true);
  const [showQuickHelp, setShowQuickHelp] = useState<boolean>(false);

  const [lyricsSource, setLyricsSource] = useState<string>(DEMO_SONG_LYRICS);
  const [g2pLanguage, setG2pLanguage] = useState<G2PLanguage>('auto');

  const [activeTool, setActiveTool] = useState<EditorTool>('notes');
  const [gridDivision, setGridDivision] = useState<GridDivision>(0.5);
  const [playheadBeat, setPlayheadBeat] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [loopEnabled, setLoopEnabled] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [metronomeEnabled, setMetronomeEnabled] = useState<boolean>(false);

  const [showLyricsModal, setShowLyricsModal] = useState<boolean>(false);
  const [showVoicebankPanel, setShowVoicebankPanel] = useState<boolean>(false);
  const [showDspPanel, setShowDspPanel] = useState<boolean>(false);

  const [activeVoicebank, setActiveVoicebank] = useState<VoicebankProfile>(BUILTIN_VOICEBANKS[0]);
  const [customSlots, setCustomSlots] = useState<VoiceSlot[]>([]);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isExportingWav, setIsExportingWav] = useState<boolean>(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const [dspParams, setDspParams] = useState<DspParams>(DEFAULT_DSP_PARAMS);
  const [activePresetId, setActivePresetId] = useState<string | null>('vocaloid-pop');
  const [styleSettings, setStyleSettings] = useState<VocaloidStyleSettings>(DEFAULT_STYLE_SETTINGS);
  const [tracks, setTracks] = useState<VocalTrackChannel[]>(DEFAULT_VOCAL_TRACKS);
  const [selectedTrackId, setSelectedTrackId] = useState<string>(DEFAULT_VOCAL_TRACKS[0].id);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);

  const allVoicebanks = useMemo(() => {
    const customProfiles: VoicebankProfile[] = customSlots.map((slot) => ({
      id: `custom-${slot.id}`,
      name: slot.name,
      subtitle: 'Voz real del usuario',
      baseFormantShift: 1.0,
      breathiness: 0.08,
      brightness: 1.05,
      vibratoDepth: 0.22,
      vibratoRate: 5.4,
      customSlotId: slot.id,
    }));
    return [...BUILTIN_VOICEBANKS, ...customProfiles];
  }, [customSlots]);

  const activeCustomSlot = useMemo(() => {
    if (!activeVoicebank.customSlotId) return null;
    return customSlots.find((s) => s.id === activeVoicebank.customSlotId) ?? null;
  }, [activeVoicebank, customSlots]);

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedNoteId) ?? null,
    [notes, selectedNoteId]
  );

  // Live level meter signal driven by active note + expression during playback
  const meterLevel = useMemo(() => {
    if (!isPlaying) return 0.72; // static idle green indicator bar like VOCALOID screenshot
    const active = notes.some(
      (n) => playheadBeat >= n.startBeat && playheadBeat <= n.startBeat + n.durationBeats
    );
    const exprNorm = styleSettings.voiceColorEnabled ? styleSettings.expression / 100 : 0.6;
    if (!active) return 0.14;
    const pulse = 0.5 + 0.5 * Math.sin(playheadBeat * Math.PI * 4);
    return Math.min(0.98, 0.45 + exprNorm * 0.35 + pulse * 0.18);
  }, [isPlaying, playheadBeat, notes, styleSettings.expression, styleSettings.voiceColorEnabled]);

  useEffect(() => {
    engine.applyParams(dspParams);
  }, [engine, dspParams]);

  useEffect(() => {
    return () => {
      sequencer.stop();
    };
  }, [sequencer]);

  const updateNotes = (nextNotes: VocalNote[], pushHistory = true) => {
    if (pushHistory) {
      setUndoStack((prev) => [...prev.slice(-29), notes]);
      setRedoStack([]);
    }
    setNotes(nextNotes);
  };

  const handlePlay = () => {
    if (isPlaying) {
      sequencer.stop();
      setIsPlaying(false);
      return;
    }
    setIsPlaying(true);
    sequencer.playSong(
      engine,
      notes,
      pitchPoints,
      activeVoicebank,
      dspParams,
      bpm,
      playheadBeat,
      loopEnabled,
      metronomeEnabled,
      activeCustomSlot,
      {
        onBeatUpdate: (beat) => setPlayheadBeat(beat),
        onEnded: () => setIsPlaying(false),
      },
      paramAutomation,
      styleSettings,
      tracks
    );
  };

  const handleStop = () => {
    sequencer.stop();
    setIsPlaying(false);
    setPlayheadBeat(0);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((r) => [...r, notes]);
    setNotes(prev);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u, notes]);
    setNotes(next);
  };

  const handleSelectVoicebank = (vb: VoicebankProfile) => {
    setActiveVoicebank(vb);
    setTracks((prev) =>
      prev.map((t, idx) => (idx === 0 ? { ...t, voiceLabel: vb.name } : t))
    );
    if (vb.defaultGen !== undefined) {
      setDspParams((prev) =>
        clampDspParams({
          ...prev,
          gen: vb.defaultGen ?? prev.gen,
          genderFormantShift: genToFormantShift(vb.defaultGen ?? prev.gen),
          bri: vb.defaultBri ?? prev.bri,
          cle: vb.defaultCle ?? prev.cle,
          ope: vb.defaultOpe ?? prev.ope,
          breathiness: vb.defaultBre !== undefined ? breToAmount(vb.defaultBre) : prev.breathiness,
          gwl: vb.defaultGwl ?? prev.gwl,
          vibratoRate: vb.vibratoRate,
          vibratoDepth: vb.vibratoDepth,
        })
      );
    }
    setStatusNotice(`Voz activa: ${vb.name}`);
  };

  const handleUpdateTrack = (trackId: string, patch: Partial<VocalTrackChannel>) => {
    setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, ...patch } : t)));
  };

  const handleAddHarmonyTrack = () => {
    const hasThird = tracks.some((t) => t.role === 'third');
    const hasFifth = tracks.some((t) => t.role === 'fifth');
    const hasBass = tracks.some((t) => t.role === 'bass');

    let newTrack: VocalTrackChannel;
    if (!hasThird) {
      newTrack = {
        id: `track-third-${Date.now()}`,
        name: 'Coro 3ª (+4st)',
        voiceLabel: `${activeVoicebank.name} · 3ª`,
        role: 'third',
        muted: false,
        solo: false,
        effectEnabled: true,
        armed: false,
        volumeDb: -3.5,
        pan: -0.45,
        color: '#0D9488',
      };
    } else if (!hasFifth) {
      newTrack = {
        id: `track-fifth-${Date.now()}`,
        name: 'Coro 5ª (+7st)',
        voiceLabel: `${activeVoicebank.name} · 5ª`,
        role: 'fifth',
        muted: false,
        solo: false,
        effectEnabled: true,
        armed: false,
        volumeDb: -4.0,
        pan: 0.45,
        color: '#0284C7',
      };
    } else if (!hasBass) {
      newTrack = {
        id: `track-bass-${Date.now()}`,
        name: 'Bajo Rítmico (-12st)',
        voiceLabel: 'Kaito Baritone · Sub',
        role: 'bass',
        muted: false,
        solo: false,
        effectEnabled: true,
        armed: false,
        volumeDb: -3.0,
        pan: 0.0,
        color: '#4F46E5',
      };
    } else {
      newTrack = {
        id: `track-extra-${Date.now()}`,
        name: `Coro Extra ${tracks.length + 1}`,
        voiceLabel: `${activeVoicebank.name} · Doble`,
        role: 'third',
        muted: false,
        solo: false,
        effectEnabled: true,
        armed: false,
        volumeDb: -5.0,
        pan: tracks.length % 2 === 0 ? -0.35 : 0.35,
        color: '#10B981',
      };
    }

    setTracks((prev) => [...prev, newTrack]);
    setSelectedTrackId(newTrack.id);
    setStatusNotice(`Pista añadida al arreglo: ${newTrack.name}`);
  };

  const handleAutoHarmonize = () => {
    const additions: VocalTrackChannel[] = [];
    if (!tracks.some((t) => t.role === 'third')) {
      additions.push({
        id: `track-third-${Date.now()}`,
        name: 'Coro 3ª (+4st)',
        voiceLabel: `${activeVoicebank.name} · 3ª`,
        role: 'third',
        muted: false,
        solo: false,
        effectEnabled: true,
        armed: false,
        volumeDb: -3.5,
        pan: -0.45,
        color: '#0D9488',
      });
    }
    if (!tracks.some((t) => t.role === 'fifth')) {
      additions.push({
        id: `track-fifth-${Date.now() + 1}`,
        name: 'Coro 5ª (+7st)',
        voiceLabel: `${activeVoicebank.name} · 5ª`,
        role: 'fifth',
        muted: false,
        solo: false,
        effectEnabled: true,
        armed: false,
        volumeDb: -4.0,
        pan: 0.45,
        color: '#0284C7',
      });
    }
    if (additions.length > 0) {
      setTracks((prev) => [...prev, ...additions]);
      setStatusNotice('Pistas de Coro 3ª y 5ª añadidas automáticamente.');
    }
  };

  const handleApplyLyricsToExisting = (text: string, lang: G2PLanguage = g2pLanguage) => {
    setLyricsSource(text);
    setG2pLanguage(lang);
    const tokens = convertLyricsToG2P(text, lang);
    if (tokens.length === 0) return;

    const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat);
    const updated = sorted.map((note, idx) => {
      const tok = tokens[idx % tokens.length];
      return {
        ...note,
        lyric: tok.text,
        phonetic: tok.ipaDisplay,
        isStressed: tok.isStressed,
        punctuation: tok.punctuation,
        g2pLanguage: tok.language,
      };
    });

    if (tokens.length > sorted.length) {
      const last = sorted[sorted.length - 1];
      let cursor = last ? last.startBeat + last.durationBeats + 0.25 : 0.5;
      const baseMidi = last ? last.midi : 62;
      const pattern = [0, 2, 4, 2, -1, 0, 4, 5];

      for (let i = sorted.length; i < tokens.length; i++) {
        const tok = tokens[i];
        const isPhraseEnd = tok.isLineEnd || tok.punctuation !== 'none';
        const dur = isPhraseEnd ? 1.25 : 0.75;
        updated.push({
          id: `note-ext-${Date.now()}-${i}`,
          midi: Math.max(48, Math.min(79, baseMidi + pattern[i % pattern.length])),
          startBeat: Number(cursor.toFixed(2)),
          durationBeats: dur,
          lyric: tok.text,
          phonetic: tok.ipaDisplay,
          vibratoDepth: isPhraseEnd ? 0.3 : 0.16,
          vibratoRate: 6.0,
          portamentoMs: 35,
          isStressed: tok.isStressed,
          punctuation: tok.punctuation,
          g2pLanguage: tok.language,
        });
        cursor += dur + (isPhraseEnd ? 0.45 : 0.08);
      }
    }

    updateNotes(updated, true);
    setStatusNotice(`Letra aplicada con G2P/IPA: ${tokens.length} sílabas sincronizadas.`);
  };

  const handleGenerateSongFromLyrics = (
    text: string,
    baseMidi: number,
    stepBeats: number,
    lang: G2PLanguage = g2pLanguage
  ) => {
    setLyricsSource(text);
    setG2pLanguage(lang);
    const generated = buildNotesFromLyrics(text, baseMidi, stepBeats, lang);
    if (generated.length === 0) return;
    setPitchPoints([]);
    updateNotes(generated, true);
    setPlayheadBeat(0);
    setStatusNotice(`Canción generada con ${generated.length} sílabas IPA y prosodia.`);
  };

  const handleUploadFiles = async (fileList: FileList) => {
    setUploadError(null);
    const files = Array.from(fileList);
    const added: VoiceSlot[] = [];

    for (const file of files) {
      try {
        const slot = await engine.decodeAudioFile(file);
        added.push(slot);
      } catch {
        setUploadError(`No se pudo decodificar "${file.name}". Usa WAV, MP3 u OGG.`);
      }
    }

    if (added.length > 0) {
      setCustomSlots((prev) => [...added, ...prev]);
      const first = added[0];
      const profile: VoicebankProfile = {
        id: `custom-${first.id}`,
        name: first.name,
        subtitle: 'Voz real subida',
        baseFormantShift: 1.0,
        breathiness: 0.08,
        brightness: 1.05,
        vibratoDepth: 0.22,
        vibratoRate: 5.4,
        customSlotId: first.id,
      };
      handleSelectVoicebank(profile);
    }
  };

  const handleToggleRecord = async () => {
    setUploadError(null);
    if (isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setUploadError('Tu navegador no permite acceso al micrófono en este contexto.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        try {
          const ts = new Date().toLocaleTimeString('es-ES', { hour12: false });
          const slot = await engine.decodeRecordedBlob(blob, `Mi Voz (${ts})`);
          setCustomSlots((prev) => [slot, ...prev]);
          handleSelectVoicebank({
            id: `custom-${slot.id}`,
            name: slot.name,
            subtitle: 'Voz real grabada',
            baseFormantShift: 1.0,
            breathiness: 0.08,
            brightness: 1.05,
            vibratoDepth: 0.22,
            vibratoRate: 5.4,
            customSlotId: slot.id,
          });
        } catch {
          setUploadError('No se pudo decodificar la grabación.');
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch {
      setUploadError('Permiso de micrófono denegado o no disponible.');
    }
  };

  const handleExportSongWav = async () => {
    if (notes.length === 0) return;
    try {
      setIsExportingWav(true);
      const blob = await sequencer.renderSongWav(
        notes,
        pitchPoints,
        activeVoicebank,
        dspParams,
        bpm,
        activeCustomSlot,
        paramAutomation,
        styleSettings,
        tracks
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const slug = songTitle.trim().replace(/[^a-zA-Z0-9_-]+/g, '_') || 'voxdsp_song';
      a.href = url;
      a.download = `${slug}.wav`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatusNotice(`Canción exportada a WAV: ${slug}.wav`);
    } catch {
      setUploadError('No se pudo renderizar el WAV de la canción.');
    } finally {
      setIsExportingWav(false);
    }
  };

  // LCD beat formatting ("2: 1: 1")
  const barNum = Math.floor(playheadBeat / 4) + 1;
  const beatInBar = Math.floor(playheadBeat % 4) + 1;
  const subTick = Math.floor((playheadBeat % 1) * 4) + 1;
  const activeTrackIdx = Math.max(0, tracks.findIndex((t) => t.id === selectedTrackId));

  return (
    <div className="flex min-h-screen flex-col bg-[#1E1F24] text-slate-100 lg:h-screen lg:overflow-hidden">
      {/* GLOBAL VOCALOID6/7 DAW TOP TOOLBAR */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-1.5 border-b border-[#111216] bg-[#2B2D33] px-2 py-1 select-none xl:flex-nowrap">
        {/* Left: Sidebar Toggle, ?, Cursor Tools, GRID, Loop/Scroll/Metro */}
        <div className="flex items-center gap-1">
          {activeView === 'editor' && (
            <button
              type="button"
              title="Mostrar/ocultar inspector AI Track y Voice Color"
              aria-label="Alternar barra lateral"
              onClick={() => setShowSidebar((v) => !v)}
              className={`flex h-6 w-7 items-center justify-center rounded-[2px] border border-[#14161B] transition-colors ${
                showSidebar
                  ? 'bg-[#0099FF] text-white'
                  : 'bg-[#1D1F25] text-slate-300 hover:text-white'
              }`}
            >
              <PanelLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            title="Atajos y guía rápida VOCALOID"
            aria-label="Ayuda rápida"
            onClick={() => setShowQuickHelp((v) => !v)}
            className="flex h-6 w-6 items-center justify-center rounded-[2px] border border-[#14161B] bg-[#1F2127] text-slate-300 hover:text-white"
          >
            <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          {activeView === 'editor' && (
            <>
              {/* Global Cursor Tools */}
              <div className="flex items-center rounded-[2px] border border-[#14161B] bg-[#1C1E23] p-0.5">
                {[
                  { id: 'select' as EditorTool, icon: <MousePointer className="h-3 w-3" />, label: 'Puntero' },
                  { id: 'notes' as EditorTool, icon: <Pencil className="h-3 w-3" />, label: 'Lápiz' },
                  { id: 'scissors' as EditorTool, icon: <Scissors className="h-3 w-3" />, label: 'Tijeras' },
                  { id: 'eraser' as EditorTool, icon: <Eraser className="h-3 w-3" />, label: 'Borrador' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    title={t.label}
                    aria-label={t.label}
                    onClick={() => setActiveTool(t.id)}
                    className={`flex h-5 w-6 items-center justify-center rounded-[2px] transition-colors ${
                      activeTool === t.id
                        ? 'bg-[#0099FF] text-white'
                        : 'text-slate-300 hover:bg-[#2F323B] hover:text-white'
                    }`}
                  >
                    {t.icon}
                  </button>
                ))}
              </div>

              {/* Global GRID Selector */}
              <div className="flex items-center gap-1 rounded-[2px] border border-[#14161B] bg-[#1C1E23] px-1.5 py-0.5">
                <span className="text-[9px] font-bold tracking-wider text-slate-400">GRID</span>
                <select
                  aria-label="GRID global"
                  value={gridDivision}
                  onChange={(e) => setGridDivision(Number(e.target.value) as GridDivision)}
                  className="bg-transparent font-mono text-[10px] font-semibold text-slate-100 focus:outline-none"
                >
                  <option value={4} className="bg-[#1C1E23]">1/1</option>
                  <option value={1} className="bg-[#1C1E23]">1/4</option>
                  <option value={0.5} className="bg-[#1C1E23]">1/8</option>
                  <option value={0.25} className="bg-[#1C1E23]">1/16</option>
                  <option value={0.125} className="bg-[#1C1E23]">1/32</option>
                </select>
              </div>

              {/* Loop, Auto-Scroll, Metronome, Undo, Redo */}
              <div className="flex items-center gap-0.5 rounded-[2px] border border-[#14161B] bg-[#1C1E23] p-0.5">
                <button
                  type="button"
                  title="Loop"
                  aria-label="Loop"
                  onClick={() => setLoopEnabled((v) => !v)}
                  className={`flex h-5 w-6 items-center justify-center rounded-[2px] transition-colors ${
                    loopEnabled ? 'bg-[#0099FF] text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Repeat className="h-3 w-3" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  title="Auto-Scroll"
                  aria-label="Auto-Scroll"
                  onClick={() => setAutoScroll((v) => !v)}
                  className={`flex h-5 w-6 items-center justify-center rounded-[2px] transition-colors ${
                    autoScroll ? 'bg-[#0099FF] text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <ArrowRightToLine className="h-3 w-3" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  title="Metrónomo"
                  aria-label="Metrónomo"
                  onClick={() => setMetronomeEnabled((v) => !v)}
                  className={`flex h-5 w-6 items-center justify-center rounded-[2px] transition-colors ${
                    metronomeEnabled ? 'bg-[#0099FF] text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Timer className="h-3 w-3" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={undoStack.length === 0}
                  title="Deshacer"
                  aria-label="Deshacer"
                  onClick={handleUndo}
                  className="flex h-5 w-5 items-center justify-center rounded-[2px] text-slate-300 hover:text-white disabled:opacity-30"
                >
                  <Undo2 className="h-3 w-3" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={redoStack.length === 0}
                  title="Rehacer"
                  aria-label="Rehacer"
                  onClick={handleRedo}
                  className="flex h-5 w-5 items-center justify-center rounded-[2px] text-slate-300 hover:text-white disabled:opacity-30"
                >
                  <Redo2 className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Center: Transport Cluster + Dark Digital LCD Display */}
        {activeView === 'editor' ? (
          <div className="flex items-center gap-1.5">
            <div className="flex items-center rounded-[2px] border border-[#14161B] bg-[#1C1E23] p-0.5">
              <button
                type="button"
                title="Detener (Stop)"
                aria-label="Detener"
                onClick={handleStop}
                className="flex h-5 w-7 items-center justify-center rounded-[2px] text-slate-200 hover:bg-[#2F323B] hover:text-white"
              >
                <Square className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
              </button>
              <button
                type="button"
                title="Reproducir / Pausar (Play)"
                aria-label="Reproducir"
                onClick={handlePlay}
                className={`flex h-5 w-7 items-center justify-center rounded-[2px] transition-colors ${
                  isPlaying
                    ? 'bg-[#0099FF] text-white'
                    : 'text-slate-200 hover:bg-[#2F323B] hover:text-white'
                }`}
              >
                <Play className="h-3 w-3 fill-current" aria-hidden="true" />
              </button>
              <button
                type="button"
                title={isRecording ? 'Detener grabación de voz' : 'Grabar voz con micrófono'}
                aria-label="Grabar voz"
                onClick={handleToggleRecord}
                className={`flex h-5 w-7 items-center justify-center rounded-[2px] transition-colors ${
                  isRecording
                    ? 'bg-rose-600 text-white animate-pulse'
                    : 'text-slate-300 hover:bg-[#2F323B] hover:text-rose-400'
                }`}
              >
                <Mic className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>

            {/* Dark LCD Display matching screenshot */}
            <div className="flex h-6 items-center gap-2.5 rounded-[3px] border border-[#0E1014] bg-[#0B0D11] px-2.5 shadow-inner">
              <span className="font-mono text-[12px] font-bold tracking-wider tabular-nums text-sky-400">
                {barNum}: {beatInBar}: {subTick}
              </span>

              <label className="flex items-center">
                <input
                  id="song-bpm-input"
                  type="number"
                  min={60}
                  max={200}
                  aria-label="Tempo BPM"
                  value={bpm}
                  onChange={(e) =>
                    setBpm(Math.max(60, Math.min(200, Number(e.target.value) || 120)))
                  }
                  className="w-9 bg-transparent text-right font-mono text-[11px] font-bold tabular-nums text-sky-300 focus:outline-none"
                />
              </label>

              <span className="font-mono text-[10px] font-semibold text-sky-400/90">4/4</span>

              <div className="h-1.5 w-8 overflow-hidden rounded-full bg-[#1C2029]">
                <div
                  className="h-full bg-emerald-400 transition-[width] duration-75"
                  style={{ width: `${Math.round(meterLevel * 100)}%` }}
                />
              </div>
            </div>

            <input
              type="text"
              aria-label="Título de la canción"
              value={songTitle}
              onChange={(e) => setSongTitle(e.target.value)}
              className="hidden 2xl:block w-32 rounded-[2px] border border-transparent bg-transparent px-1.5 py-0.5 text-[11px] font-semibold text-slate-300 hover:border-[#3A3E48] focus:border-sky-400 focus:bg-[#14161B] focus:outline-none"
            />
          </div>
        ) : (
          <div className="font-display text-sm font-bold text-slate-100">
            VoxDSP · {activeView === 'cpp' ? 'Motor C++20 / WORLD & PortAudio' : 'Guía de Compilación'}
          </div>
        )}

        {/* Right: Lyrics, DSP FX, View Switchers & Export WAV */}
        <div className="flex items-center gap-1">
          {activeView === 'editor' && (
            <>
              <button
                type="button"
                onClick={() => setShowLyricsModal(true)}
                className="inline-flex items-center gap-1 rounded-[2px] border border-sky-500/50 bg-[#0099FF]/20 px-2 py-0.5 text-[10px] font-semibold text-sky-300 hover:bg-[#0099FF]/35 transition-colors whitespace-nowrap"
              >
                <FileText className="h-3 w-3" aria-hidden="true" />
                <span>Pegar Letra</span>
              </button>

              <button
                type="button"
                onClick={() => setShowDspPanel((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 text-[10px] font-medium transition-colors whitespace-nowrap ${
                  showDspPanel
                    ? 'border-[#0099FF] bg-[#0099FF] text-white'
                    : 'border-[#14161B] bg-[#1F2127] text-slate-200 hover:text-white'
                }`}
              >
                <Sliders className="h-3 w-3" aria-hidden="true" />
                <span>Mezcla DSP</span>
              </button>
            </>
          )}

          {/* View Tabs */}
          <nav
            aria-label="Vistas de estudio"
            className="flex items-center rounded-[2px] border border-[#14161B] bg-[#1C1E23] p-0.5"
          >
            <button
              type="button"
              onClick={() => setActiveView('editor')}
              className={`rounded-[2px] px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                activeView === 'editor'
                  ? 'bg-[#229A5B] text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Editor
            </button>
            <button
              type="button"
              onClick={() => setActiveView('cpp')}
              className={`inline-flex items-center gap-1 rounded-[2px] px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                activeView === 'cpp'
                  ? 'bg-[#0099FF] text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Code2 className="h-3 w-3" aria-hidden="true" />
              <span>Motor C++</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('setup')}
              className={`inline-flex items-center gap-1 rounded-[2px] px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                activeView === 'setup'
                  ? 'bg-[#0099FF] text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Cpu className="h-3 w-3" aria-hidden="true" />
              <span>Compilación</span>
            </button>
          </nav>

          {activeView === 'editor' ? (
            <button
              type="button"
              disabled={isExportingWav}
              onClick={handleExportSongWav}
              className="inline-flex items-center gap-1 rounded-[2px] bg-[#229A5B] px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-[#1D7A46] disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Download className="h-3 w-3" aria-hidden="true" />
              <span>{isExportingWav ? 'Renderizando...' : 'Exportar .wav'}</span>
            </button>
          ) : (
            <a
              href="/api/download-cpp-zip"
              download="voxdsp-cpp-portaudio.zip"
              className="inline-flex items-center gap-1 rounded-[2px] bg-[#0099FF] px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-sky-500 transition-colors whitespace-nowrap"
            >
              <Download className="h-3 w-3" aria-hidden="true" />
              <span>Descargar C++ (.zip)</span>
            </a>
          )}
        </div>
      </header>

      {/* Quick Help Banner */}
      {showQuickHelp && (
        <div className="flex items-center justify-between gap-4 border-b border-[#111216] bg-[#1B2432] px-3 py-1.5 text-[11px] text-sky-100">
          <span>
            <strong>Guía rápida VOCALOID:</strong> Clic en la rejilla con Lápiz para crear notas · Arrastra para mover o redimensionar · Doble clic para cambiar la sílaba (G2P EN/ES automático) · Usa <strong>EXPRESSION / AIR / CHARACTER / ATTACK</strong> y <strong>ROBOT VOICE</strong> a la izquierda, o añade pistas de armonía con <strong>+</strong>.
          </span>
          <button
            type="button"
            onClick={() => setShowQuickHelp(false)}
            className="text-sky-300 hover:text-white"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Status Notice */}
      {statusNotice && (
        <div
          aria-live="polite"
          className="flex items-center justify-between gap-4 border-b border-[#111216] bg-[#172820] px-3 py-1 text-[11px] text-emerald-200"
        >
          <span>{statusNotice}</span>
          <button
            type="button"
            onClick={() => setStatusNotice(null)}
            className="text-emerald-300 hover:text-white"
          >
            Ocultar
          </button>
        </div>
      )}

      {/* MAIN WORKSPACE */}
      {activeView === 'editor' ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* LEFT VOCALOID6/7 AI TRACK & VOICE COLOR SIDEBAR */}
          {showSidebar && (
            <VocaloidSidebar
              tracks={tracks}
              selectedTrackId={selectedTrackId}
              voicebanks={allVoicebanks}
              activeVoicebank={activeVoicebank}
              styleSettings={styleSettings}
              meterLevel={meterLevel}
              onSelectTrack={setSelectedTrackId}
              onUpdateTrack={handleUpdateTrack}
              onSelectVoicebank={handleSelectVoicebank}
              onUpdateStyle={(patch) =>
                setStyleSettings((prev) => ({ ...prev, ...patch }))
              }
              onSelectStylePreset={(presetId: StylePresetId) => {
                const preset = STYLE_PRESETS[presetId];
                setStyleSettings((prev) => ({
                  ...prev,
                  stylePreset: presetId,
                  ...preset.patch,
                }));
              }}
              onOpenVoicebankDrawer={() => setShowVoicebankPanel((v) => !v)}
            />
          )}

          {/* RIGHT CENTER DAW COLUMN: Arrangement + Note Inspector + Dark Piano Roll */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Optional Voicebank Upload / Recording Drawer */}
            {showVoicebankPanel && (
              <div className="border-b border-[#111216] bg-[#1A1C22] p-3">
                <VoicebankDrawer
                  activeVoicebankId={activeVoicebank.id}
                  customSlots={customSlots}
                  isRecording={isRecording}
                  uploadError={uploadError}
                  onSelectVoicebank={handleSelectVoicebank}
                  onUploadFiles={handleUploadFiles}
                  onToggleRecord={handleToggleRecord}
                  onDeleteCustomSlot={(slotId) => {
                    setCustomSlots((prev) => prev.filter((s) => s.id !== slotId));
                    if (activeVoicebank.customSlotId === slotId) {
                      handleSelectVoicebank(BUILTIN_VOICEBANKS[0]);
                    }
                  }}
                />
              </div>
            )}

            {/* Optional DSP Mixing Rack + Live Oscilloscope Drawer */}
            {showDspPanel && (
              <div className="daw-scroll max-h-[300px] overflow-y-auto border-b border-[#111216] bg-[#181A20] p-3">
                <div className="flex flex-col gap-3">
                  <WaveformScope
                    engine={engine}
                    selectedSlot={activeCustomSlot}
                    isPlaying={isPlaying}
                  />
                  <DspRack
                    params={dspParams}
                    activePresetId={activePresetId}
                    onChangeParam={(key, value) => {
                      setActivePresetId(null);
                      setDspParams((prev) => clampDspParams({ ...prev, [key]: value }));
                    }}
                    onSelectPreset={(presetId) => {
                      const preset = DSP_PRESETS.find((p) => p.id === presetId);
                      if (!preset) return;
                      setActivePresetId(preset.id);
                      setDspParams(clampDspParams({ ...DEFAULT_DSP_PARAMS, ...preset.patch }));
                    }}
                    onReset={() => {
                      setActivePresetId('vocaloid-pop');
                      setDspParams(DEFAULT_DSP_PARAMS);
                    }}
                  />
                </div>
              </div>
            )}

            {/* TOP-CENTER ARRANGEMENT TIMELINE */}
            <ArrangementTimeline
              tracks={tracks}
              selectedTrackId={selectedTrackId}
              notes={notes}
              bpm={bpm}
              playheadBeat={playheadBeat}
              activeVoicebankId={activeVoicebank.id}
              activeVoicebankName={activeVoicebank.name}
              onSelectTrack={setSelectedTrackId}
              onAddHarmonyTrack={handleAddHarmonyTrack}
              onDeleteTrack={(trackId) => {
                setTracks((prev) => prev.filter((t) => t.id !== trackId));
                if (selectedTrackId === trackId) {
                  setSelectedTrackId(tracks[0].id);
                }
              }}
              onUpdateTrack={handleUpdateTrack}
              onChangeBpm={setBpm}
              onScrubBeat={(b) => setPlayheadBeat(b)}
            />

            {/* CRYPTON PER-NOTE INSPECTOR STRIP */}
            <NoteInspectorBar
              selectedNote={selectedNote}
              onUpdateNote={(noteId, patch) => {
                updateNotes(
                  notes.map((n) => (n.id === noteId ? { ...n, ...patch } : n)),
                  true
                );
              }}
            />

            {/* BOTTOM-CENTER DARK PIANO ROLL + PARAMETER LANE */}
            <PianoRollEditor
              notes={notes}
              pitchPoints={pitchPoints}
              paramAutomation={paramAutomation}
              activeParamLane={activeParamLane}
              showParamLane={showParamLane}
              showMascot={showMascot}
              dspParams={dspParams}
              bpm={bpm}
              playheadBeat={playheadBeat}
              isPlaying={isPlaying}
              autoScroll={autoScroll}
              selectedNoteId={selectedNoteId}
              activeTool={activeTool}
              gridDivision={gridDivision}
              voicebankId={activeVoicebank.id}
              voicebankName={activeVoicebank.name}
              robotVoice={styleSettings.robotVoice}
              activeTrackNumber={activeTrackIdx + 1}
              onSelectNote={setSelectedNoteId}
              onChangeNotes={updateNotes}
              onChangePitchPoints={setPitchPoints}
              onChangeParamAutomation={(lane, pts: ParamAutomationPoint[]) =>
                setParamAutomation((prev) => ({ ...prev, [lane]: pts }))
              }
              onChangeActiveParamLane={setActiveParamLane}
              onToggleParamLane={() => setShowParamLane((v) => !v)}
              onToggleMascot={() => setShowMascot((v) => !v)}
              onChangePbs={(pbs) => setDspParams((prev) => clampDspParams({ ...prev, pbs }))}
              onAuditionKey={(midi) =>
                sequencer.auditionPianoKey(engine, midi, activeVoicebank, dspParams, activeCustomSlot)
              }
              onScrubBeat={(b) => setPlayheadBeat(b)}
              onChangeTool={setActiveTool}
              onChangeGrid={setGridDivision}
              onAutoHarmonize={handleAutoHarmonize}
            />
          </div>
        </div>
      ) : (
        <main className="daw-scroll flex-1 overflow-y-auto bg-[#14161B] px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-[1440px]">
            {activeView === 'cpp' && <CppProjectExplorer />}
            {activeView === 'setup' && <BuildGuideView />}
          </div>
        </main>
      )}

      {showLyricsModal && (
        <LyricsEditorModal
          initialLyrics={lyricsSource}
          initialLanguage={g2pLanguage}
          hasExistingNotes={notes.length > 0}
          onApplyToExisting={handleApplyLyricsToExisting}
          onGenerateSong={handleGenerateSongFromLyrics}
          onClose={() => setShowLyricsModal(false)}
        />
      )}
    </div>
  );
}

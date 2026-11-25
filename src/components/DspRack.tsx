import React from 'react';
import { RotateCcw } from 'lucide-react';
import { DSP_PRESETS, DspParams } from '../audio/dspMath';
import { breToAmount, formantShiftToGen, genToFormantShift } from '../audio/vocaloidParams';

interface DspRackProps {
  params: DspParams;
  activePresetId: string | null;
  onChangeParam: <K extends keyof DspParams>(key: K, value: DspParams[K]) => void;
  onSelectPreset: (presetId: string) => void;
  onReset: () => void;
}

interface SliderControlProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (value: number) => void;
}

const SliderControl: React.FC<SliderControlProps> = ({
  id,
  label,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
}) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={id} className="text-xs font-medium text-slate-300">
        {label}
      </label>
      <span className="font-mono text-xs tabular-nums text-orange-400">
        {displayValue}
      </span>
    </div>
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="studio-slider w-full"
    />
  </div>
);

export const DspRack: React.FC<DspRackProps> = ({
  params,
  activePresetId,
  onChangeParam,
  onSelectPreset,
  onReset,
}) => {
  return (
    <section aria-label="Cadena de procesamiento DSP" className="flex flex-col gap-5">
      {/* Presets bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-[#111622] p-3.5">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Preajustes vocales">
          {DSP_PRESETS.map((preset) => {
            const active = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectPreset(preset.id)}
                title={preset.description}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-orange-600 text-white'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {preset.name}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-500 hover:text-white transition-colors whitespace-nowrap shrink-0"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Restablecer</span>
        </button>
      </div>

      {/* 5 DSP + Crypton Vocaloid Modules */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Module 0: Crypton VOCALOID / Piapro V4X Controls */}
        <div className="rounded-xl border border-orange-500/40 bg-[#111622] p-4 md:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-orange-300">
              00. Parámetros Vocaloid de Crypton (Piapro Studio / V4X)
            </h3>
            <span className="font-mono text-[11px] text-slate-400">
              Escala estándar MIDI 0–127 · Sincronizado con la pista de expresión
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SliderControl
              id="vc-vel"
              label="VEL · Velocity (Consonantes)"
              value={params.vel ?? 64}
              min={0}
              max={127}
              step={1}
              displayValue={`${params.vel ?? 64}`}
              onChange={(v) => onChangeParam('vel', v)}
            />
            <SliderControl
              id="vc-dyn"
              label="DYN · Dynamics (Expresión)"
              value={params.dyn ?? 84}
              min={0}
              max={127}
              step={1}
              displayValue={`${params.dyn ?? 84}`}
              onChange={(v) => onChangeParam('dyn', v)}
            />
            <SliderControl
              id="vc-bre"
              label="BRE · Breathiness (Aire)"
              value={Math.round(((params.breathiness ?? 0.09) / 0.5) * 127)}
              min={0}
              max={127}
              step={1}
              displayValue={`${Math.round(((params.breathiness ?? 0.09) / 0.5) * 127)}`}
              onChange={(v) => onChangeParam('breathiness', breToAmount(v))}
            />
            <SliderControl
              id="vc-bri"
              label="BRI · Brightness (Brillo)"
              value={params.bri ?? 86}
              min={0}
              max={127}
              step={1}
              displayValue={`${params.bri ?? 86}`}
              onChange={(v) => onChangeParam('bri', v)}
            />
            <SliderControl
              id="vc-cle"
              label="CLE · Clearness (Claridad)"
              value={params.cle ?? 68}
              min={0}
              max={127}
              step={1}
              displayValue={`${params.cle ?? 68}`}
              onChange={(v) => onChangeParam('cle', v)}
            />
            <SliderControl
              id="vc-ope"
              label="OPE · Opening (Apertura vocal)"
              value={params.ope ?? 100}
              min={0}
              max={127}
              step={1}
              displayValue={`${params.ope ?? 100}`}
              onChange={(v) => onChangeParam('ope', v)}
            />
            <SliderControl
              id="vc-gen"
              label="GEN · Gender Factor (48 = +12%)"
              value={params.gen ?? 48}
              min={0}
              max={127}
              step={1}
              displayValue={`${params.gen ?? 48} (${Math.round((genToFormantShift(params.gen ?? 48) - 1) * 100)}%)`}
              onChange={(v) => {
                onChangeParam('gen', v);
                onChangeParam('genderFormantShift', genToFormantShift(v));
              }}
            />
            <SliderControl
              id="vc-gwl"
              label="GWL · Growl V4X (Gruñido)"
              value={params.gwl ?? 0}
              min={0}
              max={127}
              step={1}
              displayValue={`${params.gwl ?? 0}`}
              onChange={(v) => onChangeParam('gwl', v)}
            />
            <SliderControl
              id="vc-pbs"
              label="PBS · Rango Pitch Bend"
              value={params.pbs ?? 4}
              min={1}
              max={24}
              step={1}
              displayValue={`±${params.pbs ?? 4} st`}
              onChange={(v) => onChangeParam('pbs', v)}
            />
          </div>
        </div>

        {/* Module 1: Voice, Pitch & Unison */}
        <div className="rounded-xl border border-slate-800/80 bg-[#111622] p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-100">
            01. Tono, Paneo y Capas Unison
          </h3>
          <div className="flex flex-col gap-3.5">
            <SliderControl
              id="dsp-pitch"
              label="Tono / Velocidad (Pitch)"
              value={params.pitchRatio}
              min={0.5}
              max={2.0}
              step={0.01}
              displayValue={`${params.pitchRatio.toFixed(2)}x`}
              onChange={(v) => onChangeParam('pitchRatio', v)}
            />
            <SliderControl
              id="dsp-unison-voices"
              label="Capas de Doblado (Unison)"
              value={params.unisonVoices}
              min={1}
              max={5}
              step={1}
              displayValue={`${params.unisonVoices} ${params.unisonVoices === 1 ? 'voz' : 'voces'}`}
              onChange={(v) => onChangeParam('unisonVoices', v)}
            />
            <SliderControl
              id="dsp-unison-detune"
              label="Desafinación entre capas"
              value={params.unisonDetune}
              min={0}
              max={0.05}
              step={0.001}
              displayValue={`${(params.unisonDetune * 100).toFixed(1)}%`}
              onChange={(v) => onChangeParam('unisonDetune', v)}
            />
            <SliderControl
              id="dsp-unison-spread"
              label="Amplitud Estéreo Unison"
              value={params.unisonSpread}
              min={0}
              max={1}
              step={0.01}
              displayValue={`${Math.round(params.unisonSpread * 100)}%`}
              onChange={(v) => onChangeParam('unisonSpread', v)}
            />
            <SliderControl
              id="dsp-pan"
              label="Paneo Base (L / R)"
              value={params.pan}
              min={-1}
              max={1}
              step={0.02}
              displayValue={
                Math.abs(params.pan) < 0.03
                  ? 'Centro'
                  : params.pan < 0
                    ? `${Math.round(Math.abs(params.pan) * 100)}% L`
                    : `${Math.round(params.pan * 100)}% R`
              }
              onChange={(v) => onChangeParam('pan', v)}
            />
          </div>
        </div>

        {/* Module 2: ADSR Envelope */}
        <div className="rounded-xl border border-slate-800/80 bg-[#111622] p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-100">
            02. Envolvente Dinámica ADSR
          </h3>
          <div className="flex flex-col gap-3.5">
            <SliderControl
              id="dsp-attack"
              label="Ataque (Attack)"
              value={params.attackMs}
              min={1}
              max={500}
              step={1}
              displayValue={`${Math.round(params.attackMs)} ms`}
              onChange={(v) => onChangeParam('attackMs', v)}
            />
            <SliderControl
              id="dsp-decay"
              label="Decaimiento (Decay)"
              value={params.decayMs}
              min={10}
              max={1000}
              step={5}
              displayValue={`${Math.round(params.decayMs)} ms`}
              onChange={(v) => onChangeParam('decayMs', v)}
            />
            <SliderControl
              id="dsp-sustain"
              label="Sostenido (Sustain)"
              value={params.sustainLevel}
              min={0.05}
              max={1}
              step={0.01}
              displayValue={`${Math.round(params.sustainLevel * 100)}%`}
              onChange={(v) => onChangeParam('sustainLevel', v)}
            />
            <SliderControl
              id="dsp-release"
              label="Liberación (Release)"
              value={params.releaseMs}
              min={10}
              max={2000}
              step={10}
              displayValue={`${Math.round(params.releaseMs)} ms`}
              onChange={(v) => onChangeParam('releaseMs', v)}
            />
          </div>
        </div>

        {/* Module 3: Biquad Filters & Saturator */}
        <div className="rounded-xl border border-slate-800/80 bg-[#111622] p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-100">
            03. Filtros Biquad y Saturación
          </h3>
          <div className="flex flex-col gap-3.5">
            <SliderControl
              id="dsp-hpf"
              label="Filtro Paso-Alto (HPF)"
              value={params.highPassHz}
              min={20}
              max={1200}
              step={5}
              displayValue={`${Math.round(params.highPassHz)} Hz`}
              onChange={(v) => onChangeParam('highPassHz', v)}
            />
            <SliderControl
              id="dsp-lpf"
              label="Filtro Paso-Bajo (LPF)"
              value={params.lowPassHz}
              min={500}
              max={20000}
              step={50}
              displayValue={
                params.lowPassHz >= 1000
                  ? `${(params.lowPassHz / 1000).toFixed(1)} kHz`
                  : `${Math.round(params.lowPassHz)} Hz`
              }
              onChange={(v) => onChangeParam('lowPassHz', v)}
            />
            <SliderControl
              id="dsp-drive"
              label="Saturación Armónica (tanh)"
              value={params.drive}
              min={1.0}
              max={5.0}
              step={0.05}
              displayValue={`${params.drive.toFixed(2)}x`}
              onChange={(v) => onChangeParam('drive', v)}
            />
            <SliderControl
              id="dsp-master-gain"
              label="Ganancia Master"
              value={params.masterGain}
              min={0}
              max={1.8}
              step={0.02}
              displayValue={`${Math.round(params.masterGain * 100)}%`}
              onChange={(v) => onChangeParam('masterGain', v)}
            />
          </div>
        </div>

        {/* Module 4: Stereo Ping-Pong Delay & Reverb */}
        <div className="rounded-xl border border-slate-800/80 bg-[#111622] p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-100">
            04. Delay Estéreo y Reverb Algorítmica
          </h3>
          <div className="flex flex-col gap-3.5">
            <SliderControl
              id="dsp-delay-ms"
              label="Tiempo de Delay"
              value={params.delayTimeMs}
              min={10}
              max={1000}
              step={5}
              displayValue={`${Math.round(params.delayTimeMs)} ms`}
              onChange={(v) => onChangeParam('delayTimeMs', v)}
            />
            <SliderControl
              id="dsp-delay-fb"
              label="Realimentación Delay"
              value={params.delayFeedback}
              min={0}
              max={0.85}
              step={0.01}
              displayValue={`${Math.round(params.delayFeedback * 100)}%`}
              onChange={(v) => onChangeParam('delayFeedback', v)}
            />
            <SliderControl
              id="dsp-delay-mix"
              label="Mezcla Delay"
              value={params.delayMix}
              min={0}
              max={1}
              step={0.01}
              displayValue={`${Math.round(params.delayMix * 100)}%`}
              onChange={(v) => onChangeParam('delayMix', v)}
            />
            <SliderControl
              id="dsp-reverb-room"
              label="Tamaño de Sala (Reverb)"
              value={params.reverbRoomSize}
              min={0.1}
              max={0.96}
              step={0.01}
              displayValue={`${Math.round(params.reverbRoomSize * 100)}%`}
              onChange={(v) => onChangeParam('reverbRoomSize', v)}
            />
            <SliderControl
              id="dsp-reverb-mix"
              label="Mezcla Reverb"
              value={params.reverbMix}
              min={0}
              max={1}
              step={0.01}
              displayValue={`${Math.round(params.reverbMix * 100)}%`}
              onChange={(v) => onChangeParam('reverbMix', v)}
            />
          </div>
        </div>

        {/* Module 5: Vocal Tract Articulation, S-Curve Coarticulation & Prosody */}
        <div className="rounded-xl border border-slate-800/80 bg-[#111622] p-4 md:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-slate-100">
            05. Articulación Humana, Coarticulación (Curva S) y Prosodia
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SliderControl
              id="dsp-gender-formant"
              label="Gender / Formantes (+12%)"
              value={params.genderFormantShift}
              min={0.72}
              max={1.35}
              step={0.01}
              displayValue={`${params.genderFormantShift >= 1 ? '+' : ''}${Math.round((params.genderFormantShift - 1) * 100)}%`}
              onChange={(v) => {
                onChangeParam('genderFormantShift', v);
                onChangeParam('gen', formantShiftToGen(v));
              }}
            />
            <SliderControl
              id="dsp-portamento-ms"
              label="Portamento (Curva S)"
              value={params.portamentoMs}
              min={10}
              max={120}
              step={1}
              displayValue={`${Math.round(params.portamentoMs)} ms`}
              onChange={(v) => onChangeParam('portamentoMs', v)}
            />
            <SliderControl
              id="dsp-coarticulation"
              label="Difonos / Coarticulación"
              value={params.coarticulationMs}
              min={15}
              max={50}
              step={1}
              displayValue={`${Math.round(params.coarticulationMs)} ms`}
              onChange={(v) => onChangeParam('coarticulationMs', v)}
            />
            <SliderControl
              id="dsp-consonant-clarity"
              label="Oclusivas / Burst (3-10kHz)"
              value={params.consonantClarity}
              min={0.4}
              max={1.8}
              step={0.05}
              displayValue={`${params.consonantClarity.toFixed(2)}x`}
              onChange={(v) => onChangeParam('consonantClarity', v)}
            />
            <SliderControl
              id="dsp-breathiness"
              label="Aire Vocal (Breathiness)"
              value={params.breathiness}
              min={0}
              max={0.5}
              step={0.01}
              displayValue={`${Math.round(params.breathiness * 100)}%`}
              onChange={(v) => onChangeParam('breathiness', v)}
            />
            <SliderControl
              id="dsp-end-breathiness"
              label="Aire Aspirado Final"
              value={params.phraseEndBreathiness}
              min={0}
              max={0.65}
              step={0.01}
              displayValue={`${Math.round(params.phraseEndBreathiness * 100)}%`}
              onChange={(v) => onChangeParam('phraseEndBreathiness', v)}
            />
            <SliderControl
              id="dsp-vibrato-depth"
              label="Profundidad Vibrato (>250ms)"
              value={params.vibratoDepth}
              min={0}
              max={0.6}
              step={0.01}
              displayValue={`${params.vibratoDepth.toFixed(2)} st`}
              onChange={(v) => onChangeParam('vibratoDepth', v)}
            />
            <SliderControl
              id="dsp-vibrato-rate"
              label="Frecuencia Vibrato (5.5-6.5Hz)"
              value={params.vibratoRate}
              min={3.0}
              max={8.0}
              step={0.1}
              displayValue={`${params.vibratoRate.toFixed(1)} Hz`}
              onChange={(v) => onChangeParam('vibratoRate', v)}
            />
          </div>

          <div className="mt-4 border-t border-slate-800/80 pt-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="dsp-harmony-mode" className="text-xs font-semibold text-slate-200">
                Armonización Polifónica Estéreo (Lead + 3ª + 5ª + Bajo Rítmico)
              </label>
              <select
                id="dsp-harmony-mode"
                value={params.harmonyMode}
                onChange={(e) => onChangeParam('harmonyMode', e.target.value as DspParams['harmonyMode'])}
                className="rounded border border-slate-700 bg-[#0B0E14] px-2.5 py-1 text-xs text-orange-400 focus:border-orange-500 focus:outline-none"
              >
                <option value="solo">Solo (Voz Principal)</option>
                <option value="chords-3-5">Coro Armonizado (Lead + 3ª L + 5ª R)</option>
                <option value="choir-full">Coro Completo (Lead + 3ª + 5ª + Bajo Rítmico)</option>
                <option value="octave-bass">Bajo Vocal Rítmico / Octava (-12 st)</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

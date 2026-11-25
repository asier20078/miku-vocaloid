import React, { useEffect, useRef } from 'react';
import { linearToDb } from '../audio/dspMath';
import { VoiceSlot, WebAudioDspEngine } from '../audio/webAudioEngine';

interface WaveformScopeProps {
  engine: WebAudioDspEngine;
  selectedSlot: VoiceSlot | null;
  isPlaying: boolean;
}

export const WaveformScope: React.FC<WaveformScopeProps> = ({
  engine,
  selectedSlot,
  isPlaying,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const peakLRef = useRef<HTMLSpanElement | null>(null);
  const peakRRef = useRef<HTMLSpanElement | null>(null);
  const activeCountRef = useRef<HTMLSpanElement | null>(null);
  const barLRef = useRef<HTMLDivElement | null>(null);
  const barRRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let rafId = 0;

    const renderFrame = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const targetW = Math.max(300, Math.floor(rect.width * dpr));
      const targetH = Math.max(140, Math.floor(rect.height * dpr));

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const w = canvas.width;
      const h = canvas.height;
      const telemetry = engine.readTelemetry();

      // Update numeric readouts without triggering React re-renders at 60Hz
      if (peakLRef.current) peakLRef.current.textContent = linearToDb(telemetry.peakLeft);
      if (peakRRef.current) peakRRef.current.textContent = linearToDb(telemetry.peakRight);
      if (activeCountRef.current) activeCountRef.current.textContent = String(telemetry.activeVoices);
      if (barLRef.current) {
        barLRef.current.style.width = `${Math.min(100, telemetry.peakLeft * 100)}%`;
      }
      if (barRRef.current) {
        barRRef.current.style.width = `${Math.min(100, telemetry.peakRight * 100)}%`;
      }

      // Background
      ctx.fillStyle = '#0D1119';
      ctx.fillRect(0, 0, w, h);

      // Subtle reference grid
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.moveTo(0, h * 0.25);
      ctx.lineTo(w, h * 0.25);
      ctx.moveTo(0, h * 0.75);
      ctx.lineTo(w, h * 0.75);
      ctx.stroke();

      if (telemetry.activeVoices > 0) {
        // Spectrum background bars
        const bins = 64;
        const barW = w / bins;
        ctx.fillStyle = 'rgba(249, 115, 22, 0.14)';
        for (let i = 0; i < bins; i++) {
          const val = telemetry.frequencyData[i * 2] / 255;
          const barH = val * h * 0.85;
          ctx.fillRect(i * barW + 1, h - barH, Math.max(1, barW - 2), barH);
        }

        // Live oscilloscope trace
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        const len = telemetry.timeDomain.length;
        for (let i = 0; i < len; i++) {
          const x = (i / (len - 1)) * w;
          const y = (0.5 - telemetry.timeDomain[i] * 0.42) * h;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (selectedSlot && selectedSlot.peaks.length > 0) {
        // Static envelope preview of the selected voice sample
        const peaks = selectedSlot.peaks;
        const stepX = w / peaks.length;
        ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
        for (let i = 0; i < peaks.length; i++) {
          const barH = Math.max(2 * dpr, peaks[i] * h * 0.72);
          ctx.fillRect(
            i * stepX + stepX * 0.15,
            (h - barH) / 2,
            Math.max(1.5 * dpr, stepX * 0.7),
            barH
          );
        }
      }

      if (isPlaying || telemetry.activeVoices > 0) {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    renderFrame();
    if (isPlaying) {
      rafId = requestAnimationFrame(renderFrame);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [engine, selectedSlot, isPlaying]);

  return (
    <section aria-label="Monitor de señal y forma de onda" className="rounded-xl border border-slate-800/80 bg-[#111622] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">
            Osciloscopio y Espectro en Tiempo Real
          </h2>
          <p className="text-xs text-slate-400">
            {selectedSlot
              ? `Muestra activa: ${selectedSlot.name}`
              : 'Selecciona o sube una voz real para visualizar su señal'}
          </p>
        </div>

        <div className="flex items-center gap-5 font-mono text-xs tabular-nums text-slate-300">
          <div>
            <span className="text-slate-500">Voces: </span>
            <span ref={activeCountRef} className="text-slate-100">0</span>
          </div>
          <div>
            <span className="text-slate-500">Pico L: </span>
            <span ref={peakLRef} className="text-slate-100">-∞ dB</span>
          </div>
          <div>
            <span className="text-slate-500">Pico R: </span>
            <span ref={peakRRef} className="text-slate-100">-∞ dB</span>
          </div>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        data-testid="waveform-canvas"
        className="h-44 w-full rounded-lg border border-slate-800/80 bg-[#0D1119]"
      />

      {/* Stereo Peak Meter */}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <span className="w-4 font-mono text-[11px] text-slate-400">L</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-900">
            <div
              ref={barLRef}
              className="h-full bg-emerald-500 transition-[width] duration-75"
              style={{ width: '0%' }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 font-mono text-[11px] text-slate-400">R</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-900">
            <div
              ref={barRRef}
              className="h-full bg-emerald-500 transition-[width] duration-75"
              style={{ width: '0%' }}
            />
          </div>
        </div>
      </div>
    </section>
  );
};

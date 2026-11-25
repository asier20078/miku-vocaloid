import React, { useRef } from 'react';

interface RotaryKnobProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  defaultValue?: number;
  disabled?: boolean;
  size?: number;
  onChange: (nextValue: number) => void;
}

export const RotaryKnob: React.FC<RotaryKnobProps> = ({
  label,
  value,
  min = 0,
  max = 100,
  defaultValue = 79,
  disabled = false,
  size = 78,
  onChange,
}) => {
  const dragRef = useRef<{ startY: number; startValue: number } | null>(null);

  const clamped = Math.max(min, Math.min(max, value));
  const norm = (clamped - min) / Math.max(1, max - min);

  // VOCALOID rotary sweep: -135deg to +135deg (0deg = straight up)
  const startAngleDeg = -135;
  const endAngleDeg = 135;
  const currentAngleDeg = startAngleDeg + norm * (endAngleDeg - startAngleDeg);

  const cx = 50;
  const cy = 50;
  const radius = 34;

  const polarToCartesian = (deg: number, r: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  };

  const describeArc = (startDeg: number, stopDeg: number, r: number) => {
    const start = polarToCartesian(startDeg, r);
    const end = polarToCartesian(stopDeg, r);
    const largeArcFlag = stopDeg - startDeg <= 180 ? '0' : '1';
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  };

  const needleOuter = polarToCartesian(currentAngleDeg, 22);
  const needleInner = polarToCartesian(currentAngleDeg, 9);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startValue: clamped };
    const target = e.currentTarget;
    target.setPointerCapture?.(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      const dy = dragRef.current.startY - ev.clientY;
      const range = max - min;
      const delta = (dy / 130) * range;
      const next = Math.round(Math.max(min, Math.min(max, dragRef.current.startValue + delta)));
      onChange(next);
    };

    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    const step = e.deltaY < 0 ? 2 : -2;
    onChange(Math.round(Math.max(min, Math.min(max, clamped + step))));
  };

  const ticks = Array.from({ length: 19 }).map((_, idx) => {
    const deg = startAngleDeg + (idx / 18) * (endAngleDeg - startAngleDeg);
    const p1 = polarToCartesian(deg, 38.5);
    const p2 = polarToCartesian(deg, idx % 3 === 0 ? 43.5 : 41.5);
    const active = deg <= currentAngleDeg + 0.5;
    return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, active };
  });

  return (
    <div className="flex flex-col select-none">
      <span className="text-[10px] font-semibold tracking-wider text-slate-300 uppercase">
        {label}
      </span>

      <div className="mt-1 flex items-end justify-between gap-2">
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={clamped}
          onPointerDown={handlePointerDown}
          onDoubleClick={() => !disabled && onChange(defaultValue)}
          onWheel={handleWheel}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
              e.preventDefault();
              onChange(Math.min(max, clamped + 1));
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
              e.preventDefault();
              onChange(Math.max(min, clamped - 1));
            }
          }}
          title="Arrastra arriba/abajo o usa la rueda (doble clic para restablecer)"
          className={`mx-auto flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
            disabled ? 'cursor-not-allowed opacity-45' : 'cursor-ns-resize'
          }`}
          style={{ width: size, height: size }}
        >
          <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible">
            <defs>
              <radialGradient id="vocaloidKnobFace" cx="38%" cy="32%" r="70%">
                <stop offset="0%" stopColor="#353944" />
                <stop offset="65%" stopColor="#1B1D23" />
                <stop offset="100%" stopColor="#0E1014" />
              </radialGradient>
            </defs>

            {/* Radial scale ticks */}
            {ticks.map((t, i) => (
              <line
                key={i}
                x1={t.x1}
                y1={t.y1}
                x2={t.x2}
                y2={t.y2}
                stroke={t.active && !disabled ? '#38BDF8' : '#475569'}
                strokeWidth={1.3}
                strokeLinecap="round"
              />
            ))}

            {/* Background arc track */}
            <path
              d={describeArc(startAngleDeg, endAngleDeg, radius)}
              fill="none"
              stroke="#12141A"
              strokeWidth={4.5}
              strokeLinecap="round"
            />

            {/* Active cyan progress arc */}
            {norm > 0.01 && (
              <path
                d={describeArc(startAngleDeg, currentAngleDeg, radius)}
                fill="none"
                stroke={disabled ? '#475569' : '#38BDF8'}
                strokeWidth={4.5}
                strokeLinecap="round"
              />
            )}

            {/* Inner dark 3D cap */}
            <circle
              cx={cx}
              cy={cy}
              r={25}
              fill="url(#vocaloidKnobFace)"
              stroke="#0A0B0E"
              strokeWidth={2}
            />
            <circle
              cx={cx}
              cy={cy}
              r={23}
              fill="none"
              stroke="#474C59"
              strokeWidth={0.7}
              strokeOpacity={0.55}
            />

            {/* Indicator line */}
            <line
              x1={needleInner.x}
              y1={needleInner.y}
              x2={needleOuter.x}
              y2={needleOuter.y}
              stroke={disabled ? '#94A3B8' : '#F8FAFC'}
              strokeWidth={2.8}
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Numeric readout box matching VOCALOID screenshot */}
        <input
          type="number"
          min={min}
          max={max}
          disabled={disabled}
          aria-label={`${label} valor`}
          value={clamped}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            if (!Number.isNaN(parsed)) {
              onChange(Math.round(Math.max(min, Math.min(max, parsed))));
            }
          }}
          className="h-5 w-10 shrink-0 rounded-[2px] border border-[#14151A] bg-[#131419] px-1 text-right font-mono text-[11px] font-semibold tabular-nums text-slate-200 focus:border-sky-400 focus:outline-none"
        />
      </div>
    </div>
  );
};

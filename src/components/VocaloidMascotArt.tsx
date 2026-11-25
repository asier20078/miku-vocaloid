import React from 'react';

interface VocaloidMascotArtProps {
  voicebankId: string;
  voicebankName: string;
  variant: 'card' | 'overlay' | 'avatar';
}

interface MascotPalette {
  primary: string;
  secondary: string;
  accent: string;
  jacket: string;
  hairDark: string;
  badgeText: string;
}

function getPaletteForVoicebank(id: string): MascotPalette {
  if (id.includes('rin')) {
    return {
      primary: '#FACC15',
      secondary: '#FDE047',
      accent: '#FB923C',
      jacket: '#FEF08A',
      hairDark: '#CA8A04',
      badgeText: 'RIN V4X',
    };
  }
  if (id.includes('luka')) {
    return {
      primary: '#F472B6',
      secondary: '#FBCFE8',
      accent: '#38BDF8',
      jacket: '#334155',
      hairDark: '#DB2777',
      badgeText: 'LUKA EN/ES',
    };
  }
  if (id.includes('kaito')) {
    return {
      primary: '#3B82F6',
      secondary: '#93C5FD',
      accent: '#E2E8F0',
      jacket: '#1E3A8A',
      hairDark: '#1D4ED8',
      badgeText: 'KAITO V3',
    };
  }
  if (id.includes('dark')) {
    return {
      primary: '#2DD4BF',
      secondary: '#99F6E4',
      accent: '#A78BFA',
      jacket: '#1E293B',
      hairDark: '#0F766E',
      badgeText: 'DARK V4X',
    };
  }
  if (id.startsWith('custom-')) {
    return {
      primary: '#38BDF8',
      secondary: '#BAE6FD',
      accent: '#34D399',
      jacket: '#1E293B',
      hairDark: '#0284C7',
      badgeText: 'USER VOICE',
    };
  }
  // Default Miku / Megpoid bright emerald-cyan aesthetic matching screenshot
  return {
    primary: '#34D399',
    secondary: '#6EE7B7',
    accent: '#FB923C',
    jacket: '#FDBA74',
    hairDark: '#059669',
    badgeText: 'AI VOCALOID',
  };
}

export const VocaloidMascotArt: React.FC<VocaloidMascotArtProps> = ({
  voicebankId,
  voicebankName,
  variant,
}) => {
  const pal = getPaletteForVoicebank(voicebankId);

  if (variant === 'avatar') {
    return (
      <div
        className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[2px] border border-emerald-400/50"
        style={{ background: `linear-gradient(135deg, ${pal.hairDark}, #0F172A)` }}
      >
        <svg viewBox="0 0 48 48" className="h-full w-full" aria-hidden="true">
          <circle cx="24" cy="20" r="12" fill={pal.primary} />
          <circle cx="24" cy="22" r="8.5" fill="#FDE6D8" />
          <path d="M14 19 Q24 9 34 19 L35 28 L30 22 L24 23 L18 22 L13 28 Z" fill={pal.primary} />
          <circle cx="20.5" cy="22.5" r="1.5" fill="#0F172A" />
          <circle cx="27.5" cy="22.5" r="1.5" fill="#0F172A" />
          <path d="M22 26 Q24 27.5 26 26" fill="none" stroke="#E11D48" strokeWidth="1.2" />
          <path d="M13 44 Q24 31 35 44 Z" fill={pal.jacket} />
        </svg>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className="relative h-[74px] w-full overflow-hidden rounded-[3px] border border-[#14161B] bg-gradient-to-br from-[#F8FAFC] via-[#E2E8F0] to-[#CBD5E1] shadow-inner">
        {/* Stylized graphic stripes */}
        <svg viewBox="0 0 220 96" className="h-full w-full" aria-hidden="true">
          <defs>
            <linearGradient id={`cardBg-${voicebankId}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="55%" stopColor="#E0F2FE" />
              <stop offset="100%" stopColor={pal.secondary} stopOpacity="0.45" />
            </linearGradient>
          </defs>
          <rect width="220" height="96" fill={`url(#cardBg-${voicebankId})`} />
          <path d="M0 78 L95 16 L140 16 L45 96 L0 96 Z" fill={pal.primary} fillOpacity="0.18" />
          <path d="M150 0 L220 0 L220 96 L118 96 Z" fill={pal.accent} fillOpacity="0.18" />

          {/* Twin-tail / cyber vocalist silhouette bust */}
          <g transform="translate(108, 4)">
            {/* Back twin tails / hair flow */}
            <path d="M25 22 Q5 36 8 78 L24 72 Q22 45 35 30 Z" fill={pal.hairDark} />
            <path d="M62 20 Q88 32 94 76 L76 74 Q74 44 54 30 Z" fill={pal.hairDark} />
            {/* Jacket & tie */}
            <path d="M24 62 Q45 50 66 62 L76 92 L16 92 Z" fill={pal.jacket} />
            <path d="M35 60 L45 88 L55 60 Z" fill="#FFFFFF" />
            <path d="M43 64 L47 64 L48 84 L45 88 L42 84 Z" fill={pal.primary} />
            {/* Neck & Face */}
            <rect x="40" y="48" width="10" height="14" rx="4" fill="#FDE6D8" />
            <ellipse cx="45" cy="36" rx="15" ry="16" fill="#FDE6D8" />
            {/* Hair bangs */}
            <path
              d="M28 34 Q28 14 45 14 Q62 14 62 34 L56 28 L50 35 L45 27 L39 35 L33 28 Z"
              fill={pal.primary}
            />
            {/* Headphones / cyber hairpins */}
            <rect x="25" y="29" width="5" height="12" rx="2.5" fill="#1E293B" stroke={pal.accent} strokeWidth="1.5" />
            <rect x="60" y="29" width="5" height="12" rx="2.5" fill="#1E293B" stroke={pal.accent} strokeWidth="1.5" />
            {/* Eyes */}
            <ellipse cx="39" cy="37" rx="2.5" ry="3.2" fill={pal.hairDark} />
            <ellipse cx="51" cy="37" rx="2.5" ry="3.2" fill={pal.hairDark} />
            <circle cx="38.3" cy="36" r="1" fill="#FFFFFF" />
            <circle cx="50.3" cy="36" r="1" fill="#FFFFFF" />
            <path d="M42 44 Q45 46.5 48 44" fill="none" stroke="#FB7185" strokeWidth="1.4" strokeLinecap="round" />
          </g>
        </svg>

        {/* Top-left VOCALOID style label */}
        <div className="absolute top-1.5 left-2 font-display text-[9px] font-extrabold tracking-widest text-slate-700">
          VOCALOID<span className="text-sky-600">·AI</span>
        </div>

        {/* Bottom-left badge matching screenshot */}
        <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-[2px] bg-[#0F172A]/90 px-1.5 py-0.5 shadow">
          <span className="rounded-[1px] bg-white px-1 font-mono text-[8px] font-black text-slate-950">
            AI
          </span>
          <span className="max-w-[100px] truncate font-display text-[10px] font-bold tracking-tight text-white">
            {voicebankName}
          </span>
        </div>
      </div>
    );
  }

  // Right-side translucent full-figure overlay inside Piano Roll
  return (
    <div className="pointer-events-none sticky right-2 bottom-2 z-10 ml-auto flex h-[340px] w-[220px] items-end justify-end opacity-75 select-none">
      <svg viewBox="0 0 220 360" className="h-full w-full drop-shadow-[0_10px_25px_rgba(0,0,0,0.6)]" aria-hidden="true">
        <defs>
          <linearGradient id={`skirt-${voicebankId}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={pal.primary} stopOpacity="0.92" />
            <stop offset="100%" stopColor={pal.secondary} stopOpacity="0.68" />
          </linearGradient>
          <linearGradient id={`hair-${voicebankId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={pal.primary} />
            <stop offset="100%" stopColor={pal.hairDark} />
          </linearGradient>
        </defs>

        {/* Flowing back hair */}
        <path
          d="M95 56 Q54 78 44 165 Q65 148 82 118 Z"
          fill={`url(#hair-${voicebankId})`}
          opacity="0.92"
        />
        <path
          d="M126 56 Q170 76 186 172 Q160 150 138 118 Z"
          fill={`url(#hair-${voicebankId})`}
          opacity="0.92"
        />

        {/* Legs & Cyber Boots */}
        <path d="M96 226 L88 312 L100 314 L109 226 Z" fill="#FDE6D8" />
        <path d="M114 226 L124 316 L136 314 L126 226 Z" fill="#FDE6D8" />
        <path d="M84 295 L103 295 L105 344 L78 344 Z" fill="#F1F5F9" />
        <path d="M121 297 L139 297 L145 344 L118 344 Z" fill="#F1F5F9" />
        <path d="M77 338 L106 338 L106 348 L74 348 Z" fill={pal.primary} />
        <path d="M117 338 L147 338 L147 348 L115 348 Z" fill={pal.accent} />

        {/* Skirt */}
        <path
          d="M84 168 L138 168 L156 232 Q112 246 68 230 Z"
          fill={`url(#skirt-${voicebankId})`}
          stroke={pal.secondary}
          strokeWidth="1.5"
        />

        {/* Raised pose arms + jacket */}
        <path d="M88 106 L52 136 L60 146 L94 122 Z" fill={pal.jacket} />
        <path d="M132 104 L160 72 L152 60 L124 94 Z" fill={pal.jacket} />
        <path d="M90 100 L132 100 L136 170 L86 170 Z" fill="#F8FAFC" />
        <path d="M88 100 L102 100 L102 168 L84 168 Z" fill={pal.jacket} opacity="0.92" />
        <path d="M120 100 L134 100 L138 168 L120 168 Z" fill={pal.jacket} opacity="0.92" />
        <path d="M108 106 L114 106 L116 154 L111 160 L106 154 Z" fill={pal.primary} />

        {/* Head */}
        <rect x="106" y="88" width="10" height="14" rx="4" fill="#FDE6D8" />
        <ellipse cx="111" cy="70" rx="20" ry="22" fill="#FDE6D8" />
        {/* Hair & headband */}
        <path
          d="M89 67 Q91 41 111 41 Q131 41 133 67 L125 58 L117 69 L111 56 L104 69 L97 58 Z"
          fill={`url(#hair-${voicebankId})`}
        />
        <path d="M94 52 Q111 45 128 52" fill="none" stroke={pal.secondary} strokeWidth="3" strokeLinecap="round" />
        {/* Eyes */}
        <ellipse cx="103" cy="72" rx="3" ry="3.8" fill={pal.hairDark} />
        <ellipse cx="119" cy="72" rx="3" ry="3.8" fill={pal.hairDark} />
        <circle cx="102" cy="70.5" r="1.1" fill="#FFFFFF" />
        <circle cx="118" cy="70.5" r="1.1" fill="#FFFFFF" />
        <path d="M108 81 Q111 84 114 81" fill="none" stroke="#FB7185" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import { Music, Sparkles, X } from 'lucide-react';
import { convertLyricsToG2P, G2PLanguage } from '../audio/g2p';
import { DEMO_SONG_LYRICS, FAST_POP_ENGLISH_LYRICS } from '../audio/phonetics';

interface LyricsEditorModalProps {
  initialLyrics: string;
  initialLanguage: G2PLanguage;
  hasExistingNotes: boolean;
  onApplyToExisting: (lyrics: string, language: G2PLanguage) => void;
  onGenerateSong: (lyrics: string, baseMidi: number, stepBeats: number, language: G2PLanguage) => void;
  onClose: () => void;
}

export const LyricsEditorModal: React.FC<LyricsEditorModalProps> = ({
  initialLyrics,
  initialLanguage,
  hasExistingNotes,
  onApplyToExisting,
  onGenerateSong,
  onClose,
}) => {
  const [text, setText] = useState<string>(initialLyrics);
  const [language, setLanguage] = useState<G2PLanguage>(initialLanguage);
  const [baseMidi, setBaseMidi] = useState<number>(60); // C4
  const [stepBeats, setStepBeats] = useState<number>(0.75);

  const parsedTokens = useMemo(() => convertLyricsToG2P(text, language), [text, language]);
  const previewPhonetics = useMemo(() => parsedTokens.slice(0, 24), [parsedTokens]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lyrics-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-[#131722] text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <div>
            <h2 id="lyrics-modal-title" className="text-base font-semibold text-slate-50">
              Editor de Letra Completa y Conversor G2P / IPA
            </h2>
            <p className="text-xs text-slate-400">
              Escribe o pega la letra entera. Usa signos (<span className="font-mono text-slate-200">? ! , .</span>) para entonación prosódica o guiones (<span className="font-mono text-slate-200">co-ra-zón</span>) para silabeo manual.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar editor de letra"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="full-lyrics-textarea" className="text-xs font-semibold text-slate-300">
                Letra de la canción (Español e Inglés con reglas IPA + sílaba tónica)
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setText(DEMO_SONG_LYRICS);
                    setLanguage('auto');
                    setStepBeats(0.75);
                  }}
                  className="rounded border border-slate-700 bg-[#0B0E14] px-2 py-0.5 text-[11px] font-medium text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
                >
                  Demo ES+EN
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setText(FAST_POP_ENGLISH_LYRICS);
                    setLanguage('en');
                    setStepBeats(0.5);
                  }}
                  className="rounded border border-orange-500/40 bg-orange-600/15 px-2 py-0.5 text-[11px] font-medium text-orange-300 hover:bg-orange-600/25 transition-colors"
                >
                  Demo Pop Rápido (EN)
                </button>
              </div>
            </div>
            <textarea
              id="full-lyrics-textarea"
              rows={7}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Escribe aquí los versos y el estribillo de tu canción..."
              className="w-full rounded-lg border border-slate-700 bg-[#0B0E14] p-3 text-sm leading-relaxed text-slate-100 placeholder:text-slate-500 focus:border-orange-500 focus:outline-none"
            />
          </div>

          {/* Syllable & IPA preview */}
          <div className="rounded-lg border border-slate-800 bg-[#0D1119] p-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium text-slate-300">
                Vista previa silábica, IPA y acentuación tónica (<span className="font-mono text-orange-400">ˈ</span>)
              </span>
              <span className="font-mono tabular-nums text-orange-400">
                {parsedTokens.length} sílabas detectadas
              </span>
            </div>
            {previewPhonetics.length === 0 ? (
              <p className="text-xs text-slate-500">Escribe al menos una palabra para ver los fonemas IPA.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {previewPhonetics.map((item, idx) => (
                  <div
                    key={`${item.text}-${idx}`}
                    className={`rounded border px-2 py-1 text-center ${
                      item.isStressed
                        ? 'border-orange-500/50 bg-[#1B1820]'
                        : 'border-slate-800 bg-[#151B28]'
                    }`}
                  >
                    <div className="font-mono text-[10px] text-orange-400">{item.ipaDisplay}</div>
                    <div className="text-xs font-medium text-slate-100">
                      {item.text}
                      {item.punctuation === 'question' && '?'}
                      {item.punctuation === 'exclamation' && '!'}
                      {item.punctuation === 'comma' && ','}
                      {item.punctuation === 'period' && '.'}
                    </div>
                  </div>
                ))}
                {parsedTokens.length > 24 && (
                  <span className="self-center font-mono text-xs text-slate-400">
                    +{parsedTokens.length - 24} más
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Language & Melody generation controls */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="lyrics-g2p-lang" className="mb-1 block text-xs font-medium text-slate-300">
                Idioma G2P
              </label>
              <select
                id="lyrics-g2p-lang"
                value={language}
                onChange={(e) => setLanguage(e.target.value as G2PLanguage)}
                className="w-full rounded-lg border border-slate-700 bg-[#0B0E14] px-3 py-2 text-xs text-slate-100 focus:border-orange-500 focus:outline-none"
              >
                <option value="auto">Automático (ES + EN)</option>
                <option value="es">Español (IPA Castellano)</option>
                <option value="en">Inglés (IPA Reglas EN)</option>
              </select>
            </div>

            <div>
              <label htmlFor="lyrics-base-pitch" className="mb-1 block text-xs font-medium text-slate-300">
                Tesitura / Nota base
              </label>
              <select
                id="lyrics-base-pitch"
                value={baseMidi}
                onChange={(e) => setBaseMidi(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-[#0B0E14] px-3 py-2 text-xs text-slate-100 focus:border-orange-500 focus:outline-none"
              >
                <option value={48}>Barítono grave (C3)</option>
                <option value={55}>Tenor medio (G3)</option>
                <option value={60}>Estándar / Pop (C4)</option>
                <option value={65}>Soprano brillante (F4)</option>
              </select>
            </div>

            <div>
              <label htmlFor="lyrics-rhythm-step" className="mb-1 block text-xs font-medium text-slate-300">
                Ritmo por sílaba
              </label>
              <select
                id="lyrics-rhythm-step"
                value={stepBeats}
                onChange={(e) => setStepBeats(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-[#0B0E14] px-3 py-2 text-xs text-slate-100 focus:border-orange-500 focus:outline-none"
              >
                <option value={0.5}>Rápido (corcheas · 0.50 beat)</option>
                <option value={0.75}>Fluido Pop (0.75 beat)</option>
                <option value={1.0}>Balada / Lento (1.00 beat)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-800 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            Cancelar
          </button>

          {hasExistingNotes && (
            <button
              type="button"
              disabled={parsedTokens.length === 0}
              onClick={() => {
                onApplyToExisting(text, language);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-lime-600/60 bg-lime-950/40 px-4 py-2 text-xs font-semibold text-lime-300 hover:bg-lime-900/50 disabled:opacity-40 transition-colors"
            >
              <Music className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Aplicar letra a mis notas</span>
            </button>
          )}

          <button
            type="button"
            disabled={parsedTokens.length === 0}
            onClick={() => {
              onGenerateSong(text, baseMidi, stepBeats, language);
              onClose();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-40 transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Generar melodía + letra completa</span>
          </button>
        </div>
      </div>
    </div>
  );
};

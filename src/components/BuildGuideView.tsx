import React from 'react';

export const BuildGuideView: React.FC = () => {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="border-b border-slate-800/80 pb-4">
        <h1 className="text-xl font-semibold text-slate-50">
          Entorno de Desarrollo y Compilación Nativa
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Cómo compilar el motor C++20 con PortAudio en tu ordenador y preparar tus voces reales.
        </p>
      </div>

      <section className="rounded-xl border border-slate-800/80 bg-[#111622] p-5">
        <h2 className="text-base font-semibold text-slate-100">
          01. Entorno recomendado por sistema operativo
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="border-t border-slate-800 pt-3">
            <h3 className="text-sm font-semibold text-orange-400">Windows 10 / 11</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              Visual Studio 2022 Community (con carga de trabajo C++) o CLion. PortAudio usa WASAPI de serie para baja latencia sin drivers extra.
            </p>
          </div>
          <div className="border-t border-slate-800 pt-3">
            <h3 className="text-sm font-semibold text-orange-400">macOS</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              Xcode Command Line Tools + CLion o VS Code. PortAudio se enlaza automáticamente con CoreAudio con latencia mínima estable.
            </p>
          </div>
          <div className="border-t border-slate-800 pt-3">
            <h3 className="text-sm font-semibold text-orange-400">Linux</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              GCC 12+ o Clang + CMake + paquetes de desarrollo ALSA / PipeWire / JACK (<span className="font-mono text-slate-200">libasound2-dev</span> en Debian/Ubuntu).
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800/80 bg-[#111622] p-5">
        <h2 className="text-base font-semibold text-slate-100">
          02. Compilar y ejecutar con CMake
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Descomprime el archivo <span className="font-mono text-slate-200">voxdsp-cpp-portaudio.zip</span> y ejecuta estos comandos dentro de la carpeta <span className="font-mono text-slate-200">voxdsp-cpp-engine</span>. CMake descargará PortAudio y dr_wav automáticamente.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-slate-800 bg-[#0D1119] p-4 font-mono text-xs leading-relaxed text-slate-200">
{`cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j

# Ejecutar las pruebas unitarias DSP
ctest --test-dir build --output-on-failure

# Iniciar el motor cargando tus voces reales en WAV
./build/voxdsp_cli ruta/a/mi_voz.wav`}
        </pre>
      </section>

      <section className="rounded-xl border border-slate-800/80 bg-[#111622] p-5">
        <h2 className="text-base font-semibold text-slate-100">
          03. Programas para grabar y preparar tus voces reales
        </h2>
        <div className="mt-3 flex flex-col gap-3 text-xs leading-relaxed text-slate-300">
          <p>
            <strong className="text-slate-100">Audacity o REAPER:</strong> Graba tu voz en un entorno seco (sin eco natural), limpia silencios iniciales y exporta en formato <span className="font-mono text-slate-100">.wav</span> (PCM 24-bit o 32-bit float a 48.000 Hz).
          </p>
          <p>
            <strong className="text-slate-100">Comandos dentro del motor CLI:</strong> Una vez abierto <span className="font-mono text-slate-100">voxdsp_cli</span>, puedes disparar tus muestras con <span className="font-mono text-orange-300">play 0 1.0 3 0.0</span> (slot 0, pitch 1.0, 3 capas unison) o modificar filtros en vivo con <span className="font-mono text-orange-300">hpf 90</span>, <span className="font-mono text-orange-300">delay 280 0.35 0.25</span> y <span className="font-mono text-orange-300">reverb 0.7 0.4 0.3</span>.
          </p>
        </div>
      </section>
    </div>
  );
};

# VoxDSP — Motor de Audio en C++20 + PortAudio

Motor de sonido en tiempo real escrito en **C++20** usando **PortAudio** para E/S de baja latencia y **dr_wav** para cargar grabaciones de voces reales en RAM.

## Estructura del proyecto

- `include/voxdsp/Types.hpp`: Tipos base, configuración y parámetros atómicos en tiempo real.
- `include/voxdsp/LockFreeQueue.hpp`: Cola SPSC *lock-free* para enviar comandos del hilo principal al callback sin bloqueos.
- `include/voxdsp/WavLoader.hpp` & `src/WavLoader.cpp`: Carga de archivos `.wav` (PCM / Float), *resampling* automático y normalización.
- `include/voxdsp/Voice.hpp` & `VoicePool.hpp`: Reproducción polifónica (hasta 32 voces) con interpolación cúbica *Hermite*, paneo *constant-power* y *unison* multicapa para doblar voces.
- `include/voxdsp/dsp/`:
  - `AdsrEnvelope.hpp`: Envolvente Attack/Decay/Sustain/Release sin clics.
  - `BiquadFilter.hpp`: Filtros RBJ (Paso-alto, Paso-bajo, Paso-banda).
  - `StereoDelay.hpp`: Delay estéreo *ping-pong* con amortiguación en el feedback.
  - `Reverb.hpp`: Reverb algorítmica estéreo (8 filtros comb + 4 all-pass por canal).
  - `Dynamics.hpp`: Saturación cálida y limitador de seguridad.
- `include/voxdsp/AudioEngine.hpp` & `src/AudioEngine.cpp`: Grafo DSP completo independiente del driver.
- `include/voxdsp/PortAudioBackend.hpp` & `src/PortAudioBackend.cpp`: Conexión real con PortAudio.
- `src/main.cpp`: CLI interactivo para cargar voces `.wav`, disparar capas *unison* y ajustar el DSP en vivo.

## Cómo compilar y ejecutar

Requisitos: **CMake >= 3.20**, **Git** y un compilador C++20 (Visual Studio 2022, Clang o GCC).

```bash
cd cpp-engine
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
```

### Ejecutar el motor CLI con tus voces
```bash
./build/voxdsp_cli ruta/a/mi_voz.wav
```

### Ejecutar las pruebas unitarias DSP
```bash
ctest --test-dir build --output-on-failure
```

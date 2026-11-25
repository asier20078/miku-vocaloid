#include "voxdsp/AudioEngine.hpp"
#include "voxdsp/PortAudioBackend.hpp"

#include <cmath>
#include <iostream>
#include <sstream>
#include <string>

namespace {

void printHelp() {
    std::cout << "\n=== VoxDSP CLI (Motor C++20 + PortAudio) ===\n"
              << "Comandos disponibles:\n"
              << "  devices                         Lista dispositivos de audio\n"
              << "  load <slot> <ruta.wav>          Carga una voz WAV en un slot (0-31)\n"
              << "  play <slot> [pitch] [unison] [pan]\n"
              << "                                  Dispara voz (ej: play 0 1.0 3 0.0)\n"
              << "  loop <slot> [pitch] [unison]    Dispara voz en bucle continuo\n"
              << "  release                         Suelta suavemente todas las voces (ADSR)\n"
              << "  panic                           Detiene todas las voces al instante\n"
              << "  gain <0.0..2.0>                 Ganancia master\n"
              << "  drive <1.0..6.0>                Saturacion calida\n"
              << "  hpf <Hz>                        Filtro paso-alto (20..20000 Hz)\n"
              << "  lpf <Hz>                        Filtro paso-bajo (20..20000 Hz)\n"
              << "  delay <ms> <feedback> <mix>     Delay estereo ping-pong\n"
              << "  reverb <room> <damp> <mix>      Reverb algoritmica estereo\n"
              << "  adsr <atkMs> <decMs> <sus> <relMs>\n"
              << "  status                          Muestra voces activas, pico dB y CPU\n"
              << "  help                            Muestra esta ayuda\n"
              << "  quit                            Salir\n\n";
}

} // namespace

int main(int argc, char** argv) {
    voxdsp::AudioEngine engine;
    voxdsp::PortAudioBackend backend(engine);

    voxdsp::AudioConfig config;
    config.sampleRate = 48000.0;
    config.framesPerBuffer = 256;
    config.inputChannels = 0; // Cambia a 1 si quieres mezclar microfono en vivo
    config.outputChannels = 2;

    std::string error;
    if (!backend.start(config, -1, -1, &error)) {
        std::cerr << "Error al iniciar PortAudio: " << error << "\n";
        return 1;
    }

    // Precarga opcional de archivos .wav pasados por linea de comandos
    for (int i = 1; i < argc && i <= 32; ++i) {
        const uint32_t slot = static_cast<uint32_t>(i - 1);
        std::string loadErr;
        if (engine.loadSampleFromWav(slot, argv[i], &loadErr)) {
            std::cout << "[OK] Slot " << slot << " cargado: " << argv[i] << "\n";
        } else {
            std::cerr << "[WARN] " << loadErr << "\n";
        }
    }

    printHelp();

    std::string line;
    while (true) {
        std::cout << "voxdsp> ";
        if (!std::getline(std::cin, line)) {
            break;
        }
        if (line.empty()) continue;

        std::istringstream iss(line);
        std::string cmd;
        iss >> cmd;

        if (cmd == "quit" || cmd == "exit") {
            break;
        } else if (cmd == "help") {
            printHelp();
        } else if (cmd == "devices") {
            const auto devs = voxdsp::PortAudioBackend::enumerateDevices();
            for (const auto& d : devs) {
                std::cout << "  [" << d.index << "] " << d.name
                          << " (in=" << d.maxInputChannels
                          << ", out=" << d.maxOutputChannels
                          << ", sr=" << d.defaultSampleRate << ")\n";
            }
        } else if (cmd == "load") {
            uint32_t slot = 0;
            std::string path;
            if (iss >> slot && std::getline(iss >> std::ws, path)) {
                std::string loadErr;
                if (engine.loadSampleFromWav(slot, path, &loadErr)) {
                    std::cout << "Voz cargada en slot " << slot << ".\n";
                } else {
                    std::cout << "Error: " << loadErr << "\n";
                }
            } else {
                std::cout << "Uso: load <slot> <ruta.wav>\n";
            }
        } else if (cmd == "play" || cmd == "loop") {
            voxdsp::VoiceTriggerParams params;
            params.loop = (cmd == "loop");
            if (iss >> params.sampleId) {
                iss >> params.pitchRatio;
                iss >> params.unisonVoices;
                iss >> params.pan;
                if (!engine.triggerVoice(params)) {
                    std::cout << "Cola de comandos llena.\n";
                }
            } else {
                std::cout << "Uso: " << cmd << " <slot> [pitch] [unison] [pan]\n";
            }
        } else if (cmd == "release") {
            engine.releaseAllVoices();
        } else if (cmd == "panic") {
            engine.stopAllImmediate();
        } else if (cmd == "gain") {
            float v = 0.85f;
            if (iss >> v) engine.parameters().masterGain.store(v);
        } else if (cmd == "drive") {
            float v = 1.15f;
            if (iss >> v) engine.parameters().drive.store(v);
        } else if (cmd == "hpf") {
            float hz = 85.0f;
            if (iss >> hz) engine.parameters().highPassHz.store(hz);
        } else if (cmd == "lpf") {
            float hz = 16000.0f;
            if (iss >> hz) engine.parameters().lowPassHz.store(hz);
        } else if (cmd == "delay") {
            float ms = 280.0f, fb = 0.32f, mix = 0.18f;
            if (iss >> ms >> fb >> mix) {
                engine.parameters().delayTimeMs.store(ms);
                engine.parameters().delayFeedback.store(fb);
                engine.parameters().delayMix.store(mix);
            }
        } else if (cmd == "reverb") {
            float room = 0.62f, damp = 0.45f, mix = 0.20f;
            if (iss >> room >> damp >> mix) {
                engine.parameters().reverbRoomSize.store(room);
                engine.parameters().reverbDamping.store(damp);
                engine.parameters().reverbMix.store(mix);
            }
        } else if (cmd == "adsr") {
            float a = 8.0f, d = 60.0f, s = 0.92f, r = 180.0f;
            if (iss >> a >> d >> s >> r) {
                engine.parameters().attackMs.store(a);
                engine.parameters().decayMs.store(d);
                engine.parameters().sustainLevel.store(s);
                engine.parameters().releaseMs.store(r);
            }
        } else if (cmd == "status") {
            const float pL = engine.telemetry().peakLeft.load();
            const float pR = engine.telemetry().peakRight.load();
            const uint32_t voices = engine.telemetry().activeVoices.load();
            const uint64_t frames = engine.telemetry().processedFrames.load();
            std::cout << "Voces activas: " << voices
                      << " | Peak L/R: " << pL << " / " << pR
                      << " | CPU audio: " << (backend.streamCpuLoad() * 100.0) << "%"
                      << " | Frames: " << frames << "\n";
        } else {
            std::cout << "Comando no reconocido. Escribe 'help'.\n";
        }
    }

    backend.stop();
    return 0;
}

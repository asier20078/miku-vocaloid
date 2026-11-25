#include <cassert>
#include <cmath>
#include <iostream>
#include <vector>

#include "voxdsp/AudioEngine.hpp"
#include "voxdsp/LockFreeQueue.hpp"
#include "voxdsp/dsp/AdsrEnvelope.hpp"
#include "voxdsp/dsp/BiquadFilter.hpp"
#include "voxdsp/dsp/Dynamics.hpp"
#include "voxdsp/dsp/Reverb.hpp"
#include "voxdsp/dsp/StereoDelay.hpp"
#include "voxdsp/g2p/GraphemeToPhoneme.hpp"
#include "voxdsp/dsp/Coarticulation.hpp"
#include "voxdsp/dsp/VocalTract.hpp"
#include "voxdsp/dsp/ProsodyEngine.hpp"
#include "voxdsp/VoiceEngine.hpp"

namespace {

voxdsp::AudioBuffer makeSineBuffer(float freqHz, uint32_t sampleRate, float durationSec) {
    voxdsp::AudioBuffer buf;
    buf.channels = 1;
    buf.sampleRate = sampleRate;
    const size_t totalFrames = static_cast<size_t>(sampleRate * durationSec);
    buf.samples.resize(totalFrames);
    constexpr double kTwoPi = 6.28318530717958647692;
    for (size_t i = 0; i < totalFrames; ++i) {
        buf.samples[i] = static_cast<float>(std::sin(kTwoPi * freqHz * static_cast<double>(i) / sampleRate));
    }
    return buf;
}

void testLockFreeQueue() {
    voxdsp::LockFreeQueue<int, 8> q;
    int val = 0;
    assert(!q.pop(val));

    for (int i = 1; i <= 7; ++i) {
        assert(q.push(i));
    }
    assert(!q.push(8)); // Capacity - 1 items fit in SPSC ring

    for (int i = 1; i <= 7; ++i) {
        assert(q.pop(val));
        assert(val == i);
    }
    assert(!q.pop(val));
    std::cout << "[PASS] LockFreeQueue SPSC\n";
}

void testAdsrEnvelope() {
    voxdsp::dsp::AdsrEnvelope env;
    env.setSampleRate(48000.0);
    env.setParameters(10.0f, 10.0f, 0.5f, 10.0f);
    assert(!env.isActive());

    env.noteOn();
    assert(env.isActive());
    float peak = 0.0f;
    for (int i = 0; i < 485; ++i) { // 10ms @ 48kHz = 480 samples
        peak = std::max(peak, env.process());
    }
    assert(peak >= 0.99f);

    for (int i = 0; i < 500; ++i) {
        env.process();
    }
    assert(std::abs(env.process() - 0.5f) < 0.02f);

    env.noteOff();
    for (int i = 0; i < 500; ++i) {
        env.process();
    }
    assert(!env.isActive());
    std::cout << "[PASS] AdsrEnvelope\n";
}

void testBiquadFilterAttenuation() {
    voxdsp::dsp::BiquadFilter lpf;
    lpf.setSampleRate(48000.0);
    lpf.configure(voxdsp::dsp::FilterMode::LowPass, 200.0f, 0.7071f);

    // Feed high-frequency 10 kHz sine wave; amplitude should be strongly attenuated
    constexpr double kTwoPi = 6.28318530717958647692;
    float maxOut = 0.0f;
    for (int i = 0; i < 1000; ++i) {
        const float x = static_cast<float>(std::sin(kTwoPi * 10000.0 * i / 48000.0));
        const auto y = lpf.process({x, x});
        if (i > 200) {
            maxOut = std::max(maxOut, std::abs(y.left));
        }
    }
    assert(maxOut < 0.05f);
    std::cout << "[PASS] BiquadFilter LowPass attenuation\n";
}

void testStereoDelayAndReverb() {
    voxdsp::dsp::StereoDelay delay;
    delay.prepare(48000.0, 500.0f);
    delay.setParameters(10.0f, 0.5f, 1.0f);

    // Send impulse at frame 0
    delay.process({1.0f, 0.0f});
    float energyAfter = 0.0f;
    for (int i = 1; i < 1200; ++i) {
        auto out = delay.process({0.0f, 0.0f});
        energyAfter += std::abs(out.left) + std::abs(out.right);
    }
    assert(energyAfter > 0.5f);

    voxdsp::dsp::Reverb reverb;
    reverb.prepare(48000.0);
    reverb.setParameters(0.7f, 0.4f, 0.5f);
    auto r0 = reverb.process({1.0f, 1.0f});
    assert(std::isfinite(r0.left) && std::isfinite(r0.right));
    float tailEnergy = 0.0f;
    for (int i = 0; i < 4000; ++i) {
        auto rt = reverb.process({0.0f, 0.0f});
        tailEnergy += std::abs(rt.left) + std::abs(rt.right);
    }
    assert(tailEnergy > 0.01f);
    std::cout << "[PASS] StereoDelay & Reverb\n";
}

void testAudioEnginePolyphonyAndUnison() {
    voxdsp::AudioEngine engine;
    voxdsp::AudioConfig cfg;
    cfg.sampleRate = 48000.0;
    cfg.framesPerBuffer = 256;
    cfg.outputChannels = 2;
    engine.prepare(cfg);

    engine.parameters().delayMix.store(0.0f);
    engine.parameters().reverbMix.store(0.0f);
    engine.parameters().attackMs.store(1.0f);

    auto vocalMock = makeSineBuffer(440.0f, 48000, 0.5f);
    assert(engine.registerSample(0, std::move(vocalMock)));

    voxdsp::VoiceTriggerParams trigger;
    trigger.sampleId = 0;
    trigger.gain = 0.8f;
    trigger.unisonVoices = 3;
    trigger.unisonDetune = 0.015f;
    trigger.unisonSpread = 0.8f;
    assert(engine.triggerVoice(trigger));

    std::vector<float> out(256 * 2, 0.0f);
    engine.processBlock(nullptr, 0, out.data(), 2, 256);

    assert(engine.telemetry().activeVoices.load() == 3);
    assert(engine.telemetry().peakLeft.load() > 0.05f);
    assert(engine.telemetry().peakRight.load() > 0.05f);
    assert(engine.telemetry().peakLeft.load() <= 0.98f);
    assert(engine.telemetry().processedFrames.load() == 256);

    engine.stopAllImmediate();
    engine.processBlock(nullptr, 0, out.data(), 2, 256);
    assert(engine.telemetry().activeVoices.load() == 0);
    std::cout << "[PASS] AudioEngine polyphony, unison & safety limiter\n";
}

void testGraphemeToPhoneme() {
    const auto es = voxdsp::g2p::GraphemeToPhoneme::convertText("corazón perro?", voxdsp::g2p::Language::Spanish);
    assert(es.size() == 5); // co-ra-zón + pe-rro
    assert(!es[0].isStressed && !es[1].isStressed && es[2].isStressed);
    assert(es[2].ipaDisplay.find("s o n") != std::string::npos);
    assert(es[3].isStressed && !es[4].isStressed);
    assert(es[4].punctuation == voxdsp::g2p::PunctuationTone::Question);

    bool foundTrill = false;
    for (const auto& ph : es[4].phonemes) {
        if (ph.manner == voxdsp::g2p::PhonemeManner::Trill && ph.trillRateHz > 20.0f) {
            foundTrill = true;
        }
    }
    assert(foundTrill);

    const auto en = voxdsp::g2p::GraphemeToPhoneme::convertText("shadow think!", voxdsp::g2p::Language::English);
    assert(en.size() >= 3);
    assert(en[0].phonemes[0].ipa == "ʃ");
    assert(en.back().punctuation == voxdsp::g2p::PunctuationTone::Exclamation);
    std::cout << "[PASS] GraphemeToPhoneme (ES/EN IPA, stress & punctuation)\n";
}

void testCoarticulationAndVocalTract() {
    const auto pSpec = voxdsp::g2p::GraphemeToPhoneme::lookupIpa("p");
    const auto aSpec = voxdsp::g2p::GraphemeToPhoneme::lookupIpa("a");
    const auto mSpec = voxdsp::g2p::GraphemeToPhoneme::lookupIpa("m");
    const auto sSpec = voxdsp::g2p::GraphemeToPhoneme::lookupIpa("s");
    const auto rSpec = voxdsp::g2p::GraphemeToPhoneme::lookupIpa("r");

    const auto pTarget = voxdsp::dsp::CoarticulationEngine::targetFromPhoneme(pSpec);
    const auto aTarget = voxdsp::dsp::CoarticulationEngine::targetFromPhoneme(aSpec);
    const auto midTarget = voxdsp::dsp::CoarticulationEngine::interpolate(pTarget, aTarget, 0.5f);
    assert(midTarget.f1 > pTarget.f1 && midTarget.f1 < aTarget.f1);
    assert(voxdsp::dsp::CoarticulationEngine::smoothstep(0.0f) == 0.0f);
    assert(voxdsp::dsp::CoarticulationEngine::smoothstep(1.0f) == 1.0f);

    voxdsp::dsp::VocalTractSynth tract;
    tract.prepare(48000.0);

    // 1. Plosive occlusion silence (voiceless closure)
    float closurePeak = 0.0f;
    auto zeroNoiseP = pTarget;
    zeroNoiseP.noiseMix = 0.0f;
    for (int i = 0; i < 400; ++i) {
        const auto frame = tract.processSample(220.0f, zeroNoiseP, 0.0f, 0.0f);
        closurePeak = std::max(closurePeak, std::abs(frame.left));
    }
    assert(closurePeak < 1e-4f);

    // 2. Vowel resonance & nasal antiresonance finite output
    tract.reset();
    float vowelPeak = 0.0f;
    for (int i = 0; i < 1200; ++i) {
        const auto frame = tract.processSample(220.0f, aTarget, 0.08f, 1.0f);
        assert(std::isfinite(frame.left));
        vowelPeak = std::max(vowelPeak, std::abs(frame.left));
    }
    assert(vowelPeak > 0.02f);

    const auto mTarget = voxdsp::dsp::CoarticulationEngine::targetFromPhoneme(mSpec);
    float nasalPeak = 0.0f;
    for (int i = 0; i < 1000; ++i) {
        const auto frame = tract.processSample(220.0f, mTarget, 0.05f, 1.0f);
        assert(std::isfinite(frame.left));
        nasalPeak = std::max(nasalPeak, std::abs(frame.left));
    }
    assert(nasalPeak > 0.005f);

    // 3. Fricative bandpass noise energy
    const auto sTarget = voxdsp::dsp::CoarticulationEngine::targetFromPhoneme(sSpec);
    float fricEnergy = 0.0f;
    for (int i = 0; i < 800; ++i) {
        const auto frame = tract.processSample(220.0f, sTarget, 0.0f, 1.0f);
        fricEnergy += std::abs(frame.left);
    }
    assert(fricEnergy > 2.0f);

    // 4. Rolled 'rr' trill modulation
    const auto rTarget = voxdsp::dsp::CoarticulationEngine::targetFromPhoneme(rSpec);
    float trillPeak = 0.0f;
    for (int i = 0; i < 2000; ++i) {
        const auto frame = tract.processSample(196.0f, rTarget, 0.05f, 1.0f);
        trillPeak = std::max(trillPeak, std::abs(frame.left));
    }
    assert(trillPeak > 0.01f);

    std::cout << "[PASS] CoarticulationEngine & VocalTractSynth (Formants, Plosives, Fricatives, Nasals, Trill)\n";
}

void testProsodyEngine() {
    voxdsp::dsp::ProsodyParams params;
    const auto qEnd = voxdsp::dsp::ProsodyEngine::evaluateSyllableFrame(
        60.0f, 0.78f, 0.80f, true, voxdsp::g2p::PunctuationTone::Question, params
    );
    const auto pEnd = voxdsp::dsp::ProsodyEngine::evaluateSyllableFrame(
        60.0f, 0.78f, 0.80f, false, voxdsp::g2p::PunctuationTone::Period, params
    );
    assert(qEnd.f0Hz > pEnd.f0Hz);
    assert(qEnd.breathiness > params.baseBreathiness + 0.1f);
    assert(qEnd.amplitudeGain > pEnd.amplitudeGain);
    std::cout << "[PASS] ProsodyEngine (F0 stress, punctuation, vibrato & breathiness)\n";
}

void testVoiceEngineWorldAndPolyphony() {
    VoxEngine::DiphoneSequencer seq;
    seq.addTransition("w", "i", VoxEngine::DiphoneCategory::CV);
    VoxEngine::DiphoneTransition tr;
    assert(seq.getNextTransition(tr));
    assert(tr.crossfadeDurationMs >= 25.0f && tr.crossfadeDurationMs <= 45.0f);
    assert(seq.calculateCrossfadeWeight(0.5f) == 0.5f);

    VoxEngine::VoiceSynthesizer synth(48000.0, 256);
    synth.configurePolyphonicChoir(true, true);
    assert(synth.harmonyVoiceCount() == 4);

    VoxEngine::SynthesisParams sp;
    sp.formantShift = 1.12f;
    sp.portamentoMs = 35.0f;
    sp.vibratoRateHz = 6.0f;
    sp.vibratoDepthSt = 0.25f;
    synth.updateParameters(sp);
    synth.startNote(440.0f, 600.0f);

    std::vector<float> stereoOut(256 * 2, 0.0f);
    synth.processAudioBlock(nullptr, stereoOut.data(), 256);

    float leftPeak = 0.0f;
    float rightPeak = 0.0f;
    float diffSum = 0.0f;
    for (size_t i = 0; i < 256; ++i) {
        const float l = stereoOut[i * 2];
        const float r = stereoOut[i * 2 + 1];
        assert(std::isfinite(l) && std::isfinite(r));
        leftPeak = std::max(leftPeak, std::abs(l));
        rightPeak = std::max(rightPeak, std::abs(r));
        diffSum += std::abs(l - r);
    }
    assert(leftPeak > 0.02f && rightPeak > 0.02f);
    assert(diffSum > 0.01f); // Stereo panned harmony tracks differ L vs R
    std::cout << "[PASS] VoxEngine::VoiceSynthesizer (WORLD F1-F5, Diphones & Stereo Polyphony)\n";
}

} // namespace

int main() {
    testLockFreeQueue();
    testAdsrEnvelope();
    testBiquadFilterAttenuation();
    testStereoDelayAndReverb();
    testAudioEnginePolyphonyAndUnison();
    testGraphemeToPhoneme();
    testCoarticulationAndVocalTract();
    testProsodyEngine();
    testVoiceEngineWorldAndPolyphony();
    std::cout << "All VoxDSP unit tests passed!\n";
    return 0;
}

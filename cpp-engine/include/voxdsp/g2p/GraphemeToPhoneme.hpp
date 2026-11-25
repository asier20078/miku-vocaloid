#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace voxdsp::g2p {

enum class Language : uint8_t {
    Auto,
    Spanish,
    English
};

enum class PhonemeManner : uint8_t {
    Silence,
    Vowel,
    Plosive,
    Fricative,
    Affricate,
    Nasal,
    Liquid,
    Trill
};

enum class PunctuationTone : uint8_t {
    None,
    Comma,
    Period,
    Question,
    Exclamation
};

struct PhonemeSpec {
    std::string ipa;
    PhonemeManner manner = PhonemeManner::Vowel;
    bool voiced = true;
    float f1 = 730.0f;
    float f2 = 1090.0f;
    float f3 = 2440.0f;
    float bw1 = 80.0f;
    float bw2 = 110.0f;
    float bw3 = 160.0f;
    float antiResonanceHz = 0.0f;   // Zero/notch frequency for nasals (m, n, ɲ, ŋ)
    float noiseCenterHz = 0.0f;     // Bandpass center for fricatives/plosives
    float noiseQ = 2.0f;
    float closureMs = 0.0f;         // Occlusion duration for plosives/affricates
    float burstMs = 0.0f;           // Release burst duration
    float trillRateHz = 0.0f;       // >0 for rolled 'r' (rr)
    float relativeDuration = 1.0f;
};

struct SyllableG2P {
    std::string text;
    std::string ipaDisplay;
    bool isStressed = false;
    bool isWordEnd = false;
    PunctuationTone punctuation = PunctuationTone::None;
    std::vector<PhonemeSpec> phonemes;
};

class GraphemeToPhoneme {
public:
    static std::vector<SyllableG2P> convertText(
        const std::string& text,
        Language lang = Language::Auto
    );

    static Language detectWordLanguage(const std::string& word);
    static PhonemeSpec lookupIpa(const std::string& ipa);
};

} // namespace voxdsp::g2p

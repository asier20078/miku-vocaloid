#include "voxdsp/g2p/GraphemeToPhoneme.hpp"

#include <algorithm>
#include <cctype>
#include <sstream>

namespace voxdsp::g2p {

namespace {

std::string toLowerAscii(const std::string& s) {
    std::string out = s;
    for (char& ch : out) {
        ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
    }
    return out;
}

bool isAsciiVowel(char ch) {
    const char c = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
    return c == 'a' || c == 'e' || c == 'i' || c == 'o' || c == 'u';
}

bool containsUtf8(const std::string& s, const char* needle) {
    return s.find(needle) != std::string::npos;
}

std::string normalizeSpanishUtf8(const std::string& input, int& outExplicitStressCharIdx) {
    outExplicitStressCharIdx = -1;
    int nonHyphenLen = 0;
    std::string out;
    for (size_t i = 0; i < input.size(); ++i) {
        const unsigned char b = static_cast<unsigned char>(input[i]);
        if (b == '-') {
            out.push_back('-');
            continue;
        }
        if (b == 0xC3 && i + 1 < input.size()) {
            const unsigned char next = static_cast<unsigned char>(input[i + 1]);
            // UTF-8 lowercase/uppercase Spanish accented vowels and ñ/ü
            if (next == 0xA1 || next == 0x81) { outExplicitStressCharIdx = nonHyphenLen; out.push_back('a'); nonHyphenLen += 1; ++i; continue; }
            if (next == 0xA9 || next == 0x89) { outExplicitStressCharIdx = nonHyphenLen; out.push_back('e'); nonHyphenLen += 1; ++i; continue; }
            if (next == 0xAD || next == 0x8D) { outExplicitStressCharIdx = nonHyphenLen; out.push_back('i'); nonHyphenLen += 1; ++i; continue; }
            if (next == 0xB3 || next == 0x93) { outExplicitStressCharIdx = nonHyphenLen; out.push_back('o'); nonHyphenLen += 1; ++i; continue; }
            if (next == 0xBA || next == 0x9A) { outExplicitStressCharIdx = nonHyphenLen; out.push_back('u'); nonHyphenLen += 1; ++i; continue; }
            if (next == 0xBC || next == 0x9C) { out.push_back('u'); nonHyphenLen += 1; ++i; continue; } // ü
            if (next == 0xB1 || next == 0x91) { out.append("ny"); nonHyphenLen += 2; ++i; continue; } // ñ -> marker
        }
        out.push_back(static_cast<char>(std::tolower(b)));
        nonHyphenLen += 1;
    }
    return out;
}

PunctuationTone extractPunctuation(std::string& word) {
    PunctuationTone tone = PunctuationTone::None;
    while (!word.empty()) {
        const char back = word.back();
        if (back == '?') { tone = PunctuationTone::Question; word.pop_back(); }
        else if (back == '!') { tone = PunctuationTone::Exclamation; word.pop_back(); }
        else if (back == '.') { tone = PunctuationTone::Period; word.pop_back(); }
        else if (back == ',' || back == ';') { tone = PunctuationTone::Comma; word.pop_back(); }
        else if (back == '"' || back == '\'' || back == ')' || back == ':') { word.pop_back(); }
        else break;
    }
    while (!word.empty()) {
        const unsigned char front = static_cast<unsigned char>(word.front());
        if (front == '(' || front == '"' || front == '\'') {
            word.erase(word.begin());
        } else if (front == 0xC2 && word.size() >= 2 &&
                   (static_cast<unsigned char>(word[1]) == 0xBF || static_cast<unsigned char>(word[1]) == 0xA1)) {
            word.erase(0, 2); // ¿ or ¡
        } else {
            break;
        }
    }
    return tone;
}

std::vector<std::string> syllabifyAscii(const std::string& w, bool isEnglish = false) {
    if (w.find('-') != std::string::npos) {
        std::vector<std::string> manual;
        std::stringstream ss(w);
        std::string part;
        while (std::getline(ss, part, '-')) {
            if (!part.empty()) manual.push_back(part);
        }
        if (!manual.empty()) return manual;
    }

    const size_t effectiveLen =
        (isEnglish && w.size() >= 4 && w.back() == 'e' &&
         !isAsciiVowel(w[w.size() - 2]) && isAsciiVowel(w[w.size() - 3]))
        ? (w.size() - 1)
        : w.size();

    struct Nucleus { size_t start; size_t end; };
    std::vector<Nucleus> nuclei;
    for (size_t i = 0; i < effectiveLen; ++i) {
        if (isAsciiVowel(w[i])) {
            if (!nuclei.empty() && i == nuclei.back().end + 1) {
                nuclei.back().end = i;
            } else {
                nuclei.push_back({i, i});
            }
        }
    }

    if (nuclei.size() <= 1) {
        return {w};
    }

    std::vector<std::string> out;
    size_t cursor = 0;
    for (size_t n = 0; n + 1 < nuclei.size(); ++n) {
        const size_t currEnd = nuclei[n].end;
        const size_t nextStart = nuclei[n + 1].start;
        const size_t cSpan = nextStart - currEnd - 1;
        size_t splitAt = currEnd + 1;
        if (cSpan >= 2) {
            const std::string pair = w.substr(nextStart - 2, 2);
            const bool cluster = (pair == "br" || pair == "cr" || pair == "dr" || pair == "fr" ||
                                  pair == "gr" || pair == "pr" || pair == "tr" || pair == "bl" ||
                                  pair == "cl" || pair == "fl" || pair == "gl" || pair == "pl" ||
                                  pair == "ch" || pair == "ll" || pair == "rr" || pair == "th" ||
                                  pair == "sh" || pair == "qu" || pair == "gu" || pair == "ny");
            splitAt = (cSpan == 2 && cluster) ? (currEnd + 1) : (currEnd + 2);
        }
        out.push_back(w.substr(cursor, splitAt - cursor));
        cursor = splitAt;
    }
    if (cursor < w.size()) {
        out.push_back(w.substr(cursor));
    }
    return out;
}

std::vector<std::string> spanishSyllableToIpa(const std::string& s, bool wordStart) {
    std::vector<std::string> ipa;
    for (size_t i = 0; i < s.size(); ++i) {
        const char c = s[i];
        const char next = (i + 1 < s.size()) ? s[i + 1] : '\0';

        if (c == 'c' && next == 'h') { ipa.push_back("tʃ"); ++i; continue; }
        if (c == 'l' && next == 'l') { ipa.push_back("ʝ"); ++i; continue; }
        if (c == 'r' && next == 'r') { ipa.push_back("r"); ++i; continue; }
        if (c == 'n' && next == 'y') { ipa.push_back("ɲ"); ++i; continue; }
        if (c == 'q' && next == 'u') { ipa.push_back("k"); ++i; continue; }
        if (c == 'g' && next == 'u' && (i + 2 < s.size()) && (s[i + 2] == 'e' || s[i + 2] == 'i')) {
            ipa.push_back("g");
            ++i;
            continue;
        }
        if (c == 'h') continue; // Silent h in Spanish
        if (c == 'c') {
            ipa.push_back((next == 'e' || next == 'i') ? "s" : "k");
            continue;
        }
        if (c == 'g') {
            ipa.push_back((next == 'e' || next == 'i') ? "x" : "g");
            continue;
        }
        if (c == 'j') { ipa.push_back("x"); continue; }
        if (c == 'z') { ipa.push_back("s"); continue; }
        if (c == 'v') { ipa.push_back("b"); continue; }
        if (c == 'y') { ipa.push_back(isAsciiVowel(next) ? "ʝ" : "i"); continue; }
        if (c == 'r') {
            ipa.push_back((wordStart && i == 0) ? "r" : "ɾ");
            continue;
        }
        ipa.emplace_back(1, c);
    }
    return ipa;
}

std::vector<std::string> englishSyllableToIpa(const std::string& s, bool isWordEnd) {
    std::vector<std::string> ipa;
    for (size_t i = 0; i < s.size(); ++i) {
        const char c = s[i];
        const char next = (i + 1 < s.size()) ? s[i + 1] : '\0';

        // Silent trailing 'e' in multi-letter English syllables (e.g. "make", "time")
        if (isWordEnd && c == 'e' && i == s.size() - 1 && s.size() >= 3 && !isAsciiVowel(s[i - 1])) {
            continue;
        }

        if (c == 's' && next == 'h') { ipa.push_back("ʃ"); ++i; continue; }
        if (c == 'c' && next == 'h') { ipa.push_back("tʃ"); ++i; continue; }
        if (c == 't' && next == 'h') { ipa.push_back("θ"); ++i; continue; }
        if (c == 'p' && next == 'h') { ipa.push_back("f"); ++i; continue; }
        if (c == 'n' && next == 'g') { ipa.push_back("ŋ"); ++i; continue; }
        if (c == 'n' && next == 'k') { ipa.push_back("ŋ"); ipa.push_back("k"); ++i; continue; }
        if (c == 'q' && next == 'u') { ipa.push_back("k"); ipa.push_back("w"); ++i; continue; }
        if (c == 'e' && next == 'e') { ipa.push_back("i"); ++i; continue; }
        if (c == 'e' && next == 'a') { ipa.push_back("i"); ++i; continue; }
        if (c == 'o' && next == 'o') { ipa.push_back("u"); ++i; continue; }
        if (c == 'a' && next == 'i') { ipa.push_back("e"); ipa.push_back("i"); ++i; continue; }
        if (c == 'j') { ipa.push_back("dʒ"); continue; }
        if (c == 'c') { ipa.push_back((next == 'e' || next == 'i' || next == 'y') ? "s" : "k"); continue; }
        if (c == 'y') { ipa.push_back(i == 0 ? "j" : "i"); continue; }
        if (c == 'r') { ipa.push_back("ɾ"); continue; }
        if (c == 'a' && next == '\0' && s.size() == 1) { ipa.push_back("ə"); continue; }
        ipa.emplace_back(1, c);
    }
    return ipa;
}

} // namespace

Language GraphemeToPhoneme::detectWordLanguage(const std::string& word) {
    const std::string lower = toLowerAscii(word);
    if (containsUtf8(word, "\xC3\xB1") || containsUtf8(word, "\xC3\xA1") ||
        containsUtf8(word, "\xC3\xA9") || containsUtf8(word, "\xC3\xAD") ||
        containsUtf8(word, "\xC3\xB3") || containsUtf8(word, "\xC3\xBA")) {
        return Language::Spanish;
    }
    if (lower.find("sh") != std::string::npos || lower.find("th") != std::string::npos ||
        lower.find("wh") != std::string::npos || lower.find("oo") != std::string::npos ||
        lower.find("ee") != std::string::npos || lower.find("ng") != std::string::npos ||
        lower.find('w') != std::string::npos || lower.find('k') != std::string::npos) {
        return Language::English;
    }
    return Language::Spanish;
}

PhonemeSpec GraphemeToPhoneme::lookupIpa(const std::string& ipa) {
    // Vowels
    if (ipa == "a") return {"a", PhonemeManner::Vowel, true, 760.f, 1180.f, 2520.f, 80.f, 110.f, 160.f, 0.f, 0.f, 2.f, 0.f, 0.f, 0.f, 1.15f};
    if (ipa == "e") return {"e", PhonemeManner::Vowel, true, 510.f, 1890.f, 2550.f, 70.f, 110.f, 160.f, 0.f, 0.f, 2.f, 0.f, 0.f, 0.f, 1.05f};
    if (ipa == "i") return {"i", PhonemeManner::Vowel, true, 310.f, 2320.f, 3020.f, 60.f, 120.f, 180.f, 0.f, 0.f, 2.f, 0.f, 0.f, 0.f, 1.00f};
    if (ipa == "o") return {"o", PhonemeManner::Vowel, true, 460.f, 840.f,  2580.f, 70.f, 100.f, 160.f, 0.f, 0.f, 2.f, 0.f, 0.f, 0.f, 1.10f};
    if (ipa == "u") return {"u", PhonemeManner::Vowel, true, 330.f, 710.f,  2490.f, 65.f, 95.f,  160.f, 0.f, 0.f, 2.f, 0.f, 0.f, 0.f, 1.05f};
    if (ipa == "ə") return {"ə", PhonemeManner::Vowel, true, 520.f, 1450.f, 2500.f, 85.f, 120.f, 170.f, 0.f, 0.f, 2.f, 0.f, 0.f, 0.f, 0.90f};

    // Voiceless Plosives (35-65ms closure + burst)
    if (ipa == "p") return {"p", PhonemeManner::Plosive, false, 400.f, 900.f,  2200.f, 90.f, 140.f, 200.f, 0.f, 950.f,  1.4f, 55.f, 18.f, 0.f, 0.35f};
    if (ipa == "t") return {"t", PhonemeManner::Plosive, false, 380.f, 1750.f, 2600.f, 90.f, 140.f, 200.f, 0.f, 3600.f, 1.8f, 48.f, 18.f, 0.f, 0.32f};
    if (ipa == "k") return {"k", PhonemeManner::Plosive, false, 350.f, 1400.f, 2300.f, 90.f, 140.f, 200.f, 0.f, 2100.f, 2.0f, 58.f, 22.f, 0.f, 0.36f};

    // Voiced Plosives (voice bar + shorter closure + softer burst)
    if (ipa == "b") return {"b", PhonemeManner::Plosive, true,  340.f, 900.f,  2200.f, 80.f, 120.f, 180.f, 0.f, 800.f,  1.4f, 42.f, 14.f, 0.f, 0.28f};
    if (ipa == "d") return {"d", PhonemeManner::Plosive, true,  330.f, 1700.f, 2600.f, 80.f, 120.f, 180.f, 0.f, 3000.f, 1.6f, 38.f, 14.f, 0.f, 0.26f};
    if (ipa == "g") return {"g", PhonemeManner::Plosive, true,  320.f, 1350.f, 2250.f, 80.f, 120.f, 180.f, 0.f, 1800.f, 1.8f, 44.f, 16.f, 0.f, 0.30f};

    // Fricatives (bandpass-filtered air noise)
    if (ipa == "s") return {"s", PhonemeManner::Fricative, false, 400.f, 1800.f, 2700.f, 120.f, 160.f, 200.f, 0.f, 5600.f, 2.8f, 0.f, 0.f, 0.f, 0.45f};
    if (ipa == "z") return {"z", PhonemeManner::Fricative, true,  380.f, 1700.f, 2600.f, 110.f, 150.f, 190.f, 0.f, 4900.f, 2.5f, 0.f, 0.f, 0.f, 0.42f};
    if (ipa == "f") return {"f", PhonemeManner::Fricative, false, 420.f, 1200.f, 2400.f, 120.f, 160.f, 200.f, 0.f, 3200.f, 1.2f, 0.f, 0.f, 0.f, 0.40f};
    if (ipa == "θ") return {"θ", PhonemeManner::Fricative, false, 410.f, 1450.f, 2500.f, 120.f, 160.f, 200.f, 0.f, 3800.f, 1.4f, 0.f, 0.f, 0.f, 0.38f};
    if (ipa == "ʃ") return {"ʃ", PhonemeManner::Fricative, false, 400.f, 1950.f, 2700.f, 120.f, 160.f, 200.f, 0.f, 3100.f, 2.6f, 0.f, 0.f, 0.f, 0.48f};
    if (ipa == "x") return {"x", PhonemeManner::Fricative, false, 480.f, 1250.f, 2400.f, 130.f, 170.f, 210.f, 0.f, 1900.f, 1.8f, 0.f, 0.f, 0.f, 0.42f};
    if (ipa == "h") return {"h", PhonemeManner::Fricative, false, 500.f, 1500.f, 2500.f, 150.f, 200.f, 250.f, 0.f, 2400.f, 0.9f, 0.f, 0.f, 0.f, 0.32f};
    if (ipa == "ʝ") return {"ʝ", PhonemeManner::Fricative, true,  320.f, 2100.f, 2900.f, 90.f,  130.f, 180.f, 0.f, 3400.f, 2.0f, 0.f, 0.f, 0.f, 0.34f};

    // Affricates (closure + sibilant release)
    if (ipa == "tʃ") return {"tʃ", PhonemeManner::Affricate, false, 380.f, 1950.f, 2750.f, 100.f, 140.f, 190.f, 0.f, 3500.f, 2.5f, 36.f, 45.f, 0.f, 0.46f};
    if (ipa == "dʒ") return {"dʒ", PhonemeManner::Affricate, true,  350.f, 1900.f, 2700.f, 95.f,  135.f, 185.f, 0.f, 3200.f, 2.2f, 32.f, 40.f, 0.f, 0.42f};

    // Nasals (low F1 murmur + antiresonance zero notch)
    if (ipa == "m") return {"m", PhonemeManner::Nasal, true, 280.f, 950.f,  2200.f, 65.f, 140.f, 190.f, 750.f,  0.f, 2.f, 0.f, 0.f, 0.f, 0.40f};
    if (ipa == "n") return {"n", PhonemeManner::Nasal, true, 290.f, 1550.f, 2450.f, 65.f, 140.f, 190.f, 1150.f, 0.f, 2.f, 0.f, 0.f, 0.f, 0.38f};
    if (ipa == "ɲ") return {"ɲ", PhonemeManner::Nasal, true, 285.f, 2050.f, 2750.f, 65.f, 140.f, 190.f, 1450.f, 0.f, 2.f, 0.f, 0.f, 0.f, 0.40f};
    if (ipa == "ŋ") return {"ŋ", PhonemeManner::Nasal, true, 275.f, 1150.f, 2350.f, 65.f, 140.f, 190.f, 1600.f, 0.f, 2.f, 0.f, 0.f, 0.f, 0.38f};

    // Liquids & Trills
    if (ipa == "l") return {"l", PhonemeManner::Liquid, true, 360.f, 1300.f, 2650.f, 75.f, 120.f, 180.f, 0.f, 0.f, 2.f, 0.f, 0.f, 0.f, 0.35f};
    if (ipa == "w") return {"w", PhonemeManner::Liquid, true, 320.f, 680.f,  2350.f, 70.f, 100.f, 170.f, 0.f, 0.f, 2.f, 0.f, 0.f, 0.f, 0.32f};
    if (ipa == "ɾ") return {"ɾ", PhonemeManner::Liquid, true, 390.f, 1380.f, 2100.f, 80.f, 130.f, 180.f, 0.f, 0.f, 2.f, 18.f, 8.f, 0.f, 0.25f};
    if (ipa == "r") return {"r", PhonemeManner::Trill,  true, 410.f, 1350.f, 2150.f, 85.f, 135.f, 180.f, 0.f, 0.f, 2.f, 0.f, 0.f, 26.0f, 0.50f};

    return lookupIpa("a");
}

std::vector<SyllableG2P> GraphemeToPhoneme::convertText(const std::string& text, Language lang) {
    std::vector<SyllableG2P> result;
    std::istringstream iss(text);
    std::string rawWord;

    while (iss >> rawWord) {
        std::string word = rawWord;
        const PunctuationTone punc = extractPunctuation(word);
        if (word.empty()) continue;

        const Language resolvedLang = (lang == Language::Auto) ? detectWordLanguage(word) : lang;
        int explicitStressChar = -1;
        const std::string ascii = normalizeSpanishUtf8(word, explicitStressChar);

        const std::vector<std::string> sylls = syllabifyAscii(ascii, resolvedLang == Language::English);
        if (sylls.empty()) continue;

        // Identify stressed syllable
        size_t stressedIdx = 0;
        if (resolvedLang == Language::Spanish) {
            if (explicitStressChar >= 0) {
                size_t offset = 0;
                for (size_t idx = 0; idx < sylls.size(); ++idx) {
                    const size_t endOff = offset + sylls[idx].size();
                    if (static_cast<size_t>(explicitStressChar) >= offset &&
                        static_cast<size_t>(explicitStressChar) < endOff) {
                        stressedIdx = idx;
                        break;
                    }
                    offset = endOff;
                }
            } else if (sylls.size() >= 2) {
                const char last = ascii.back();
                const bool endsVowelNS = isAsciiVowel(last) || last == 'n' || last == 's';
                stressedIdx = endsVowelNS ? (sylls.size() - 2) : (sylls.size() - 1);
            }
        } else {
            // English heuristic: first syllable unless common unstressed prefix
            stressedIdx = 0;
            if (sylls.size() >= 2 &&
                (sylls[0] == "un" || sylls[0] == "re" || sylls[0] == "in" || sylls[0] == "pre")) {
                stressedIdx = 1;
            }
        }

        for (size_t i = 0; i < sylls.size(); ++i) {
            const bool isStart = (i == 0);
            const bool isEnd = (i + 1 == sylls.size());

            const std::vector<std::string> ipas = (resolvedLang == Language::Spanish)
                ? spanishSyllableToIpa(sylls[i], isStart)
                : englishSyllableToIpa(sylls[i], isEnd);

            SyllableG2P entry;
            entry.text = sylls[i];
            entry.isStressed = (i == stressedIdx);
            entry.isWordEnd = isEnd;
            entry.punctuation = isEnd ? punc : PunctuationTone::None;

            for (size_t p = 0; p < ipas.size(); ++p) {
                if (p > 0) entry.ipaDisplay.push_back(' ');
                entry.ipaDisplay.append(ipas[p]);
                entry.phonemes.push_back(lookupIpa(ipas[p]));
            }
            if (entry.isStressed) {
                entry.ipaDisplay = "\xCB\x88" + entry.ipaDisplay; // IPA ˈ stress symbol
            }

            result.push_back(std::move(entry));
        }
    }

    return result;
}

} // namespace voxdsp::g2p

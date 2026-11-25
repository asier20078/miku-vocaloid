cmake_minimum_required(VERSION 3.20)
project(VoxDSP VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include(FetchContent)

# PortAudio v19.7.0 (static library)
set(PA_BUILD_SHARED OFF CACHE BOOL "" FORCE)
set(PA_BUILD_STATIC ON CACHE BOOL "" FORCE)
FetchContent_Declare(
    portaudio
    GIT_REPOSITORY https://github.com/PortAudio/portaudio.git
    GIT_TAG v19.7.0
)

# dr_libs (single-header dr_wav.h)
FetchContent_Declare(
    dr_libs
    GIT_REPOSITORY https://github.com/mackron/dr_libs.git
    GIT_TAG master
)

FetchContent_MakeAvailable(portaudio dr_libs)

add_library(voxdsp_core STATIC
    src/AudioEngine.cpp
    src/WavLoader.cpp
    src/PortAudioBackend.cpp
    src/GraphemeToPhoneme.cpp
    src/VoiceEngine.cpp
)

target_include_directories(voxdsp_core
    PUBLIC
        ${CMAKE_CURRENT_SOURCE_DIR}/include
        ${dr_libs_SOURCE_DIR}
)

target_link_libraries(voxdsp_core
    PUBLIC
        portaudio_static
)

if(MSVC)
    target_compile_options(voxdsp_core PRIVATE /W4)
else()
    target_compile_options(voxdsp_core PRIVATE -Wall -Wextra -Wpedantic)
endif()

add_executable(voxdsp_cli src/main.cpp)
target_link_libraries(voxdsp_cli PRIVATE voxdsp_core)

# Pure DSP & Engine unit tests (independent of audio hardware)
enable_testing()
add_executable(voxdsp_tests
    tests/dsp_tests.cpp
    src/AudioEngine.cpp
    src/WavLoader.cpp
    src/GraphemeToPhoneme.cpp
    src/VoiceEngine.cpp
)
target_include_directories(voxdsp_tests
    PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/include
        ${dr_libs_SOURCE_DIR}
)
add_test(NAME VoxDSPTests COMMAND voxdsp_tests)

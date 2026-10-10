cmake_minimum_required(VERSION 3.20)
project(ledmap_ndi_sender LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Example: cmake -S . -B build -DNDI_SDK_DIR="C:/Program Files/NDI/NDI 6 SDK"
if(NOT WIN32)
  message(FATAL_ERROR "This LedMAP NDI helper currently supports Windows only.")
endif()
if(NOT DEFINED NDI_SDK_DIR)
  message(FATAL_ERROR "Set NDI_SDK_DIR to the locally installed NDI 6 SDK directory.")
endif()
add_executable(ledmap-ndi-sender WIN32) 
# A console subsystem is required: stdin transports BGRA and stderr provides diagnostics.
set_target_properties(ledmap-ndi-sender PROPERTIES WIN32_EXECUTABLE FALSE)
target_sources(ledmap-ndi-sender PRIVATE main.cpp)
target_include_directories(ledmap-ndi-sender PRIVATE "${NDI_SDK_DIR}/Include")
target_link_libraries(ledmap-ndi-sender PRIVATE "${NDI_SDK_DIR}/Lib/x64/Processing.NDI.Lib.x64.lib")

cmake_minimum_required(VERSION 3.20)
project(ledmap_ndi_sender LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT WIN32)
  message(FATAL_ERROR "The NDI sender helper currently supports Windows x64 only.")
endif()
if(DEFINED NDI_SDK_DIR AND NOT DEFINED NDI_INCLUDE_DIR)
  set(NDI_INCLUDE_DIR "${NDI_SDK_DIR}/Include")
endif()
if(NOT DEFINED NDI_INCLUDE_DIR OR NOT EXISTS "${NDI_INCLUDE_DIR}/Processing.NDI.Lib.h")
  message(FATAL_ERROR "Set NDI_INCLUDE_DIR to NDI 6 headers (NDI SDK Include folder).")
endif()

add_executable(ledmap-ndi-sender main.cpp)
target_include_directories(ledmap-ndi-sender PRIVATE "${NDI_INCLUDE_DIR}")
# The NDI SDK runtime is resolved via LoadLibraryW at runtime.
# No NDI import .lib or redistributable binary is required at build time.

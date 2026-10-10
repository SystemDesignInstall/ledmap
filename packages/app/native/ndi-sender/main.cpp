// Build against the locally installed official NDI SDK. No NDI SDK files are vendored.
// stdin: consecutive tightly packed BGRA (width * height * 4) video frames.
// stdout: unused; stderr: READY / ERROR handshake and diagnostics.
#include <Processing.NDI.Lib.h>
#include <cstdint>
#include <iostream>
#include <limits>
#include <string>
#include <vector>

int main(int argc, char** argv) {
  if (argc != 5) {
    std::cerr << "ERROR Expected: ledmap-ndi-sender <name> <width> <height> <fps>\n";
    return 2;
  }
  const std::string name(argv[1]);
  int width = 0, height = 0, fps = 0;
  try {
    width = std::stoi(argv[2]);
    height = std::stoi(argv[3]);
    fps = std::stoi(argv[4]);
  } catch (...) {
    std::cerr << "ERROR Invalid NDI dimensions or frame rate\n";
    return 2;
  }
  if (name.empty() || width < 1 || height < 1 || width > 8192 || height > 8192 ||
      static_cast<std::uint64_t>(width) * height > 16777216 || (fps != 25 && fps != 30 && fps != 60)) {
    std::cerr << "ERROR Unsupported NDI output configuration\n";
    return 2;
  }
  if (!NDIlib_initialize()) {
    std::cerr << "ERROR NDI runtime failed to initialize\n";
    return 1;
  }
  NDIlib_send_create_t options = {};
  options.p_ndi_name = name.c_str();
  options.clock_video = false; // The Electron main process schedules frames.
  options.clock_audio = false;
  NDIlib_send_instance_t sender = NDIlib_send_create(&options);
  if (!sender) {
    std::cerr << "ERROR Unable to create NDI sender\n";
    NDIlib_destroy();
    return 1;
  }

  const auto byteCount = static_cast<std::size_t>(width) * height * 4;
  std::vector<std::uint8_t> pixels(byteCount);
  NDIlib_video_frame_v2_t frame = {};
  frame.xres = width;
  frame.yres = height;
  frame.FourCC = NDIlib_FourCC_type_BGRA;
  frame.frame_rate_N = fps;
  frame.frame_rate_D = 1;
  frame.picture_aspect_ratio = static_cast<float>(width) / static_cast<float>(height);
  frame.frame_format_type = NDIlib_frame_format_type_progressive;
  frame.timecode = NDIlib_send_timecode_synthesize;
  frame.p_data = pixels.data();
  frame.line_stride_in_bytes = width * 4;

  std::cerr << "READY\n" << std::flush;
  while (std::cin.read(reinterpret_cast<char*>(pixels.data()), static_cast<std::streamsize>(byteCount))) {
    // Synchronous send: the caller may reuse the buffer immediately afterwards.
    NDIlib_send_send_video_v2(sender, &frame);
  }
  NDIlib_send_destroy(sender);
  NDIlib_destroy();
  return 0;
}

# LedMAP NDI Output (Windows MVP)

This implementation **sends only**. It reuses the existing TestFrame and offscreen Electron renderer to output:
- one stream for the composition (minimal rectangle enclosing all Screens, including gaps and negative positions);
- a separately controllable stream for each Screen, at that Screen's physical pixel resolution.

Streams are session-only. They never become hardware Processor Ports. The Test Workspace pattern (including Screen drawings) is the source image.

## Build the native sender

The official NDI SDK and its redistributable/runtime are **not checked into this repository**. Read the NDI SDK license and redistribution terms before shipping.

With the NDI 6 SDK and Visual Studio C++ build tools installed on Windows, run:

```powershell
cmake -S packages/app/native/ndi-sender -B packages/app/native/ndi-sender/build -A x64 -DNDI_SDK_DIR="C:/Program Files/NDI/NDI 6 SDK"
cmake --build packages/app/native/ndi-sender/build --config Release
```

Set `LEDMAP_NDI_SENDER_PATH` to the absolute path of the resulting `ledmap-ndi-sender.exe` before starting LedMAP. For a **portable** Windows build, place `ledmap-ndi-sender.exe` directly next to `LedMAP-<version>-win-x64-portable.exe`; the portable launcher exposes that directory to LedMAP. A regular packaged build can also use `resources/ndi/ledmap-ndi-sender.exe`. The NDI runtime DLLs must be accessible according to the SDK's installation/redistribution instructions.

The application returns an explicit error if the helper is missing or the SDK cannot initialize; it does **not** falsely report that a stream is broadcasting.

## Data flow

```
TestFrame -> offscreen output.html (1:1 crop, black background)
          -> Electron BGRA image.toBitmap()
          -> bounded main-process frame cache, one per stream
          -> native helper stdin, one BGRA frame at a time
          -> NDIlib_send_send_video_v2()
```

The main process resends the most recent complete bitmap at 25/30/60 fps, including for static patterns. Backpressure drops frames rather than accumulating unbounded frame buffers. One native process is started for each NDI stream. All processes and offscreen windows are stopped when the editor closes.

## Limitations / future optimization

This first implementation uses CPU BGRA frame copies and pipes, so 4K60 with multiple simultaneous senders is likely expensive. A future release should use an in-process N-API sender or shared-texture pipeline, with performance tests on Windows. There is no NDI receiver, audio, alpha, recording, or per-cabinet output in this scope.

Check the stream in NDI Studio Monitor or another NDI receiver on the same network. Validate black gaps, stream identity after Screen rename, frame pacing, 1:1 pixels and multiple simultaneous outputs before release.

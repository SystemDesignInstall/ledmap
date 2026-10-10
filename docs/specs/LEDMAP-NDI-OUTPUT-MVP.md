# LedMAP NDI Output (Windows MVP)

This implementation **sends only**. It reuses the existing TestFrame and offscreen Electron renderer to output:
- one stream for the composition (minimal rectangle enclosing all Screens, including gaps and negative positions);
- a separately controllable stream for each Screen, at that Screen's physical pixel resolution.

Streams are session-only. They never become hardware Processor Ports. The Test Workspace pattern (including Screen drawings) is the source image.

## Build the native sender

NDI® is a registered trademark of Vizrt NDI AB. Official documentation: https://ndi.video/ and https://docs.ndi.video/.

## NDI-inclusive Windows portable

The GitHub Actions Windows job runs `scripts/build-ndi-windows.ps1`. It:
1. builds the native x64 NDI sender with Microsoft Visual C++ and the MIT-licensed NDI SDK headers;
2. downloads the official NDI 6 Runtime installer from `downloads.ndi.tv`;
3. extracts `Processing.NDI.Lib.x64.dll` and its matching `Processing.NDI.Lib.Licenses.txt`, and downloads the official NDI SDK license PDF;
4. stages all assets at `packages/app/build/ndi`, which Electron Builder includes in `resources/ndi` **inside the portable EXE**;
5. **fails the build** if any required NDI binary or notice is missing. It never silently emits a falsely named NDI-ready binary.

The portable executable runs without a separate NDI installation if the bundled runtime DLL loads successfully. Official NDI SDK/runtime binaries are never checked into the git repository.

A developer can run the same script on Windows PowerShell 7 with Visual Studio C++ tools, CMake, git and 7-Zip installed:

```powershell
pwsh -File scripts/build-ndi-windows.ps1
npm run package
```

For a manual SDK-based build, use:

```powershell
cmake -S packages/app/native/ndi-sender -B packages/app/native/ndi-sender/build -A x64 -DNDI_SDK_DIR="C:/Program Files/NDI/NDI 6 SDK"
cmake --build packages/app/native/ndi-sender/build --config Release
```

In local dev, place `Processing.NDI.Lib.x64.dll` next to the helper and set `LEDMAP_NDI_SENDER_PATH` to its absolute path. A portable build also recognizes an optional helper beside the portable EXE for diagnostic overrides.

Before publicly distributing this artifact, the product owner must ensure that the product EULA includes the restrictions required by the NDI SDK license and that the NDI SDK license and included third-party notices are legally sufficient. The licensing requirements are **not waived** by using official runtime binaries. See https://docs.ndi.video/all/developing-with-ndi/sdk/licensing and https://docs.ndi.video/all/developing-with-ndi/sdk/software-distribution.

The application reports an error if the helper is missing or the runtime cannot initialize; it does **not** falsely report that a stream is broadcasting.

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

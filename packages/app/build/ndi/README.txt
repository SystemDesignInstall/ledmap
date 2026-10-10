LedMAP bundled NDI runtime assets
---------------------------------
This directory is populated on the Windows GitHub Actions runner by
scripts/build-ndi-windows.ps1 from the official NDI Runtime redistribution.

The packaged version must contain:
  ledmap-ndi-sender.exe
  Processing.NDI.Lib.x64.dll
  Processing.NDI.Lib.Licenses.txt
  NDI-SDK-License-Agreement.pdf

The files must be shipped together. The NDI runtime is proprietary and its
license terms and notices must accompany redistribution.
NDI(R) is a registered trademark of Vizrt NDI AB.
https://ndi.video/

A source checkout does not include NDI binaries.

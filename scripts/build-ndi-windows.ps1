# Builds the Windows x64 NDI helper and stages the official redistributable
# inside the app's Electron Builder resources (build/ndi -> resources/ndi).
# No SDK executables or NDI binaries are checked in to LedMAP.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $IsWindows) { throw 'Windows runner required.' }

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$work = Join-Path $env:RUNNER_TEMP 'ledmap-ndi-build'
if (-not $env:RUNNER_TEMP) { $work = Join-Path $env:TEMP 'ledmap-ndi-build' }
$headersRepo = Join-Path $work 'ndi-headers'
$include = Join-Path $headersRepo 'lib/ndi'
$buildDir = Join-Path $work 'cmake'
$installer = Join-Path $work 'NDI-6-Runtime.exe'
$extract = Join-Path $work 'runtime-extracted'
$stage = Join-Path $repo 'packages/app/build/ndi'
New-Item -Type Directory -Force $work, $stage | Out-Null

Write-Host 'Checking out upstream SDK headers (NDI headers are MIT-licensed).'
& git clone --depth 1 --filter=blob:none --sparse 'https://github.com/DistroAV/DistroAV.git' $headersRepo
if ($LASTEXITCODE -ne 0) { throw 'Unable to download upstream NDI headers.' }
& git -C $headersRepo sparse-checkout set lib/ndi
if ($LASTEXITCODE -ne 0) { throw 'Unable to sparse-checkout NDI headers.' }
if (-not (Test-Path (Join-Path $include 'Processing.NDI.Lib.h'))) { throw 'NDI headers not found.' }

Write-Host 'Building LedMAP native NDI sender.'
& cmake -S (Join-Path $repo 'packages/app/native/ndi-sender') -B $buildDir -A x64 "-DNDI_INCLUDE_DIR=$include"
if ($LASTEXITCODE -ne 0) { throw 'NDI CMake configure failed.' }
& cmake --build $buildDir --config Release
if ($LASTEXITCODE -ne 0) { throw 'NDI C++ build failed.' }
$sender = Join-Path $buildDir 'Release/ledmap-ndi-sender.exe'
if (-not (Test-Path $sender)) { throw 'NDI sender executable not found.' }
Copy-Item $sender (Join-Path $stage 'ledmap-ndi-sender.exe') -Force

Write-Host 'Downloading the official NDI 6 Runtime redistributable.'
& curl.exe --fail --location --retry 3 --output $installer 'https://downloads.ndi.tv/SDK/NDI_SDK/NDI%206%20Runtime.exe'
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $installer)) { throw 'Official NDI Runtime download failed.' }
New-Item -Type Directory -Force $extract | Out-Null

# The official EXE is an installer. Extract its contained binaries on the CI
# runner, never perform a silent installation or alter the user's machine.
& 7z.exe x -y "-o$extract" $installer | Out-Null
if ($LASTEXITCODE -ne 0) { throw '7-Zip could not unpack the official NDI Runtime.' }
$dll = Get-ChildItem -Path $extract -Filter 'Processing.NDI.Lib.x64.dll' -Recurse -File | Sort-Object Length -Descending | Select-Object -First 1
$notices = Get-ChildItem -Path $extract -Filter 'Processing.NDI.Lib.Licenses.txt' -Recurse -File | Select-Object -First 1
if (-not $dll) { throw 'NDI DLL not present in extracted runtime. Cannot publish a purported NDI-ready build.' }
if (-not $notices) { throw 'NDI third-party rights notices missing. Refusing to redistribute DLL without notices.' }
Copy-Item $dll.FullName (Join-Path $stage $dll.Name) -Force
Copy-Item $notices.FullName (Join-Path $stage $notices.Name) -Force

Write-Host 'Downloading NDI SDK license agreement for inclusion next to runtime.'
$license = Join-Path $stage 'NDI-SDK-License-Agreement.pdf'
& curl.exe --fail --location --retry 3 --output $license 'https://downloads.ndi.tv/SDK/NDI_SDK/NDI%20SDK%20License%20Agreement.pdf'
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $license)) { throw 'Cannot distribute runtime without NDI license agreement.' }
Write-Host "NDI helper, DLL, license and third-party notices staged at: $stage"
Get-ChildItem $stage | Select-Object Name, Length | Format-Table

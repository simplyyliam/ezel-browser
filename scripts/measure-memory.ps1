<#
.SYNOPSIS
  Measures Ezel's memory: the app plus every WebView2 process it started, in fixed scenarios.

.DESCRIPTION
  Needs a release build with the measurement hook (it opens tabs without clicks):
    npx tauri build --no-bundle --features perf
  (`npm run tauri` is mapped to `tauri dev` in package.json, so call the CLI directly.)
  Then, from the repo root:
    powershell -ExecutionPolicy Bypass -File scripts/measure-memory.ps1
  Each scenario launches Ezel, waits, samples the whole process tree 3 times and keeps the median,
  then closes Ezel. A perf build uses a throwaway session (<app data>\ezel-perf), never yours.
  Refuses to start while Ezel is running (never two instances).

  Memory columns:
    Private WS  = private working set: what Task Manager's "Memory" column shows.
    Private     = private bytes (committed memory, what Ezel's load meter reports).
  Sites load from the network, so numbers move by a few percent between runs: compare medians.

.PARAMETER Runs
  Runs per scenario (median of the run medians is reported).
.PARAMETER Scenarios
  Any of: launched, ui-only, 1tab, 5tabs, 10tabs, idle5min.
#>
param(
  [string]$Exe = (Join-Path $PSScriptRoot "..\src-tauri\target\release\app.exe"),
  [int]$Runs = 2,
  [string[]]$Scenarios = @("launched", "1tab", "5tabs", "10tabs", "idle5min"),
  [int]$SettleSeconds = 20,
  [int]$IdleSeconds = 330,
  [string]$Label = "",
  [string]$OutFile = ""
)

$ErrorActionPreference = "Stop"
$Exe = (Resolve-Path $Exe).Path
# `-File` passes "a,b,c" as one string: accept both that and a real list.
$Scenarios = @($Scenarios | ForEach-Object { $_ -split "," } | Where-Object { $_ })

# Fixed, mostly static sites, so runs are comparable. Real pages: a measurement needs real renderers.
$Urls = @(
  "https://example.com/",
  "https://www.wikipedia.org/",
  "https://developer.mozilla.org/en-US/",
  "https://news.ycombinator.com/",
  "https://www.rust-lang.org/",
  "https://tauri.app/",
  "https://www.w3.org/",
  "https://react.dev/",
  "https://vite.dev/",
  "https://github.com/"
)

function Get-EzelProcesses {
  Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $Exe }
}

# The app and everything below it (WebView2's browser process is the app's child; its renderers,
# GPU and utility processes are the browser's children).
function Get-Tree([int]$RootId) {
  $all = Get-CimInstance Win32_Process
  $ids = New-Object System.Collections.Generic.List[int]
  $ids.Add($RootId)
  $i = 0
  while ($i -lt $ids.Count) {
    $parent = $ids[$i]
    foreach ($p in $all) { if ($p.ParentProcessId -eq $parent -and -not $ids.Contains([int]$p.ProcessId)) { $ids.Add([int]$p.ProcessId) } }
    $i++
  }
  $all | Where-Object { $ids.Contains([int]$_.ProcessId) }
}

function Get-Kind($p) {
  if ($p.ExecutablePath -eq $Exe) { return "app" }
  if ($p.CommandLine -match "--type=([a-z-]+)") {
    $t = $Matches[1]
    if ($t -eq "renderer") { return "renderer" }
    if ($t -eq "gpu-process") { return "gpu" }
    if ($t -eq "utility") { return "utility" }
    return $t
  }
  return "browser"
}

function Measure-Tree([int]$RootId) {
  $tree = @(Get-Tree $RootId)
  $ids = $tree | ForEach-Object { [int]$_.ProcessId }
  $perf = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { $ids -contains [int]$_.IDProcess }
  $privateWs = ($perf | Measure-Object -Property WorkingSetPrivate -Sum).Sum
  $private = 0
  foreach ($id in $ids) { try { $private += (Get-Process -Id $id).PrivateMemorySize64 } catch {} }
  $kinds = @{}
  foreach ($p in $tree) { $k = Get-Kind $p; $kinds[$k] = 1 + [int]$kinds[$k] }
  $dirs = @($tree | Where-Object { $_.CommandLine -match '--user-data-dir="([^"]+)"' } | ForEach-Object { if ($_.CommandLine -match '--user-data-dir="([^"]+)"') { $Matches[1] } } | Sort-Object -Unique)
  [pscustomobject]@{
    PrivateWsMb = [math]::Round($privateWs / 1MB, 1)
    PrivateMb   = [math]::Round($private / 1MB, 1)
    Processes   = $tree.Count
    Renderers   = [int]$kinds["renderer"]
    Kinds       = ($kinds.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join " "
    DataDirs    = $dirs.Count
  }
}

function Get-Median([double[]]$values) {
  $s = $values | Sort-Object
  $n = $s.Count
  if ($n -eq 0) { return 0 }
  if ($n % 2) { return $s[[int](($n - 1) / 2)] }
  return ($s[$n / 2 - 1] + $s[$n / 2]) / 2
}

function Stop-Ezel($proc) {
  if (-not $proc.HasExited) {
    $null = $proc.CloseMainWindow()
    $null = $proc.WaitForExit(8000)
  }
  if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
  # WebView2's processes follow the app out; wait until they have, so the next run starts clean.
  for ($i = 0; $i -lt 30; $i++) {
    $left = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "msedgewebview2.exe" -and $_.CommandLine -match "webview-exe-name=app.exe" }
    if (-not $left) { break }
    Start-Sleep -Seconds 1
  }
}

function Invoke-Scenario([string]$Name) {
  switch ($Name) {
    "launched" { $tabs = ""; $wait = $SettleSeconds }
    "ui-only" { $tabs = "none"; $wait = $SettleSeconds }
    "1tab" { $tabs = ($Urls[0..0] -join ","); $wait = 1 + $SettleSeconds }
    "5tabs" { $tabs = ($Urls[0..4] -join ","); $wait = 5 + $SettleSeconds }
    "10tabs" { $tabs = ($Urls[0..9] -join ","); $wait = 10 + $SettleSeconds }
    "idle5min" { $tabs = ($Urls[0..9] -join ","); $wait = 10 + $IdleSeconds }
    default { throw "unknown scenario $Name" }
  }
  if (Get-EzelProcesses) { throw "Ezel is already running: close it first (never two instances)." }
  $env:EZEL_PERF_URLS = $tabs
  $proc = Start-Process -FilePath $Exe -PassThru
  try {
    Start-Sleep -Seconds $wait
    if ($proc.HasExited) { throw "Ezel exited during '$Name' (exit code $($proc.ExitCode))." }
    $samples = 1..3 | ForEach-Object { if ($_ -gt 1) { Start-Sleep -Seconds 3 }; Measure-Tree $proc.Id }
  } finally {
    Stop-Ezel $proc
    Remove-Item Env:EZEL_PERF_URLS -ErrorAction SilentlyContinue
  }
  [pscustomobject]@{
    Scenario    = $Name
    PrivateWsMb = Get-Median ($samples | ForEach-Object { $_.PrivateWsMb })
    PrivateMb   = Get-Median ($samples | ForEach-Object { $_.PrivateMb })
    Processes   = $samples[-1].Processes
    Renderers   = $samples[-1].Renderers
    Kinds       = $samples[-1].Kinds
    DataDirs    = $samples[-1].DataDirs
  }
}

$results = @()
foreach ($scenario in $Scenarios) {
  $runResults = @()
  for ($r = 1; $r -le $Runs; $r++) {
    Write-Host "[$scenario] run $r of $Runs..."
    $one = Invoke-Scenario $scenario
    Write-Host ("  private WS {0} MB, private {1} MB, {2} processes ({3})" -f $one.PrivateWsMb, $one.PrivateMb, $one.Processes, $one.Kinds)
    $runResults += $one
  }
  $results += [pscustomobject]@{
    Scenario    = $scenario
    PrivateWsMb = Get-Median ($runResults | ForEach-Object { $_.PrivateWsMb })
    PrivateMb   = Get-Median ($runResults | ForEach-Object { $_.PrivateMb })
    Processes   = $runResults[-1].Processes
    Renderers   = $runResults[-1].Renderers
    Kinds       = $runResults[-1].Kinds
    DataDirs    = $runResults[-1].DataDirs
    Runs        = ($runResults | ForEach-Object { $_.PrivateWsMb }) -join " / "
  }
}

$lines = @()
if ($Label) { $lines += "### $Label"; $lines += "" }
$lines += "| Scenario | Private WS (MB) | Private bytes (MB) | Processes | Renderers | By kind | WebView2 data dirs | Private WS per run |"
$lines += "|---|---|---|---|---|---|---|---|"
foreach ($r in $results) {
  $lines += "| $($r.Scenario) | $($r.PrivateWsMb) | $($r.PrivateMb) | $($r.Processes) | $($r.Renderers) | $($r.Kinds) | $($r.DataDirs) | $($r.Runs) |"
}
$lines | ForEach-Object { Write-Output $_ }
if ($OutFile) { $lines | Set-Content -Path $OutFile -Encoding utf8 }

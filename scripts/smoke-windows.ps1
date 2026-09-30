$ErrorActionPreference = 'Stop'
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$executable = (Resolve-Path ('release/LingHui-' + $version + '-win-x64.exe')).Path
$report = Join-Path (Get-Location) 'release/smoke-result.json'
if (Test-Path $report) { Remove-Item $report }
$arguments = @('--smoke-test', ('--smoke-result="{0}"' -f $report))
$process = Start-Process -FilePath $executable -ArgumentList $arguments -PassThru
if (-not $process.WaitForExit(90000)) {
  Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  throw 'Packaged Windows app smoke test timed out.'
}
if (-not (Test-Path $report)) { throw 'Packaged app did not produce a smoke report.' }
$result = Get-Content $report -Raw | ConvertFrom-Json
Get-Content $report
if ($process.ExitCode -ne 0 -or -not $result.ok -or -not $result.modelInference) {
  throw 'Packaged app failed its page/configuration/model smoke test.'
}

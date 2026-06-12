$ErrorActionPreference = 'Continue'
try {
    $r = Invoke-WebRequest -Uri 'https://marketing.aliminlomasdelmar.com/api/webhooks/migrate-and-import?token=chris.2026' -Method GET -UseBasicParsing
    Write-Host "Status: $($r.StatusCode)"
    Write-Host "Body: $($r.Content)"
} catch {
    $e = $_.Exception
    Write-Host "Error: $($e.Message)"
}

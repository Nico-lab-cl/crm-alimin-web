$ErrorActionPreference = 'Continue'
try {
    $body = '{"email":"test_debug_jun8@alimin.cl","name":"Test Debug","phone":"+56999999999","formid":"test123","adname":"TestAd","adid":"ad123"}'
    $r = Invoke-WebRequest -Uri 'https://marketing.aliminlomasdelmar.com/api/leads/webhook/meta' -Method POST -ContentType 'application/json' -Body $body -UseBasicParsing
    Write-Host "Status: $($r.StatusCode)"
    Write-Host "Body: $($r.Content)"
} catch {
    $e = $_.Exception
    Write-Host "Error Status: $($e.Response.StatusCode)"
    $stream = $e.Response.GetResponseStream()
    $sr = New-Object System.IO.StreamReader($stream)
    Write-Host "Error Body: $($sr.ReadToEnd())"
}

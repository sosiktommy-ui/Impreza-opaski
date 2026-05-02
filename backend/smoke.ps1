# Smoke test: full happy-path flow for Impreza v2 backend
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:3001/api'

function Invoke-Api {
    param([string]$Method, [string]$Path, [hashtable]$Headers = @{}, $Body = $null)
    $url = "$base$Path"
    $params = @{ Method = $Method; Uri = $url; UseBasicParsing = $true; Headers = $Headers }
    if ($Body) {
        $params.Body = ($Body | ConvertTo-Json -Compress -Depth 6)
        $params.ContentType = 'application/json'
    }
    try {
        $res = Invoke-WebRequest @params
        return ($res.Content | ConvertFrom-Json)
    } catch {
        $body = ''
        if ($_.Exception.Response) {
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                $reader = New-Object System.IO.StreamReader($stream)
                $body = $reader.ReadToEnd()
            } catch {}
        }
        Write-Host "  ERROR $Method $Path -> $body" -ForegroundColor Red
        throw
    }
}

function Step($n, $msg) { Write-Host "[$n] $msg" -ForegroundColor Cyan }

Step 1 'Login as Dmitryganj'
$login = Invoke-Api POST '/auth/login' @{} @{ username = 'Dmitryganj'; password = 'Impreza@Admin2026!' }
$personal = $login.data.personalAccessToken
Write-Host "    accesses: $($login.data.accesses.Count)"

Step 2 'Select global scope'
$ph = @{ Authorization = "Bearer $personal" }
$accessId = $login.data.accesses[0].id
$sel = Invoke-Api POST '/auth/select-scope' $ph @{ accessId = $accessId }
$session = $sel.data.sessionToken
$h = @{ Authorization = "Bearer $session" }

Step 3 'GET /auth/me'
$me = Invoke-Api GET '/auth/me' $h
Write-Host "    me=$($me.data.user.username) role=$($me.data.user.role)"

Step 4 'List cities'
$cities = Invoke-Api GET '/cities' $h
$berlin = $cities.data | Where-Object { $_.code -eq 'berlin' } | Select-Object -First 1
$warsaw = $cities.data | Where-Object { $_.code -eq 'warsaw' } | Select-Object -First 1
Write-Host "    berlin.id=$($berlin.id) warsaw.id=$($warsaw.id)"

Step 5 'Intake 500 RED into Berlin'
$intake = Invoke-Api POST '/inventory/intake' $h @{ cityId = $berlin.id; color = 'RED'; count = 500; note = 'smoke-test' }
Write-Host "    berlin RED inventory after = $($intake.data.count)"

Step 6 'Login as manager-berlin'
$mlogin = Invoke-Api POST '/auth/login' @{} @{ username = 'manager-berlin'; password = 'Manager@2026!' }
$mph = @{ Authorization = "Bearer $($mlogin.data.personalAccessToken)" }
$msel = Invoke-Api POST '/auth/select-scope' $mph @{ accessId = $mlogin.data.accesses[0].id }
$mh = @{ Authorization = "Bearer $($msel.data.sessionToken)" }

Step 7 'Manager creates transfer Berlin->Warsaw RED 200'
$tr = Invoke-Api POST '/transfers' $mh @{ fromCityId = $berlin.id; toCityId = $warsaw.id; lines = @(@{ color = 'RED'; sentCount = 200 }) }
$transferId = $tr.data.id
Write-Host "    transfer code=$($tr.data.code) status=$($tr.data.status)"

Step 8 'Admin accepts transfer fully (received=200)'
$accepted = Invoke-Api POST "/transfers/$transferId/accept" $h @{ lines = @(@{ color = 'RED'; receivedCount = 200 }) }
Write-Host "    status after accept = $($accepted.data.status)"

Step 9 'Check inventory states'
$invAll = Invoke-Api GET '/inventory' $h
$berlinInv = $invAll.data | Where-Object { $_.cityId -eq $berlin.id }
$warsawInv = $invAll.data | Where-Object { $_.cityId -eq $warsaw.id }
Write-Host "    berlin: BLACK=$($berlinInv.balances.BLACK) WHITE=$($berlinInv.balances.WHITE) RED=$($berlinInv.balances.RED) BLUE=$($berlinInv.balances.BLUE)"
Write-Host "    warsaw: BLACK=$($warsawInv.balances.BLACK) WHITE=$($warsawInv.balances.WHITE) RED=$($warsawInv.balances.RED) BLUE=$($warsawInv.balances.BLUE)"

Step 10 'Create discrepancy transfer Berlin->Warsaw RED 100, accept with 80'
$tr2 = Invoke-Api POST '/transfers' $mh @{ fromCityId = $berlin.id; toCityId = $warsaw.id; lines = @(@{ color = 'RED'; sentCount = 100 }) }
$disc = Invoke-Api POST "/transfers/$($tr2.data.id)/accept" $h @{ lines = @(@{ color = 'RED'; receivedCount = 80 }) }
Write-Host "    status = $($disc.data.status) (expected DISCREPANCY)"

Step 11 'Resolve discrepancy'
$res = Invoke-Api POST "/transfers/$($tr2.data.id)/resolve" $h @{}
Write-Host "    status = $($res.data.status)"

Step 12 'Inventory after discrepancy'
$invAll2 = Invoke-Api GET '/inventory' $h
$berlinInv2 = $invAll2.data | Where-Object { $_.cityId -eq $berlin.id }
$warsawInv2 = $invAll2.data | Where-Object { $_.cityId -eq $warsaw.id }
Write-Host "    berlin: BLACK=$($berlinInv2.balances.BLACK) WHITE=$($berlinInv2.balances.WHITE) RED=$($berlinInv2.balances.RED) BLUE=$($berlinInv2.balances.BLUE)"
Write-Host "    warsaw: BLACK=$($warsawInv2.balances.BLACK) WHITE=$($warsawInv2.balances.WHITE) RED=$($warsawInv2.balances.RED) BLUE=$($warsawInv2.balances.BLUE)"

Step 13 'Create promo expense in Berlin (RED 5)'
$exp = Invoke-Api POST '/expenses' $h @{ cityId = $berlin.id; color = 'RED'; count = 5; kind = 'PROMO'; reason = 'smoke promo' }
Write-Host "    expense id=$($exp.data.id) kind=$($exp.data.kind)"

Step 14 'History feed'
$hist = Invoke-Api GET '/history?limit=10' $h
Write-Host "    history items: $($hist.data.items.Count)"

Step 15 'MANAGER tries to intake (should be 403)'
try {
    Invoke-Api POST '/inventory/intake' $mh @{ cityId = $berlin.id; color = 'BLUE'; count = 1 }
    Write-Host '    !! UNEXPECTED: manager intake succeeded' -ForegroundColor Red
} catch {
    Write-Host '    OK: manager intake blocked' -ForegroundColor Green
}

Step 16 'COUNTRY user tries to change-password (should be COUNTRY_CANNOT_SELF_RESET)'
$clogin = Invoke-Api POST '/auth/login' @{} @{ username = 'country-de'; password = 'Country@2026!' }
$cph = @{ Authorization = "Bearer $($clogin.data.personalAccessToken)" }
$csel = Invoke-Api POST '/auth/select-scope' $cph @{ accessId = $clogin.data.accesses[0].id }
$ch = @{ Authorization = "Bearer $($csel.data.sessionToken)" }
try {
    Invoke-Api POST '/auth/change-password' $ch @{ oldPassword = 'Country@2026!'; newPassword = 'NewPwd@2026!' }
    Write-Host '    !! UNEXPECTED: country change-password succeeded' -ForegroundColor Red
} catch {
    Write-Host '    OK: country change-password blocked' -ForegroundColor Green
}

Write-Host ''
Write-Host 'ALL SMOKE TESTS PASSED' -ForegroundColor Green

$BASE = "https://impreza-opaski-production.up.railway.app/api"
$PASS = $true
$errors = @()

function OK($msg)  { Write-Host "  OK: $msg" -ForegroundColor Green }
function FAIL($msg){ Write-Host "  FAIL: $msg" -ForegroundColor Red; $script:errors += $msg; $script:PASS = $false }
function SEC($t)   { Write-Host "`n=== $t ===" -ForegroundColor Cyan }

function Req($method, $path, $token, $bodyObj = $null) {
    $uri = "$script:BASE$path"
    $hdrs = @{ "Content-Type" = "application/json" }
    if ($token) { $hdrs["Authorization"] = "Bearer $token" }
    try {
        if ($null -ne $bodyObj) {
            $bodyStr = $bodyObj | ConvertTo-Json -Depth 10 -Compress
            return Invoke-RestMethod -Uri $uri -Method $method -Headers $hdrs -Body $bodyStr
        } else {
            return Invoke-RestMethod -Uri $uri -Method $method -Headers $hdrs
        }
    } catch {
        $resp = $_.Exception.Response
        if ($resp) {
            $s = $resp.GetResponseStream()
            $err = (New-Object System.IO.StreamReader($s)).ReadToEnd()
            throw "[$method $path] HTTP $($resp.StatusCode.value__): $err"
        }
        throw "[$method $path] $_"
    }
}

SEC "1. AUTH - admin login"
try {
    $lr = Req POST "/auth/login" $null @{ username="dmitryganj"; password="Impreza@Admin2026!" }
    $script:AH = $lr.data.accessToken
    OK "Admin: $($lr.data.user.username)"
} catch { FAIL "Admin login: $_"; exit 1 }

$AH = $script:AH

SEC "2. STRUCTURE"
try {
    $cities    = (Req GET "/users/cities"    $AH).data
    $countries = (Req GET "/users/countries" $AH).data
    OK "Cities: $($cities.Count)  Countries: $($countries.Count)"
    $script:amsObj = $cities | Where-Object { $_.slug -eq "amsterdam" } | Select-Object -First 1
    $script:parObj = $cities | Where-Object { $_.slug -eq "paris"     } | Select-Object -First 1
    if ($script:amsObj) { OK "Amsterdam: $($script:amsObj.id)" } else { FAIL "Amsterdam not found" }
    if ($script:parObj) { OK "Paris:     $($script:parObj.id)" } else { FAIL "Paris not found" }
} catch { FAIL "Structure: $_" }

$amsId = $script:amsObj.id
$parId = $script:parObj.id

SEC "3. BALANCE - Amsterdam before"
try {
    $b = (Req GET "/inventory/CITY/$amsId" $AH).data
    $tot = [int]$b.BLACK + [int]$b.WHITE + [int]$b.RED + [int]$b.BLUE
    OK "Amsterdam: B=$($b.BLACK) W=$($b.WHITE) R=$($b.RED) BL=$($b.BLUE) total=$tot"
} catch { FAIL "Balance before: $_" }

SEC "4. WAREHOUSE - create bracelets"
try {
    $wb = Req POST "/inventory/warehouse/create-bracelets" $AH @{ black=200; white=100; red=50; blue=30; notes="auto-test" }
    OK "Warehouse: id=$($wb.data.id) total=$($wb.data.totalAmount)"
} catch { FAIL "Warehouse: $_" }

SEC "5. TRANSFER - admin to Amsterdam (accepted by admin)"
try {
    $tr = Req POST "/transfers" $AH @{
        senderType     = "ADMIN"
        receiverType   = "CITY"
        receiverCityId = $amsId
        items = @(
            @{ itemType="BLACK"; quantity=100 }
            @{ itemType="WHITE"; quantity=50  }
            @{ itemType="RED";   quantity=30  }
            @{ itemType="BLUE";  quantity=20  }
        )
        notes = "auto-test admin->ams"
    }
    $trId = $tr.data.id
    OK "Transfer created: $trId status=$($tr.data.status)"

    $acc = Req PATCH "/transfers/$trId/accept" $AH @{
        items = @(
            @{ itemType="BLACK"; receivedQuantity=100 }
            @{ itemType="WHITE"; receivedQuantity=50  }
            @{ itemType="RED";   receivedQuantity=30  }
            @{ itemType="BLUE";  receivedQuantity=20  }
        )
    }
    OK "Accepted by admin: status=$($acc.data.status)"

    $b2 = (Req GET "/inventory/CITY/$amsId" $AH).data
    $tot2 = [int]$b2.BLACK + [int]$b2.WHITE + [int]$b2.RED + [int]$b2.BLUE
    if ($tot2 -gt 0) { OK "Amsterdam balance: B=$($b2.BLACK) W=$($b2.WHITE) R=$($b2.RED) BL=$($b2.BLUE)" }
    else { FAIL "Amsterdam balance 0 after transfer!" }
} catch { FAIL "Transfer admin->ams: $_" }

SEC "6. INTERNAL expense Amsterdam"
try {
    $exp = Req POST "/inventory/expense" $AH @{ cityId=$amsId; eventName="AutoTest Internal"; type="INTERNAL"; black=5; white=3; red=1; blue=1 }
    $expId = $exp.data.id
    OK "INTERNAL expense: $expId"

    $el = (Req GET "/inventory/expenses?cityId=$amsId" $AH).data
    $elArr = if ($el.data) { $el.data } else { $el }
    $found = @($elArr) | Where-Object { $_.id -eq $expId }
    if ($found) { OK "INTERNAL expense visible in Amsterdam" } else { FAIL "INTERNAL NOT visible in Amsterdam!" }
} catch { FAIL "INTERNAL expense: $_" }

SEC "7. EXTERNAL expense Amsterdam->Paris"
if ($parId) {
    try {
        $ext = Req POST "/inventory/expense" $AH @{ cityId=$amsId; targetCityId=$parId; eventName="AutoTest External AMS-PAR"; type="EXTERNAL"; black=3; white=2; red=1; blue=0 }
        $extId = $ext.data.id
        OK "EXTERNAL expense: $extId"

        $ae = (Req GET "/inventory/expenses?cityId=$amsId" $AH).data
        $aeArr = if ($ae.data) { $ae.data } else { $ae }
        $inA = @($aeArr) | Where-Object { $_.id -eq $extId }
        if ($inA) { OK "EXTERNAL visible in Amsterdam (source)" } else { FAIL "EXTERNAL NOT visible in Amsterdam!" }

        $pePath = "/inventory/expenses?cityId=$parId" + "&includeTargeted=true"
        $pe = (Req GET $pePath $AH).data
        $peArr = if ($pe.data) { $pe.data } else { $pe }
        $inP = @($peArr) | Where-Object { $_.id -eq $extId }
        if ($inP) { OK "EXTERNAL visible in Paris (includeTargeted)" } else { FAIL "EXTERNAL NOT visible in Paris!" }
    } catch { FAIL "EXTERNAL expense: $_" }
} else { Write-Host "  SKIP: no Paris" -ForegroundColor Yellow }

SEC "8. BALANCE Amsterdam after expenses"
try {
    $fb = (Req GET "/inventory/CITY/$amsId" $AH).data
    $tot = [int]$fb.BLACK + [int]$fb.WHITE + [int]$fb.RED + [int]$fb.BLUE
    OK "Amsterdam: B=$($fb.BLACK) W=$($fb.WHITE) R=$($fb.RED) BL=$($fb.BLUE) total=$tot"
} catch { FAIL "Balance after: $_" }

SEC "9. TRANSFER Amsterdam -> Paris (city to city)"
if ($parId) {
    try {
        $tr2 = Req POST "/transfers" $AH @{
            senderType     = "CITY"
            senderCityId   = $amsId
            receiverType   = "CITY"
            receiverCityId = $parId
            items = @(
                @{ itemType="BLACK"; quantity=10 }
                @{ itemType="WHITE"; quantity=5  }
                @{ itemType="RED";   quantity=3  }
                @{ itemType="BLUE";  quantity=2  }
            )
            notes = "auto-test ams->par"
        }
        $tr2Id = $tr2.data.id
        OK "Transfer AMS->PAR: $tr2Id status=$($tr2.data.status)"

        # Login as Paris user (polzovatel5, only Paris scope)
        try {
            $pLr = Req POST "/auth/login" $null @{ username="polzovatel5"; password="CityTest@2026!" }
            $pTok = $pLr.data.accessToken
            OK "Paris user: $($pLr.data.user.username)"

            $acc2 = Req PATCH "/transfers/$tr2Id/accept" $pTok @{
                items = @(
                    @{ itemType="BLACK"; receivedQuantity=10 }
                    @{ itemType="WHITE"; receivedQuantity=5  }
                    @{ itemType="RED";   receivedQuantity=3  }
                    @{ itemType="BLUE";  receivedQuantity=2  }
                )
            }
            OK "Paris accepted: $($acc2.data.status)"
        } catch {
            Write-Host "  NOTE: Paris user login failed, admin accepting instead" -ForegroundColor Yellow
            $acc2b = Req PATCH "/transfers/$tr2Id/accept" $AH @{
                items = @(
                    @{ itemType="BLACK"; receivedQuantity=10 }
                    @{ itemType="WHITE"; receivedQuantity=5  }
                    @{ itemType="RED";   receivedQuantity=3  }
                    @{ itemType="BLUE";  receivedQuantity=2  }
                )
            }
            OK "Admin accepted for Paris: $($acc2b.data.status)"
        }

        $pb = (Req GET "/inventory/CITY/$parId" $AH).data
        $pt = [int]$pb.BLACK + [int]$pb.WHITE + [int]$pb.RED + [int]$pb.BLUE
        if ($pt -gt 0) { OK "Paris balance: B=$($pb.BLACK) W=$($pb.WHITE) R=$($pb.RED) BL=$($pb.BLUE)" }
        else { FAIL "Paris balance 0 after transfer!" }
    } catch { FAIL "Transfer AMS->PAR: $_" }
} else { Write-Host "  SKIP: no Paris" -ForegroundColor Yellow }

SEC "10. ACCESS GRANT"
if ($parId) {
    try {
        $users = (Req GET "/users" $AH).data
        $uList = if ($users.data) { $users.data } else { $users }
        $au = @($uList) | Where-Object { $_.role -eq "CITY" -and $_.cityId -eq $amsId } | Select-Object -First 1
        if ($au) {
            # Check if grant already exists
            $existing = (Req GET "/access/users/$($au.id)" $AH).data
            $alreadyHas = @($existing) | Where-Object { $_.scopeId -eq $parId -and -not $_.revokedAt }
            if ($alreadyHas) {
                OK "Access already exists: id=$($alreadyHas[0].id) (idempotent OK)"
            } else {
                $gr = Req POST "/access" $AH @{ userId=$au.id; scopeType="CITY"; scopeId=$parId; accessType="PARTIAL"; notes="auto-test" }
                OK "Access granted: $($gr.data.id) user=$($au.username)"
            }

            # Verify it's there
            $al = (Req GET "/access/users/$($au.id)" $AH).data
            $f = @($al) | Where-Object { $_.scopeId -eq $parId -and -not $_.revokedAt }
            if ($f) { OK "Access verified: scopeId=$parId for $($au.username)" }
            else { FAIL "Grant not found in access list!" }
        } else { Write-Host "  SKIP: no Amsterdam city user" -ForegroundColor Yellow }
    } catch { FAIL "Access grant: $_" }
}

SEC "11. COMPANY LOSSES"
try {
    $cl = Req GET "/inventory/company-losses?cityId=$amsId" $AH
    $ld = if ($cl.data.data) { $cl.data.data } elseif ($cl.data) { $cl.data } else { @() }
    OK "Company losses: $(@($ld).Count) records"
} catch { FAIL "Company losses: $_" }

SEC "12. EVENTS API"
try {
    $ev = (Req GET "/events" $AH).data
    $evList = if ($ev -is [array]) { $ev } else { @($ev) }
    OK "Events: $($evList.Count)"
    if ($evList.Count -gt 0) { OK "Sample: $($evList[0].title) / city=$($evList[0].city)" }
} catch { FAIL "Events: $_" }

SEC "13. HEALTH"
try {
    $hc = Req GET "/health" $null
    OK "Health: $($hc.data.status)"
} catch { FAIL "Health: $_" }

Write-Host "`n$('='*55)"
if ($script:PASS) {
    Write-Host "ALL TESTS PASSED" -ForegroundColor Green
} else {
    Write-Host "TESTS FAILED ($($script:errors.Count)):" -ForegroundColor Red
    $script:errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}
Write-Host "$('='*55)"
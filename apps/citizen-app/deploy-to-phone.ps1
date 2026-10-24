$maxAttempts = 150
$attempt = 0
Write-Host "Watching for physical Android device over USB..."
while ($attempt -lt $maxAttempts) {
    $lines = (adb devices)
    $phone = $lines | Where-Object { $_ -match '\tdevice$' -and $_ -notmatch 'emulator' }
    if ($phone) {
        $firstPhone = if ($phone -is [array]) { $phone[0] } else { $phone }
        $devId = ($firstPhone -split "`t")[0].Trim()
        Write-Host "Connected device detected: $devId"
        Write-Host "Configuring port reverse tunnels (2000, 3210, 8081)..."
        adb -s $devId reverse tcp:2000 tcp:2000
        adb -s $devId reverse tcp:3210 tcp:3210
        adb -s $devId reverse tcp:8081 tcp:8081
        Write-Host "Installing latest apk-debug.apk..."
        $apkPath = Join-Path $PSScriptRoot "apk-debug.apk"
        $installOut = adb -s $devId install -r $apkPath
        Write-Host $installOut
        Write-Host "Launching app..."
        adb -s $devId shell monkey -p com.anonymous.efficitizen -c android.intent.category.LAUNCHER 1
        Write-Host "Effi Citizen installed and launched successfully on $devId"
        exit 0
    }
    $unauth = $lines | Where-Object { $_ -match '\tunauthorized$' }
    if ($unauth) {
        Write-Host "Device detected but unauthorized. Please tap 'Allow USB debugging' on phone screen."
    }
    Start-Sleep -Seconds 2
    $attempt++
}
Write-Host "Timed out waiting for physical device."

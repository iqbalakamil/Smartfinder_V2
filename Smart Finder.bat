@echo off
setlocal EnableExtensions EnableDelayedExpansion
title SMART FINDER - GitHub Launcher
mode con: cols=110 lines=32 >nul 2>&1

set "REPO_URL=https://github.com/iqbalakamil/Smartfinder_V2.git"
set "REPO_NAME=Smartfinder_V2"
set "REPO_DIR=%~dp0"

echo.
echo ===============================================
echo          SMART FINDER - AUTO UPDATE
echo ===============================================
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Git belum terinstall.
  echo Membuka halaman download Git...
  start "" "https://git-scm.com/download/win"
  echo Install Git, lalu jalankan LAUNCHER.bat kembali.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js belum terinstall.
  echo Membuka halaman download Node.js LTS...
  start "" "https://nodejs.org/en/download"
  echo Install Node.js LTS, lalu jalankan LAUNCHER.bat kembali.
  pause
  exit /b 1
)

where python >nul 2>&1
if errorlevel 1 (
  echo [WARNING] Python belum terinstall.
  echo Membuka halaman download Python...
  start "" "https://www.python.org/downloads/windows/"
  echo Install Python dengan opsi "Add Python to PATH", lalu jalankan kembali.
  pause
  exit /b 1
)

if not exist "%REPO_DIR%.git" (
  echo [INFO] Repository belum tersedia di folder ini.
  echo [INFO] Untuk penggunaan pertama, repository akan di-clone.
  cd /d "%~dp0"
  if exist "%REPO_NAME%\.git" (
    set "REPO_DIR=%~dp0%REPO_NAME%\"
  ) else (
    git clone --depth 1 "%REPO_URL%" "%REPO_NAME%"
    if errorlevel 1 (
      echo [ERROR] Clone gagal. Pastikan koneksi internet tersedia.
      pause
      exit /b 1
    )
    set "REPO_DIR=%~dp0%REPO_NAME%\"
  )
)

cd /d "%REPO_DIR%"
set "SAFE_REPO_DIR=%REPO_DIR:~0,-1%"
set "LOG_FILE=%REPO_DIR%launcher.log"
>> "%LOG_FILE%" echo.
>> "%LOG_FILE%" echo [%date% %time%] Smart Finder launcher started.
if exist ".git" (
  echo [INFO] Mengecek update dari GitHub...
  >> "%LOG_FILE%" echo [%date% %time%] Checking GitHub updates.
  git remote set-url origin "%REPO_URL%" >nul 2>&1
  git -c "safe.directory=%SAFE_REPO_DIR%" pull --ff-only
  if errorlevel 1 (
    >> "%LOG_FILE%" echo [%date% %time%] ERROR: GitHub update failed.
    echo [WARNING] Update gagal. Aplikasi lokal akan tetap dijalankan.
  )
  echo [OK] Update GitHub selesai.
)

set "GITHUB_VERSION="
set "GITHUB_COMMIT="
git -c "safe.directory=%SAFE_REPO_DIR%" fetch --tags --force origin >nul 2>&1
for /f "tokens=2 delims=/" %%V in ('git -c "safe.directory=%SAFE_REPO_DIR%" ls-remote --tags --sort=-version:refname origin "refs/tags/v*" 2^>nul') do if not defined GITHUB_VERSION set "GITHUB_VERSION=%%V"
if not defined GITHUB_VERSION for /f "delims=" %%V in ('git -c "safe.directory=%SAFE_REPO_DIR%" describe --tags --always --abbrev=0 2^>nul') do set "GITHUB_VERSION=%%V"
for /f "delims=" %%H in ('git -c "safe.directory=%SAFE_REPO_DIR%" rev-parse --short HEAD 2^>nul') do set "GITHUB_COMMIT=%%H"
if not defined GITHUB_VERSION set "GITHUB_VERSION=tanpa-tag"
if not defined GITHUB_COMMIT set "GITHUB_COMMIT=tidak-diketahui"
echo [INFO] Versi GitHub aktif: %GITHUB_VERSION% ^| commit %GITHUB_COMMIT%
>> "%LOG_FILE%" echo [%date% %time%] GitHub version %GITHUB_VERSION% ^| commit %GITHUB_COMMIT%.

if not exist "package.json" (
  echo [ERROR] package.json tidak ditemukan di folder aplikasi.
  pause
  exit /b 1
)

findstr /b /c:"TINYFISH_API_KEY=" ".env" >nul 2>&1
if errorlevel 1 (
  echo.
  echo [INFO] File .env belum ada di laptop ini.
  echo [INFO] API key tidak disimpan di GitHub. Masukkan API key TinyFish sekarang.
  set "TF_KEY="
  set /p "TF_KEY=TinyFish API key (kosongkan untuk lanjut tanpa AI): "
  if defined TF_KEY (
    > ".env" echo TINYFISH_API_KEY=!TF_KEY!
    >> ".env" echo PORT=3000
    >> ".env" echo TINYFISH_RESEARCH_TIMEOUT_MS=900000
    echo [OK] Konfigurasi TinyFish disimpan lokal di .env.
  ) else (
    echo [WARNING] Tanpa API key, studi AI akan memakai fallback lokal.
  )
)

echo [INFO] Memastikan dependency Node.js tersedia...
>> "%LOG_FILE%" echo [%date% %time%] Installing Node.js dependencies.
call npm install --no-audit --no-fund
if errorlevel 1 (
  >> "%LOG_FILE%" echo [%date% %time%] ERROR: npm install failed.
  echo [ERROR] Instalasi dependency Node.js gagal.
  pause
  exit /b 1
)

if not exist "node_modules\playwright\.local-chromium" (
  echo [INFO] Menyiapkan browser Playwright...
  >> "%LOG_FILE%" echo [%date% %time%] Installing Playwright Chromium.
  call npx playwright install chromium
  if errorlevel 1 (
    >> "%LOG_FILE%" echo [%date% %time%] WARNING: Playwright Chromium installation failed.
    echo [WARNING] Browser Playwright gagal disiapkan. Coba jalankan ulang launcher.
  )
)

set "APP_PORT="
for /f "delims=" %%P in ('powershell -NoProfile -Command "$port=3000; while (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { $port++ }; Write-Output $port"') do set "APP_PORT=%%P"
if not defined APP_PORT set "APP_PORT=3000"
set "PORT=%APP_PORT%"
echo [INFO] Port aplikasi: %PORT%
>> "%LOG_FILE%" echo [%date% %time%] Selected application port %PORT%.

rem Beri crawler Google Maps waktu sampai 10 menit; pipeline backend 11 menit.
rem Nilai environment ini mengalahkan default aplikasi tanpa mengubah .env.
set "POI_CRAWL_DEADLINE_MS=600000"
set "POI_GOOGLE_HOUSING_TIMEOUT_MS=660000"
>> "%LOG_FILE%" echo [%date% %time%] POI timeout: crawl 600000ms, pipeline 660000ms.

echo [INFO] Menjalankan Smart Finder...
>> "%LOG_FILE%" echo [%date% %time%] Starting Node.js application.
call node launch.js
if errorlevel 1 (
  >> "%LOG_FILE%" echo [%date% %time%] ERROR: Node.js application stopped.
  echo.
  echo [ERROR] Smart Finder berhenti sebelum browser terbuka.
  echo [INFO] Periksa pesan error di atas atau launcher.log.
)

echo.
echo [INFO] Smart Finder berhenti. Tekan tombol apa saja untuk menutup CMD.
pause >nul
endlocal
exit /b 0

:openChrome
set "CHROME_EXE="
for /f "delims=" %%C in ('where chrome.exe 2^>nul') do if not defined CHROME_EXE set "CHROME_EXE=%%C"
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%ProgramW6432%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramW6432%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if defined CHROME_EXE (
  start "" "%CHROME_EXE%" --new-window "%~1"
) else (
  echo [ERROR] Google Chrome tidak ditemukan di laptop ini.
  echo [INFO] Silakan install Google Chrome, lalu jalankan launcher kembali.
)
exit /b 0

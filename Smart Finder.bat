@echo off
setlocal EnableExtensions EnableDelayedExpansion
title SMART FINDER - GitHub Launcher
mode con: cols=110 lines=32 >nul 2>&1

set "REPO_URL=https://github.com/iqbalakamil/Smartfinder.git"
set "REPO_NAME=Smartfinder"
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
    git clone "%REPO_URL%" "%REPO_NAME%"
    if errorlevel 1 (
      echo.
      echo [ERROR] Clone gagal. Untuk repository private, login GitHub diperlukan.
      call :githubAuthHelp
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
  git -c "safe.directory=%SAFE_REPO_DIR%" pull --ff-only
  if errorlevel 1 (
    >> "%LOG_FILE%" echo [%date% %time%] ERROR: GitHub update failed.
    echo [ERROR] Update gagal. Periksa koneksi atau autentikasi GitHub.
    call :githubAuthHelp
    pause
    exit /b 1
  )
  echo [OK] Update GitHub selesai.
)

if not exist "package.json" (
  echo [ERROR] package.json tidak ditemukan di folder aplikasi.
  pause
  exit /b 1
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

:githubAuthHelp
echo.
echo [AKSI] Repository Smart Finder bersifat PRIVATE dan memerlukan akun GitHub.
echo [AKSI] Pilih akun Anda:
choice /C SN /N /M "Sudah punya akun GitHub? [S] Login / [N] Sign up: "
if errorlevel 2 (
  echo [INFO] Membuka halaman pendaftaran GitHub...
  start "" "https://github.com/signup"
) else (
  echo [INFO] Membuka halaman login GitHub...
  start "" "https://github.com/login"
)
echo [INFO] Setelah selesai, jalankan Smart Finder.bat kembali.
exit /b 0

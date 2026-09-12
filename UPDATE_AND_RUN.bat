@echo off
setlocal enabledelayedexpansion
title SMART FINDER - AUTO UPDATE & LAUNCHER
cd /d "%~dp0"
chcp 65001 >nul

:: Extract ANSI ESC Character
for /f "delims=" %%A in ('powershell -NoProfile -Command "[char]27"') do set "ESC=%%A"

set "C_CYAN=%ESC%[96m"
set "C_GREEN=%ESC%[92m"
set "C_YELLOW=%ESC%[93m"
set "C_RED=%ESC%[91m"
set "C_GRAY=%ESC%[90m"
set "C_WHITE=%ESC%[97;1m"
set "C_RESET=%ESC%[0m"

cls
echo.
echo %C_WHITE%  [⚡] SMART FINDER ENGINE - AUTO UPDATE%C_RESET%
echo %C_GRAY%  ────────────────────────────────────────────────────────────────────────────%C_RESET%
echo.

:: 1. Check Git Installation
echo %C_CYAN%  [STEP 01/02]%C_RESET% Memeriksa Git Version Control...
where git >nul 2>&1
if errorlevel 1 (
  echo %C_YELLOW%  [!] WARNING: Git tidak ditemukan di PATH! Update otomatis dilewati.%C_RESET%
  echo %C_GRAY%  [i] Menggunakan file lokal yang sudah ada...%C_RESET%
  echo.
  goto LAUNCH_APP
)

:: 2. Pull latest changes from GitHub
echo %C_GREEN%  [✔] Git terverifikasi.%C_RESET%
echo.
echo %C_CYAN%  [STEP 02/02]%C_RESET% Mengambil update terbaru dari GitHub (git pull)...
echo %C_GRAY%  ────────────────────────────────────────────────────────────────────────────%C_RESET%
echo.

git pull origin main

if errorlevel 1 (
  echo.
  echo %C_YELLOW%  [!] WARNING: Gagal melakukan git pull (mungkin offline atau remote belum di-set).%C_RESET%
  echo %C_GRAY%  [i] Aplikasi akan tetap dijalankan menggunakan versi lokal.%C_RESET%
  echo.
) else (
  echo.
  echo %C_GREEN%  [✔] Update GitHub selesai / sudah versi terbaru!%C_RESET%
  echo.
)

:LAUNCH_APP
echo %C_CYAN%  [LAUNCH]%C_RESET% Membuka Smart Finder Launcher...
echo %C_GRAY%  ────────────────────────────────────────────────────────────────────────────%C_RESET%
echo.

call LAUNCHER.bat

endlocal

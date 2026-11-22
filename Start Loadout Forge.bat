@echo off
title Loadout Forge
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Loadout Forge needs Node.js. Install the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)
node --max-old-space-size=4096 server/index.js --open
pause

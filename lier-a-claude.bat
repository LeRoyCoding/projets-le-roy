@echo off
cd /d "%~dp0"
title Projets Le Roy - Lier a Claude

where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js n'est pas installe sur ce PC : installez-le depuis https://nodejs.org/fr/download
  start "" "https://nodejs.org/fr/download"
  pause
  exit /b 1
)
node outils\lier-claude.js
echo.
pause

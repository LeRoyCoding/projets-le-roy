@echo off
cd /d "%~dp0"
title Projets Le Roy - Acces ChatGPT (laisser ouvert)

where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js n'est pas installe sur ce PC : lancez d'abord installer.bat
  pause
  exit /b 1
)
node outils\tunnel-chatgpt.js
echo.
pause

@echo off
cd /d "%~dp0"
title Projets Le Roy - Exporter les donnees pour OVH

where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js n'est pas installe sur ce PC : installez-le depuis https://nodejs.org/fr/download
  start "" "https://nodejs.org/fr/download"
  pause
  exit /b 1
)
echo.
echo  Cet outil copie vos donnees dans un fichier (export-ovh.sql).
echo  Vos donnees actuelles ne sont PAS modifiees.
echo.
if "%~1"=="" (
  node outils\exporter-vers-ovh.js
) else (
  node outils\exporter-vers-ovh.js "%~1"
)
echo.
pause

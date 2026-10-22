@echo off
cd /d "%~dp0"
title Projets Le Roy - Installation
echo.
echo  ===== Projets Le Roy : installation =====
echo.

where node >nul 2>nul
if errorlevel 1 goto pasdenode

node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 goto tropvieux

echo  Node.js est bien installe.
echo  Installation des composants, patientez...
echo.
call npm ci --omit=dev
if errorlevel 1 goto erreur

echo.
echo  ===== Installation terminee =====
echo  Double-cliquez maintenant sur demarrer.bat
echo.
pause
exit /b 0

:pasdenode
echo  Node.js n'est pas installe sur ce PC.
echo  La page de telechargement va s'ouvrir : prenez la version "LTS",
echo  installez-la avec les options par defaut, puis relancez installer.bat.
start "" "https://nodejs.org/fr/download"
echo.
pause
exit /b 1

:tropvieux
echo  La version de Node.js de ce PC est trop ancienne.
echo  Installez la derniere version "LTS", puis relancez installer.bat.
start "" "https://nodejs.org/fr/download"
echo.
pause
exit /b 1

:erreur
echo.
echo  L'installation a echoue. Verifiez la connexion Internet et reessayez.
pause
exit /b 1

@echo off
cd /d "%~dp0"
title Projets Le Roy - Demarrage

if not exist "node_modules\express" (
  echo  Les composants ne sont pas installes : lancez d'abord installer.bat
  pause
  exit /b 1
)
if not exist "donnees" mkdir "donnees"
if exist "donnees\arret-pour-mise-a-jour" del "donnees\arret-pour-mise-a-jour"

rem Deja lance ? On affiche simplement l'adresse.
if not exist "donnees\serveur.pid" goto lancer
set /p PID=<"donnees\serveur.pid"
tasklist /FI "PID eq %PID%" /FI "IMAGENAME eq node.exe" | find /i "node.exe" >nul
if not errorlevel 1 goto afficher

:lancer
rem Lance le serveur sans fenetre (le journal va dans donnees\serveur.log)
powershell -NoProfile -Command "Start-Process -FilePath 'node' -ArgumentList '--disable-warning=ExperimentalWarning','server\index.js' -WorkingDirectory '%~dp0.' -WindowStyle Hidden -RedirectStandardOutput '%~dp0donnees\serveur.log' -RedirectStandardError '%~dp0donnees\erreurs.log'"

:afficher
rem Au demarrage de Windows (option auto), on ne montre rien.
if /i "%~1"=="auto" exit /b 0
node server\adresse.js
pause

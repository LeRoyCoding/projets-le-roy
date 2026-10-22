@echo off
cd /d "%~dp0"
title Projets Le Roy - Arret
echo.
if not exist "donnees\serveur.pid" goto pasLance
set /p PID=<"donnees\serveur.pid"
tasklist /FI "PID eq %PID%" /FI "IMAGENAME eq node.exe" | find /i "node.exe" >nul
if errorlevel 1 goto pasLance
taskkill /PID %PID% /F >nul 2>nul
del "donnees\serveur.pid" >nul 2>nul
echo  L'application est arretee.
echo  Pour la relancer : demarrer-en-arriere-plan.bat
echo.
pause
exit /b 0

:pasLance
echo  L'application n'etait pas lancee.
echo.
pause

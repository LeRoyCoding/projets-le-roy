@echo off
cd /d "%~dp0"
title Projets Le Roy - Mise a jour
echo.
echo  ===== Projets Le Roy : mise a jour =====
echo  (la base de donnees n'est pas touchee)
echo.

where git >nul 2>nul
if errorlevel 1 goto pasdegit

rem 1. Arreter le serveur s'il tourne
if not exist "donnees\serveur.pid" goto recuperer
set /p PID=<"donnees\serveur.pid"
tasklist /FI "PID eq %PID%" /FI "IMAGENAME eq node.exe" | find /i "node.exe" >nul
if errorlevel 1 goto recuperer
echo  Arret du serveur...
echo arret> "donnees\arret-pour-mise-a-jour"
taskkill /PID %PID% /F >nul 2>nul
timeout /t 2 /nobreak >nul

:recuperer
rem 2. Recuperer la derniere version depuis GitHub
echo  Recuperation de la derniere version...
git pull --ff-only
if errorlevel 1 goto erreurgit

rem 3. Reinstaller les composants (au cas ou ils auraient change)
echo.
echo  Mise a jour des composants...
call npm ci --omit=dev
if errorlevel 1 goto erreurnpm

rem 4. Redemarrer le serveur en arriere-plan (sans fenetre)
echo.
echo  Redemarrage du serveur...
echo.
echo  ===== Mise a jour terminee =====
call "%~dp0demarrer-en-arriere-plan.bat"
exit /b 0

:pasdegit
echo  Git n'est pas installe sur ce PC : voir le README, etape 1.
pause
exit /b 1

:erreurgit
echo.
echo  La recuperation depuis GitHub a echoue (Internet ? fichiers modifies a la main ?).
echo  Le serveur va etre relance avec l'ancienne version.
call "%~dp0demarrer-en-arriere-plan.bat"
exit /b 1

:erreurnpm
echo.
echo  L'installation des composants a echoue. Verifiez Internet puis relancez mettre-a-jour.bat
pause
exit /b 1

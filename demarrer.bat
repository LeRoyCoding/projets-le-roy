@echo off
cd /d "%~dp0"
title Projets Le Roy - Serveur (laisser cette fenetre ouverte)

if not exist "node_modules\express" (
  echo  Les composants ne sont pas installes : lancez d'abord installer.bat
  pause
  exit /b 1
)
if exist "donnees\arret-pour-mise-a-jour" del "donnees\arret-pour-mise-a-jour"

node --disable-warning=ExperimentalWarning server\index.js

rem Arret demande par mettre-a-jour.bat : on ferme la fenetre sans attendre.
if exist "donnees\arret-pour-mise-a-jour" exit
echo.
echo  Le serveur s'est arrete. Relancez demarrer.bat pour le redemarrer.
pause

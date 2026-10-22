@echo off
cd /d "%~dp0"
title Projets Le Roy - Pare-feu

rem Ce reglage demande les droits administrateur : Windows va demander confirmation.
net session >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

netsh advfirewall firewall delete rule name="Projets Le Roy" >nul 2>&1
netsh advfirewall firewall add rule name="Projets Le Roy" dir=in action=allow protocol=TCP localport=3000 profile=private,domain >nul
if errorlevel 1 goto erreur

echo.
echo  C'est fait : les collegues du reseau du bureau peuvent se connecter
echo  a l'application (port 3000, reseaux prives uniquement).
echo.
echo  Si cela ne marche toujours pas : dans Parametres Windows ^> Reseau et Internet,
echo  verifiez que le Wi-Fi du bureau est bien en "Reseau prive".
echo.
pause
exit /b 0

:erreur
echo.
echo  Le reglage du pare-feu a echoue.
pause
exit /b 1

@echo off
cd /d "%~dp0"
set "LANCEUR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Projets Le Roy.bat"
> "%LANCEUR%" echo @echo off
>> "%LANCEUR%" echo start "Projets Le Roy - Serveur" /min "%~dp0demarrer.bat"
echo.
echo  C'est fait : le serveur demarrera tout seul a chaque ouverture de session Windows.
echo  (Pour annuler : double-cliquez sur desactiver-demarrage-auto.bat)
echo.
pause

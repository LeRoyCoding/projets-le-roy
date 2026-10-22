@echo off
cd /d "%~dp0"
set "LANCEUR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Projets Le Roy.bat"
> "%LANCEUR%" echo @echo off
>> "%LANCEUR%" echo call "%~dp0demarrer-en-arriere-plan.bat" auto
echo.
echo  C'est fait : l'application demarrera toute seule, sans fenetre,
echo  a chaque ouverture de session Windows.
echo  (Pour annuler : double-cliquez sur desactiver-demarrage-auto.bat)
echo.
pause

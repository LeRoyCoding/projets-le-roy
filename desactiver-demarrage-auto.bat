@echo off
set "LANCEUR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Projets Le Roy.bat"
if exist "%LANCEUR%" del "%LANCEUR%"
echo.
echo  Le demarrage automatique est desactive.
echo.
pause

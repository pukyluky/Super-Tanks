@echo off
cd /d "%~dp0"
echo Iniciando servidor de Tanques Tacticos 2D...
start "" http://localhost:3000
node server.js
pause

@echo off
setlocal
cd /d "%~dp0"
title LedMAP - dev
color 0B

where node >nul 2>&1
if errorlevel 1 (
  echo [LedMAP] Node.js не найден. Установи Node.js 24 LTS: https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [LedMAP] Зависимости не установлены, выполняю npm install...
  call npm.cmd install || goto :fail
)

echo [LedMAP] Запуск приложения...
call npm.cmd run dev
if errorlevel 1 goto :fail
exit /b 0

:fail
echo.
echo [LedMAP] Запуск завершился с ошибкой.
pause
exit /b 1

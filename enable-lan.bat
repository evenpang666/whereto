@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在为漫游whereto配置以太网局域网访问，需要 Windows 管理员授权。
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\enable-lan.ps1"
if errorlevel 1 (
  echo 配置未完成，请检查管理员授权。
) else (
  echo 配置完成，请使用主页底部的地址。
)
pause

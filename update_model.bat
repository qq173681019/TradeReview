@echo off
chcp 65001 >nul
echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║   TradeReview — 一键更新模型权重             ║
echo  ║   将 trade_model.json 写入 script.js         ║
echo  ╚══════════════════════════════════════════════╝
echo.

:: 切换到脚本所在目录（双击时工作目录可能不对）
cd /d "%~dp0"

:: 检查 trade_model.json 是否存在
if not exist "trade_model.json" (
    echo  ❌ 未找到 trade_model.json
    echo     请先在浏览器中点「导出」将模型保存到本目录
    echo.
    pause
    exit /b 1
)

:: 用 PowerShell 运行更新脚本（绕过执行策略限制）
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update_model.ps1"

if %ERRORLEVEL% neq 0 (
    echo.
    echo  ❌ 更新失败，请检查上方错误信息
    echo.
    pause
    exit /b 1
)

echo  ℹ️  刷新浏览器即可生效（F5）
echo.
pause

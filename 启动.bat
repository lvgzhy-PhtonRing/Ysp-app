@echo off
:: Step 1: Change Directory
d:
cd \Projects\ysp-app

:: Step 2: Start OpenCode GUI Client (已替换为 Windows 客户端路径)
echo Starting OpenCode GUI...
start "" "C:\Users\lvgzhy\AppData\Local\OpenCode\OpenCode.exe"

:: Step 3: Start OpenCode Server
echo Starting Server...
start /min "OpenCode-Server" opencode serve --hostname 127.0.0.1 --port 4096

:: Step 4: Wait
timeout /t 5 /nobreak >nul

:: Step 5: Start Chrome
echo Starting Chrome...
start chrome "http://localhost:5173"

:: Step 6: Start Vite
echo Starting Vite...
npm run dev

pause
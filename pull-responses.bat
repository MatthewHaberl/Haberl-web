@echo off
REM Double-click this to pull your dashboard "What's next" replies back into the vault.
REM Writes claude-obsidian\wiki\projects\plan-responses.md so Claude can read what you decided.
cd /d "%~dp0"
call npm run pull-responses
echo.
pause

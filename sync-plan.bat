@echo off
REM Double-click this to push the latest Haberl "what's next" list to the website dashboard.
REM Reads claude-obsidian\wiki\projects\recommendations.md (Haberl sections only) → Supabase.
cd /d "%~dp0"
call npm run sync-plan
echo.
pause

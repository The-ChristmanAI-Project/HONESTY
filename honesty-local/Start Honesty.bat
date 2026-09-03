@echo off
cd /d "%~dp0"
where py >nul 2>&1 && py -3 honesty.py && goto :eof
where python >nul 2>&1 && python honesty.py && goto :eof
where python3 >nul 2>&1 && python3 honesty.py && goto :eof
echo Honesty Local needs Python 3 on this computer.
echo Install it from https://www.python.org/downloads/ then double-click again.
pause

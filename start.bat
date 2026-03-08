@echo off
title VORTEX - Selfbot
color 0b
cls

echo.
echo  ██╗   ██╗ ██████╗ ██████╗ ████████╗███████╗██╗  ██╗
echo  ██║   ██║██╔═══██╗██╔══██╗╚══██╔══╝██╔════╝╚██╗██╔╝
echo  ██║   ██║██║   ██║██████╔╝   ██║   █████╗   ╚███╔╝
echo  ╚██╗ ██╔╝██║   ██║██╔══██╗   ██║   ██╔══╝   ██╔██╗
echo   ╚████╔╝ ╚██████╔╝██║  ██║   ██║   ███████╗██╔╝ ██╗
echo    ╚═══╝   ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
echo.
echo  Advanced Discord Selfbot  ^|  Dashboard v2.0.0
echo  ---------------------------------------------------
echo.

:: Nettoyer les fichiers parasites crees par Windows
if exist "Ctrl + C.txt" del /f /q "Ctrl + C.txt" >nul 2>&1
if exist "*.txt" del /f /q "*.txt" >nul 2>&1

:: Verifier Node.js
echo  [1/3] Verification de Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [ERREUR] Node.js n'est pas installe !
    echo  Telecharge-le sur : https://nodejs.org
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo  [OK] Node.js %NODE_VER% detecte
echo.

:: Verifier les dependances
echo  [2/3] Verification des dependances...
if not exist "node_modules" (
    echo  [INFO] node_modules introuvable - installation en cours...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo  [ERREUR] npm install a echoue.
        echo  Verifie ta connexion internet et reessaie.
        echo.
        pause
        exit /b 1
    )
    echo.
    echo  [OK] Dependances installees
) else (
    if not exist "node_modules\archiver" (
        echo  [INFO] Dependances incompletes - mise a jour en cours...
        echo.
        call npm install
        if %errorlevel% neq 0 (
            echo  [ERREUR] npm install a echoue.
            pause
            exit /b 1
        )
        echo  [OK] Dependances mises a jour
    ) else (
        echo  [OK] Toutes les dependances sont presentes
    )
)
echo.

:: Lancer Vortex
echo  [3/3] Demarrage de Vortex...
echo.
echo  ---------------------------------------------------
echo   Dashboard  ->  http://localhost:3000
echo   Stop       ->  Ctrl+C
echo  ---------------------------------------------------
echo.

node src/index.js

:: Nettoyage apres fermeture aussi
if exist "Ctrl + C.txt" del /f /q "Ctrl + C.txt" >nul 2>&1
if exist "*.txt" del /f /q "*.txt" >nul 2>&1

echo.
echo  ---------------------------------------------------
echo  [!] Vortex s'est arrete.
echo  ---------------------------------------------------
echo.
pause

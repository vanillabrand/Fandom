@echo off
REM Performance Optimization Testing Script (Windows)
REM Run this script to test all implemented optimizations

echo.
echo 🧪 Performance Optimization Testing Suite
echo ==========================================
echo.

REM Test 1: Database Indexes
echo 📊 Test 1: Database Indexes
echo ----------------------------
where npx >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Running index creation script...
    npx tsx server/scripts/create-performance-indexes.ts
    if %ERRORLEVEL% EQU 0 (
        echo ✅ Database indexes created successfully
    ) else (
        echo ❌ Database index creation failed
        echo    Make sure MongoDB is running and connected
    )
) else (
    echo ⚠️  npx not found, skipping database test
)
echo.

REM Test 2: AI Cache
echo 💰 Test 2: AI Cache System
echo ----------------------------
echo Checking if server is running...
curl -s http://localhost:3000 >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Server is running, testing AI cache...
    node server/scripts/test-ai-cache.js
    if %ERRORLEVEL% EQU 0 (
        echo ✅ AI cache test passed
    ) else (
        echo ❌ AI cache test failed
    )
) else (
    echo ⚠️  Server not running at http://localhost:3000
    echo    Start server with: npm run dev
    echo    Then run: node server/scripts/test-ai-cache.js
)
echo.

REM Test 3: Bundle Size
echo 📦 Test 3: Bundle Size
echo ----------------------------
echo Building production bundle...
call npm run build
if %ERRORLEVEL% EQU 0 (
    echo ✅ Build successful
    echo.
    echo Bundle sizes:
    dir /s dist\assets\*.js
    echo.
    echo Total dist size:
    dir /s dist
) else (
    echo ❌ Build failed
    echo    Check build errors and fix before testing
)
echo.

REM Summary
echo ==========================================
echo 📈 Testing Complete
echo ==========================================
echo.
echo Next steps:
echo 1. Review test results above
echo 2. Check validation_checklist.md for detailed testing
echo 3. Measure actual performance improvements
echo 4. Deploy to staging for real-world testing
echo.

pause

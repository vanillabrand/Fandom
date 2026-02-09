#!/bin/bash

# Performance Optimization Testing Script
# Run this script to test all implemented optimizations

echo "🧪 Performance Optimization Testing Suite"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Database Indexes
echo "📊 Test 1: Database Indexes"
echo "----------------------------"
if command -v npx &> /dev/null; then
    echo "Running index creation script..."
    npx tsx server/scripts/create-performance-indexes.ts
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Database indexes created successfully${NC}"
    else
        echo -e "${RED}❌ Database index creation failed${NC}"
        echo "   Make sure MongoDB is running and connected"
    fi
else
    echo -e "${YELLOW}⚠️  npx not found, skipping database test${NC}"
fi
echo ""

# Test 2: AI Cache
echo "💰 Test 2: AI Cache System"
echo "----------------------------"
echo "Checking if server is running..."
if curl -s http://localhost:3000 > /dev/null; then
    echo "Server is running, testing AI cache..."
    node server/scripts/test-ai-cache.js
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ AI cache test passed${NC}"
    else
        echo -e "${RED}❌ AI cache test failed${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Server not running at http://localhost:3000${NC}"
    echo "   Start server with: npm run dev"
    echo "   Then run: node server/scripts/test-ai-cache.js"
fi
echo ""

# Test 3: Bundle Size
echo "📦 Test 3: Bundle Size"
echo "----------------------------"
echo "Building production bundle..."
npm run build
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Build successful${NC}"
    echo ""
    echo "Bundle sizes:"
    ls -lh dist/assets/*.js | awk '{print "  " $9 ": " $5}'
    echo ""
    echo "Total dist size:"
    du -sh dist
else
    echo -e "${RED}❌ Build failed${NC}"
    echo "   Check build errors and fix before testing"
fi
echo ""

# Summary
echo "=========================================="
echo "📈 Testing Complete"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Review test results above"
echo "2. Check validation_checklist.md for detailed testing"
echo "3. Measure actual performance improvements"
echo "4. Deploy to staging for real-world testing"
echo ""

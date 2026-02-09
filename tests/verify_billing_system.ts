/**
 * Quick Billing System Verification Script
 * 
 * Verifies key billing APIs are functioning correctly
 * Run: npx tsx tests/verify_billing_system.ts
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:5000/api';
let authToken = '';

// Colors for console output
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};

function log(message: string, color: string = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

async function getAuthToken(): Promise<string> {
    // You'll need to manually set this with a valid JWT token
    // Or implement auto-login here
    const token = process.env.TEST_AUTH_TOKEN || process.env.AUTH_TOKEN;
    if (!token) {
        throw new Error('No AUTH_TOKEN found. Set TEST_AUTH_TOKEN environment variable.');
    }
    return token;
}

async function testEndpoint(
    name: string,
    method: string,
    endpoint: string,
    expectedStatus: number = 200,
    body?: any
): Promise<any> {
    try {
        const options: any = {
            method,
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const res = await fetch(`${API_BASE}${endpoint}`, options);
        const data = await res.json();

        if (res.status === expectedStatus) {
            log(`✅ ${name}: PASS`, colors.green);
            return data;
        } else {
            log(`❌ ${name}: FAIL (Status ${res.status}, expected ${expectedStatus})`, colors.red);
            console.log('   Response:', data);
            return null;
        }
    } catch (error: any) {
        log(`❌ ${name}: ERROR - ${error.message}`, colors.red);
        return null;
    }
}

async function runTests() {
    log('\n🧪 Billing System Verification\n', colors.blue);
    log('━'.repeat(50), colors.blue);

    try {
        // Get auth token
        log('\n📋 Loading authentication...', colors.yellow);
        authToken = await getAuthToken();
        log('✅ Auth token loaded\n', colors.green);

        // Test 1: User Balance
        log('Test 1: User Balance', colors.yellow);
        const balance = await testEndpoint('GET /api/user/balance', 'GET', '/user/balance');
        if (balance) {
            log(`   Current Balance: £${balance.balance?.toFixed(2) || '0.00'}`, colors.blue);
        }

        // Test 2: User Monthly Usage
        log('\nTest 2: User Monthly Usage', colors.yellow);
        const currentMonth = new Date().toISOString().slice(0, 7);
        const usage = await testEndpoint(
            'GET /api/user/usage',
            'GET',
            `/user/usage?month=${currentMonth}`
        );
        if (usage) {
            log(`   Total Usage This Month: £${usage.total?.toFixed(2) || '0.00'}`, colors.blue);
            log(`   Query Count: ${usage.logs?.length || 0}`, colors.blue);
        }

        // Test 3: Pricing Config (Admin)
        log('\nTest 3: Pricing Config (Admin)', colors.yellow);
        const pricing = await testEndpoint('GET /api/admin/pricing-config', 'GET', '/admin/pricing-config');
        if (pricing) {
            log(`   Base Subscription: £${pricing.baseSubscription || 0}`, colors.blue);
            log(`   Margin: ${pricing.margin || 0}%`, colors.blue);
        }

        // Test 4: Analytics (Admin)
        log('\nTest 4: Analytics Dashboard (Admin)', colors.yellow);
        const analytics = await testEndpoint(
            'GET /api/admin/analytics',
            'GET',
            `/admin/analytics?month=${currentMonth}`
        );
        if (analytics) {
            log(`   Total Revenue: £${analytics.totals?.revenue?.toFixed(2) || '0.00'}`, colors.blue);
            log(`   Total Costs: £${analytics.totals?.costs?.toFixed(2) || '0.00'}`, colors.blue);
            log(`   Net Profit: £${analytics.totals?.profit?.toFixed(2) || '0.00'}`, colors.blue);
            log(`   Active Users: ${analytics.totals?.activeUsers || 0}`, colors.blue);
        }

        // Test 5: Invoices List (Admin)
        log('\nTest 5: Invoices List (Admin)', colors.yellow);
        const invoices = await testEndpoint('GET /api/admin/invoices', 'GET', '/admin/invoices?limit=5');
        if (invoices && invoices.invoices) {
            log(`   Total Invoices: ${invoices.invoices.length}`, colors.blue);
        }

        // Summary
        log('\n' + '━'.repeat(50), colors.blue);
        log('\n✅ Billing System Verification Complete!\n', colors.green);
        log('Next Steps:', colors.yellow);
        log('1. Review the testing_guide.md for comprehensive manual tests');
        log('2. Test UI flows in the browser');
        log('3. Verify database integrity with MongoDB queries');
        log('4. Test edge cases (insufficient balance, etc.)\n');

    } catch (error: any) {
        log(`\n❌ Verification Failed: ${error.message}`, colors.red);
        process.exit(1);
    }
}

// Run tests
runTests().catch(console.error);

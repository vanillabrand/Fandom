
import fetch from 'node-fetch';

const API_URL = 'http://localhost:3000/api';

async function testSignup() {
    const email = `test.promo.${Date.now()}@example.com`;
    const password = 'password123';
    const promoCode = 'TESTPROMO'; // We need to insert this first if not exists

    console.log(`[Test] Attempting signup with email: ${email}`);

    // Call Signup Endpoint
    const res = await fetch(`${API_URL}/auth/email/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email,
            password,
            name: 'Test Promo User',
            promoCode
        })
    });

    const data: any = await res.json();

    if (res.ok) {
        console.log('[Test] Signup Successful!');
        console.log('[Test] User:', data.user);
        console.log('[Test] Balance:', data.user.balance);

        if (data.user.balance > 5) {
            console.log('✅ Promo code applied successfully!');
        } else {
            console.log('⚠️  Promo code NOT applied (Balance is default). Check if code exists in DB.');
        }
    } else {
        console.error('[Test] Signup Failed:', data);
    }
}

testSignup();

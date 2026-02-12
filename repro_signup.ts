
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001/api';

async function testSignup() {
    const email = `test_user_${Date.now()}@example.com`;
    const password = 'password123';
    const name = 'Test User';

    console.log(`Attempting signup with email: ${email}`);

    try {
        const res = await fetch(`${BASE_URL}/auth/email/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name })
        });

        const data: any = await res.json();
        console.log('Status:', res.status);
        console.log('Response:', data);

        if (res.ok) {
            console.log('Signup successful!');
            return { email, password };
        } else {
            console.error('Signup failed:', data.error);
        }
    } catch (error: any) {
        console.error('Network/Server error:', error);
    }
}

testSignup();

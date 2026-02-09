import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { mongoService } from '../services/mongoService.js';
const client = new OAuth2Client(process.env.VITE_GOOGLE_CLIENT_ID);
const JWT_SECRET = process.env.JWT_SECRET || 'secret-key-change-me'; // [SECURITY] Env var in prod
export const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized: No token provided' });
        }
        const token = authHeader.split(' ')[1];
        let payload = null;
        // 1. Try Google Verification
        try {
            const ticket = await client.verifyIdToken({
                idToken: token,
                audience: process.env.VITE_GOOGLE_CLIENT_ID,
            });
            payload = ticket.getPayload();
        }
        catch (googleError) {
            // 2. If Google fails, try Custom JWT
            try {
                payload = jwt.verify(token, JWT_SECRET);
            }
            catch (jwtError) {
                // Both failed
                return res.status(401).json({ error: 'Unauthorized: Invalid token' });
            }
        }
        if (!payload) {
            return res.status(401).json({ error: 'Unauthorized: Invalid token payload' });
        }
        // Attach User to Request
        // We also check if user exists in DB to get their credits
        // For JWT, payload.sub should be the user ID or googleId
        const dbUser = await mongoService.getUser(payload.sub) || await mongoService.getUserByEmail(payload.email);
        req.user = {
            ...payload,
            ...(dbUser || {}) // Merge DB data (credits, role)
        };
        next();
    }
    catch (error) {
        console.error('Auth Error:', error);
        return res.status(401).json({ error: 'Unauthorized: Server error' });
    }
};

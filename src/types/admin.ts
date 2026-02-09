// TypeScript interfaces for Admin features

export interface PromoCode {
    _id?: string;
    code: string;
    value: number;
    maxUses: number; // 0 = unlimited
    currentUses: number;
    expiresAt?: Date | string;
    isActive: boolean;
    createdAt: Date | string;
    createdBy: string; // admin googleId
}

export interface PromoRedemption {
    _id?: string;
    code: string;
    userId: string;
    redeemedAt: Date | string;
    creditValue: number;
}

export interface Invoice {
    _id?: string;
    id: string;
    userId: string;
    amount: number;
    description: string;
    status: 'draft' | 'sent' | 'paid';
    createdAt: Date | string;
    sentAt?: Date | string;
    paidAt?: Date | string;
    dueDate?: Date | string;
    items?: any[];
    user?: {
        name: string;
        email: string;
        picture?: string;
    };
}

export interface AdminUserView {
    googleId: string;
    email: string;
    name: string;
    picture: string;
    credits: number;
    role: 'admin' | 'user';
    status: 'active' | 'pending' | 'blocked';
    createdAt: Date | string;
    lastActive?: Date | string;
    monthlyUsage?: number; // calculated from transactions
    promoCodeUsed?: string | null;
}

export interface Transaction {
    _id?: string;
    userId: string;
    cost: number;
    description: string;
    type: string;
    date: Date | string;
    createdAt: Date | string;
    metadata?: any;
}

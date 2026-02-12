import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useAuth } from '../../contexts/AuthContext.js';
import { X, CreditCard, Check } from 'lucide-react';
import { toast } from 'sonner';

// Initialize Stripe
// Initialize Stripe
const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || (window as any).__ENV__?.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = loadStripe(stripeKey);

interface CheckoutFormProps {
    amount: number;
    onSuccess: (newBalance: number) => void;
    onCancel: () => void;
}

const CheckoutForm: React.FC<CheckoutFormProps> = ({ amount, onSuccess, onCancel }) => {
    const stripe = useStripe();
    const elements = useElements();
    const { token, refreshProfile } = useAuth();
    const [processing, setProcessing] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!stripe || !elements) {
            return;
        }

        setProcessing(true);

        try {
            // Confirm payment with Stripe
            const { error: submitError } = await elements.submit();
            if (submitError) {
                toast.error(submitError.message || 'Payment failed');
                setProcessing(false);
                return;
            }

            const { error } = await stripe.confirmPayment({
                elements,
                confirmParams: {
                    return_url: window.location.href
                },
                redirect: 'if_required'
            });

            if (error) {
                toast.error(error.message || 'Payment failed');
                setProcessing(false);
                return;
            }

            // Payment succeeded! Refresh profile to get new balance
            await refreshProfile();
            toast.success(`✅ Successfully added £${amount.toFixed(2)} to your balance!`);

            // Get updated balance
            const res = await fetch('/api/user/balance', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();

            onSuccess(data.balance);
        } catch (error: any) {
            console.error('Payment error:', error);
            toast.error('Payment processing failed');
            setProcessing(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Payment Element */}
            <div className="bg-[#051810] border border-emerald-900/50 rounded-lg p-4">
                <PaymentElement />
            </div>

            {/* Pay Button */}
            <button
                type="submit"
                disabled={!stripe || processing}
                className={`w-full py-3 rounded-lg font-bold text-white flex items-center justify-center gap-2 ${processing || !stripe
                    ? 'bg-gray-600 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                    }`}
            >
                {processing ? (
                    <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        Processing...
                    </>
                ) : (
                    <>
                        <CreditCard size={20} />
                        Pay £{amount.toFixed(2)}
                    </>
                )}
            </button>

            {/* Cancel Button */}
            <button
                type="button"
                onClick={onCancel}
                disabled={processing}
                className="w-full py-2 text-gray-400 hover:text-white transition-colors"
            >
                Cancel
            </button>
        </form>
    );
};

interface StripeCheckoutProps {
    onSuccess: (newBalance: number) => void;
    onCancel: () => void;
    invoiceId?: string;      // Optional: If paying an invoice
    fixedAmount?: number;    // Optional: Fixed amount (for invoices)
}

export const StripeCheckout: React.FC<StripeCheckoutProps> = ({
    onSuccess,
    onCancel,
    invoiceId,
    fixedAmount
}) => {
    const { token, user } = useAuth();
    const [selectedAmount, setSelectedAmount] = useState<number>(fixedAmount || 100);
    const [customAmount, setCustomAmount] = useState<string>('');
    const [useCustom, setUseCustom] = useState(false);
    const [clientSecret, setClientSecret] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [paymentInitiated, setPaymentInitiated] = useState(false);

    const presetAmounts = [50, 100, 250];

    const amount = fixedAmount || (useCustom ? parseFloat(customAmount) || 0 : selectedAmount);
    const currentBalance = user?.balance || 0;
    const newBalance = currentBalance + amount;

    const handleStartPayment = async () => {
        if (amount < 10 || amount > 1000) {
            toast.error('Amount must be between £10 and £1000');
            return;
        }

        setLoading(true);

        try {
            const res = await fetch('/api/payments/create-intent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    amount,
                    invoiceId: invoiceId || undefined  // Include invoice ID if paying invoice
                })
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to create payment');
            }

            const data = await res.json();
            setClientSecret(data.clientSecret);
            setPaymentInitiated(true);
        } catch (error: any) {
            console.error('Payment initiation failed:', error);
            toast.error(error.message || 'Failed to initiate payment');
        } finally {
            setLoading(false);
        }
    };

    const appearance = {
        theme: 'night' as const,
        variables: {
            colorPrimary: '#10b981',
            colorBackground: '#051810',
            colorText: '#ffffff',
            colorDanger: '#ef4444',
            borderRadius: '8px'
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-[#0a1f16] rounded-xl border border-emerald-900/30 max-w-md w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="px-6 py-4 border-b border-emerald-900/30 flex items-center justify-between sticky top-0 bg-[#0a1f16]">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <CreditCard className="text-emerald-400" size={24} />
                        {invoiceId ? `Pay Invoice #${invoiceId}` : 'Top Up Balance'}
                    </h2>
                    <button onClick={onCancel} className="text-gray-400 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {!paymentInitiated ? (
                        <>
                            {/* Amount Selection */}
                            {!fixedAmount && (
                                <div>
                                    <label className="text-sm text-gray-400 block mb-3">Select Amount</label>
                                    <div className="grid grid-cols-3 gap-3 mb-3">
                                        {presetAmounts.map(preset => (
                                            <button
                                                key={preset}
                                                onClick={() => {
                                                    setSelectedAmount(preset);
                                                    setUseCustom(false);
                                                }}
                                                className={`py-3 rounded-lg font-bold transition-all ${!useCustom && selectedAmount === preset
                                                    ? 'bg-emerald-600 text-white border-2 border-emerald-400'
                                                    : 'bg-[#051810] text-emerald-400 border border-emerald-900/50 hover:border-emerald-500'
                                                    }`}
                                            >
                                                £{preset}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Custom Amount */}
                                    <div className="relative">
                                        <input
                                            type="number"
                                            min="10"
                                            max="1000"
                                            step="1"
                                            value={customAmount}
                                            onChange={(e) => {
                                                setCustomAmount(e.target.value);
                                                setUseCustom(true);
                                            }}
                                            onFocus={() => setUseCustom(true)}
                                            placeholder="Custom amount (£10 - £1000)"
                                            className={`w-full bg-[#051810] border rounded-lg px-4 py-3 text-white ${useCustom ? 'border-emerald-500' : 'border-emerald-900/50'
                                                }`}
                                        />
                                        {useCustom && customAmount && (
                                            <Check className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-400" size={20} />
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Fixed Amount Display (for invoices) */}
                            {fixedAmount && (
                                <div className="bg-gradient-to-r from-blue-900/30 to-blue-800/10 rounded-lg p-6 border border-blue-500/30 text-center">
                                    <div className="text-sm text-gray-400 mb-2">Invoice Amount</div>
                                    <div className="text-4xl font-bold text-blue-400 mb-2">£{fixedAmount.toFixed(2)}</div>
                                    <div className="text-xs text-gray-500">
                                        {invoiceId && `Invoice #${invoiceId}`}
                                    </div>
                                </div>
                            )}

                            {/* Balance Preview */}
                            <div className="bg-gradient-to-r from-emerald-900/30 to-emerald-800/10 rounded-lg p-4 border border-emerald-500/30">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm text-gray-400">Current Balance</span>
                                    <span className="text-white font-mono">£{currentBalance.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm text-gray-400">Top Up Amount</span>
                                    <span className="text-emerald-400 font-mono font-bold">+£{amount.toFixed(2)}</span>
                                </div>
                                <div className="border-t border-emerald-500/20 pt-2 mt-2 flex justify-between items-center">
                                    <span className="text-sm font-bold text-white">New Balance</span>
                                    <span className="text-xl font-bold text-emerald-400 font-mono">£{newBalance.toFixed(2)}</span>
                                </div>
                            </div>

                            {/* Proceed Button */}
                            <button
                                onClick={handleStartPayment}
                                disabled={loading || amount < 10 || amount > 1000}
                                className={`w-full py-3 rounded-lg font-bold text-white flex items-center justify-center gap-2 ${loading || amount < 10 || amount > 1000
                                    ? 'bg-gray-600 cursor-not-allowed'
                                    : 'bg-emerald-600 hover:bg-emerald-500'
                                    }`}
                            >
                                {loading ? (
                                    <>
                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                        Loading...
                                    </>
                                ) : (
                                    <>
                                        Continue to Payment
                                    </>
                                )}
                            </button>

                            <p className="text-xs text-gray-500 text-center">
                                Secure payment powered by Stripe • Amount between £10-£1000
                            </p>
                        </>
                    ) : (
                        <>
                            {/* Payment Form */}
                            {clientSecret && (
                                <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
                                    <CheckoutForm
                                        amount={amount}
                                        onSuccess={onSuccess}
                                        onCancel={() => {
                                            setPaymentInitiated(false);
                                            setClientSecret('');
                                        }}
                                    />
                                </Elements>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

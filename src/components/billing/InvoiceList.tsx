import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext.js';
import { Receipt, CreditCard, Calendar, DollarSign, CheckCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { StripeCheckout } from '../payments/StripeCheckout.js';

interface Invoice {
    _id: string;
    invoiceId: string;
    userId: string;
    month: string;
    totalCost: number;
    totalQueries: number;
    status: 'pending' | 'paid' | 'overdue';
    generatedAt: Date;
    paidAt?: Date;
    stripePaymentIntentId?: string;
}

export const InvoiceList = () => {
    const { token, refreshProfile } = useAuth();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [showPayment, setShowPayment] = useState(false);

    useEffect(() => {
        loadInvoices();
    }, []);

    const loadInvoices = async () => {
        try {
            const res = await fetch('/api/user/invoices', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                throw new Error('Failed to load invoices');
            }

            const data = await res.json();
            setInvoices(data.invoices || []);
        } catch (error: any) {
            console.error('Failed to load invoices:', error);
            toast.error('Failed to load invoices');
        } finally {
            setLoading(false);
        }
    };

    const handlePayInvoice = (invoice: Invoice) => {
        setSelectedInvoice(invoice);
        setShowPayment(true);
    };

    const handlePaymentSuccess = async (newBalance: number) => {
        setShowPayment(false);
        await loadInvoices(); // Reload to show updated status
        refreshProfile();
        toast.success(`Invoice ${selectedInvoice?.invoiceId} paid successfully!`);
        setSelectedInvoice(null);
    };

    const formatDate = (date: Date | string) => {
        return new Date(date).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'paid':
                return 'text-emerald-400 bg-emerald-900/30 border-emerald-500/30';
            case 'overdue':
                return 'text-red-400 bg-red-900/30 border-red-500/30';
            default:
                return 'text-yellow-400 bg-yellow-900/30 border-yellow-500/30';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'paid':
                return <CheckCircle size={14} />;
            case 'overdue':
                return <Clock size={14} />;
            default:
                return <Clock size={14} />;
        }
    };

    if (loading) {
        return (
            <div className="bg-[#0a1f16] p-8 rounded-xl border border-emerald-900/30 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mx-auto"></div>
                <p className="text-gray-400 mt-4">Loading invoices...</p>
            </div>
        );
    }

    if (invoices.length === 0) {
        return (
            <div className="bg-[#0a1f16] p-8 rounded-xl border border-emerald-900/30 text-center">
                <Receipt size={48} className="text-emerald-500/50 mx-auto mb-4" />
                <h3 className="text-white font-bold mb-2">No Invoices Yet</h3>
                <p className="text-gray-400 text-sm">Invoices are generated monthly based on your usage</p>
            </div>
        );
    }

    return (
        <>
            <div className="bg-[#0a1f16] rounded-xl border border-emerald-900/30 overflow-hidden">
                <div className="px-6 py-4 border-b border-emerald-900/30">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Receipt className="text-emerald-400" size={20} />
                        Invoices
                    </h3>
                    <p className="text-sm text-emerald-500/60">Monthly billing statements</p>
                </div>

                <div className="divide-y divide-emerald-900/30">
                    {invoices.map((invoice) => (
                        <div key={invoice._id} className="p-6 hover:bg-emerald-900/10 transition-colors">
                            <div className="flex items-start justify-between gap-4">
                                {/* Invoice Details */}
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <h4 className="text-white font-bold">
                                            Invoice #{invoice.invoiceId}
                                        </h4>
                                        <span className={`px-2 py-1 rounded text-xs font-bold flex items-center gap-1 border ${getStatusColor(invoice.status)}`}>
                                            {getStatusIcon(invoice.status)}
                                            {invoice.status.toUpperCase()}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                        <div>
                                            <div className="text-gray-400 text-xs mb-1 flex items-center gap-1">
                                                <Calendar size={12} />
                                                Period
                                            </div>
                                            <div className="text-emerald-300 font-mono">{invoice.month}</div>
                                        </div>
                                        <div>
                                            <div className="text-gray-400 text-xs mb-1">Queries</div>
                                            <div className="text-white font-bold">{invoice.totalQueries}</div>
                                        </div>
                                        <div>
                                            <div className="text-gray-400 text-xs mb-1 flex items-center gap-1">
                                                <DollarSign size={12} />
                                                Amount
                                            </div>
                                            <div className="text-emerald-400 font-bold text-lg">
                                                £{(invoice.totalCost || 0).toFixed(2)}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-gray-400 text-xs mb-1">Generated</div>
                                            <div className="text-white font-mono text-xs">
                                                {formatDate(invoice.generatedAt)}
                                            </div>
                                        </div>
                                    </div>

                                    {invoice.status === 'paid' && invoice.paidAt && (
                                        <div className="mt-3 text-xs text-emerald-500/60">
                                            ✓ Paid on {formatDate(invoice.paidAt)}
                                        </div>
                                    )}
                                </div>

                                {/* Action Button */}
                                {invoice.status !== 'paid' && (
                                    <button
                                        onClick={() => handlePayInvoice(invoice)}
                                        className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white px-4 py-2 rounded font-bold text-sm flex items-center gap-2 transition-all whitespace-nowrap"
                                    >
                                        <CreditCard size={16} />
                                        Pay Now
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Payment Modal */}
            {showPayment && selectedInvoice && (
                <StripeCheckout
                    invoiceId={selectedInvoice.invoiceId}
                    fixedAmount={selectedInvoice.totalCost}
                    onSuccess={handlePaymentSuccess}
                    onCancel={() => {
                        setShowPayment(false);
                        setSelectedInvoice(null);
                    }}
                />
            )}
        </>
    );
};

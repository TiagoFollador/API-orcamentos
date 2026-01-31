import { PrismaService } from '../../core/services/prisma.service';
interface SplitRule {
    recipient_id: string;
    amount: number;
    liable: boolean;
    charge_processing_fee: boolean;
    charge_remainder?: boolean;
}
interface PaymentSplitResult {
    platformSplit: SplitRule;
    organizerSplit: SplitRule;
    splits: SplitRule[];
}
export declare class PagarmeService {
    private prisma;
    private readonly apiKey;
    private readonly baseUrl;
    constructor(prisma: PrismaService);
    calculateSplit(totalAmount: number, organizerRecipientId: string): PaymentSplitResult;
    createTransaction(params: {
        orderId: string;
        amount: number;
        paymentMethod: string;
        cardToken?: string;
        installments?: number;
        organizerRecipientId: string;
        customerData: {
            email: string;
            name: string;
            document: string;
            phone?: string;
        };
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        gatewayId: string | null;
        paymentMethod: import(".prisma/client").$Enums.PaymentMethod;
        status: import(".prisma/client").$Enums.TransactionStatus;
        amount: number;
        installments: number;
        idempotencyKey: string;
        splitSnapshot: import("@prisma/client/runtime/client").JsonValue | null;
        gatewayMetadata: import("@prisma/client/runtime/client").JsonValue | null;
        errorMessage: string | null;
        orderId: string;
    }>;
    createRecipient(params: {
        name: string;
        email: string;
        document: string;
        type: 'individual' | 'company';
        bankAccount: {
            bank: string;
            branch_number: string;
            account_number: string;
            account_check_digit: string;
            holder_name: string;
            holder_document: string;
            type: 'checking' | 'savings';
        };
    }): Promise<any>;
    private logSplitRules;
    private mapGatewayStatus;
}
export {};

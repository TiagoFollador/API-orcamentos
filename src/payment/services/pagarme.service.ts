import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma.service';
import { v4 as uuidv4 } from 'uuid';

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

@Injectable()
export class PagarmeService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.pagar.me/core/v5';

  constructor(private prisma: PrismaService) {
    this.apiKey = process.env.PAGARME_API_KEY || '';
  }

  /**
   * Calculate split rules based on total amount
   * Platform receives: (amount * FEE_PERCENTAGE) + FIXED_FEE
   * Organizer receives: remaining amount
   * Organizer pays MDR (charge_processing_fee: true)
   */
  calculateSplit(totalAmount: number, organizerRecipientId: string): PaymentSplitResult {
    const feePercentage = parseFloat(process.env.PLATFORM_FEE_PERCENTAGE || '10') / 100;
    const fixedFee = parseInt(process.env.PLATFORM_FEE_FIXED || '100');
    
    // Calculate platform commission in cents
    const platformAmount = Math.floor(totalAmount * feePercentage) + fixedFee;
    const organizerAmount = totalAmount - platformAmount;

    const platformRecipientId = process.env.PAGARME_PLATFORM_RECIPIENT_ID || '';

    const platformSplit: SplitRule = {
      recipient_id: platformRecipientId,
      amount: platformAmount,
      liable: true,
      charge_processing_fee: false, // Platform receives net amount
    };

    const organizerSplit: SplitRule = {
      recipient_id: organizerRecipientId,
      amount: organizerAmount,
      liable: true,
      charge_processing_fee: true, // Organizer pays the MDR
      charge_remainder: true, // Organizer receives/pays rounding differences
    };

    return {
      platformSplit,
      organizerSplit,
      splits: [platformSplit, organizerSplit],
    };
  }

  /**
   * Create a transaction with Pagar.me including split rules
   */
  async createTransaction(params: {
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
  }) {
    const idempotencyKey = uuidv4();
    const splitResult = this.calculateSplit(params.amount, params.organizerRecipientId);

    const payload: any = {
      amount: params.amount,
      payment_method: params.paymentMethod,
      customer: {
        email: params.customerData.email,
        name: params.customerData.name,
        document: params.customerData.document,
        type: 'individual',
        ...(params.customerData.phone && { 
          phones: {
            mobile_phone: {
              country_code: '55',
              number: params.customerData.phone.replace(/\D/g, ''),
            }
          }
        }),
      },
      payments: [
        {
          payment_method: params.paymentMethod,
          ...(params.paymentMethod === 'credit_card' && {
            credit_card: {
              card_token: params.cardToken,
              installments: params.installments || 1,
            },
          }),
          split: splitResult.splits,
        },
      ],
    };

    // Save transaction to database with pending status
    const transaction = await this.prisma.transaction.create({
      data: {
        orderId: params.orderId,
        paymentMethod: params.paymentMethod.toUpperCase() as any,
        amount: params.amount,
        installments: params.installments || 1,
        idempotencyKey,
        splitSnapshot: splitResult.splits as any,
        status: 'PENDING',
      },
    });

    try {
      // Call Pagar.me API
      const response = await fetch(`${this.baseUrl}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      // Update transaction with gateway response
      const updatedTransaction = await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          gatewayId: data.id,
          status: this.mapGatewayStatus(data.status) as any,
          gatewayMetadata: data,
        },
      });

      // Log split rules for audit
      await this.logSplitRules(transaction.id, splitResult);

      return updatedTransaction;
    } catch (error) {
      // Update transaction with error
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw error;
    }
  }

  /**
   * Create a recipient (organizer) in Pagar.me
   */
  async createRecipient(params: {
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
  }) {
    const response = await fetch(`${this.baseUrl}/recipients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}`,
      },
      body: JSON.stringify({
        name: params.name,
        email: params.email,
        document: params.document,
        type: params.type,
        default_bank_account: params.bankAccount,
        transfer_settings: {
          transfer_enabled: true,
          transfer_interval: 'daily',
          transfer_day: 0,
        },
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`Failed to create recipient: ${JSON.stringify(data)}`);
    }

    return data;
  }

  private async logSplitRules(transactionId: string, splitResult: PaymentSplitResult) {
    const logs = [
      {
        transactionId,
        recipientId: splitResult.platformSplit.recipient_id,
        recipientType: 'PLATFORM' as const,
        amount: splitResult.platformSplit.amount,
        liable: splitResult.platformSplit.liable,
        chargeProcessingFee: splitResult.platformSplit.charge_processing_fee,
      },
      {
        transactionId,
        recipientId: splitResult.organizerSplit.recipient_id,
        recipientType: 'ORGANIZER' as const,
        amount: splitResult.organizerSplit.amount,
        liable: splitResult.organizerSplit.liable,
        chargeProcessingFee: splitResult.organizerSplit.charge_processing_fee,
      },
    ];

    await this.prisma.splitRuleLog.createMany({
      data: logs,
    });
  }

  private mapGatewayStatus(gatewayStatus: string): string {
    const statusMap: Record<string, string> = {
      'pending': 'PENDING',
      'processing': 'PENDING',
      'authorized': 'AUTHORIZED',
      'paid': 'PAID',
      'refunded': 'REFUNDED',
      'failed': 'FAILED',
      'canceled': 'CANCELED',
    };

    return statusMap[gatewayStatus] || 'PENDING';
  }
}

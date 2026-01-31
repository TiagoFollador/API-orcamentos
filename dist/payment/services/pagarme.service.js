"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PagarmeService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../core/services/prisma.service");
const uuid_1 = require("uuid");
let PagarmeService = class PagarmeService {
    constructor(prisma) {
        this.prisma = prisma;
        this.baseUrl = 'https://api.pagar.me/core/v5';
        this.apiKey = process.env.PAGARME_API_KEY || '';
    }
    calculateSplit(totalAmount, organizerRecipientId) {
        const feePercentage = parseFloat(process.env.PLATFORM_FEE_PERCENTAGE || '10') / 100;
        const fixedFee = parseInt(process.env.PLATFORM_FEE_FIXED || '100');
        const platformAmount = Math.floor(totalAmount * feePercentage) + fixedFee;
        const organizerAmount = totalAmount - platformAmount;
        const platformRecipientId = process.env.PAGARME_PLATFORM_RECIPIENT_ID || '';
        const platformSplit = {
            recipient_id: platformRecipientId,
            amount: platformAmount,
            liable: true,
            charge_processing_fee: false,
        };
        const organizerSplit = {
            recipient_id: organizerRecipientId,
            amount: organizerAmount,
            liable: true,
            charge_processing_fee: true,
            charge_remainder: true,
        };
        return {
            platformSplit,
            organizerSplit,
            splits: [platformSplit, organizerSplit],
        };
    }
    async createTransaction(params) {
        const idempotencyKey = (0, uuid_1.v4)();
        const splitResult = this.calculateSplit(params.amount, params.organizerRecipientId);
        const payload = {
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
        const transaction = await this.prisma.transaction.create({
            data: {
                orderId: params.orderId,
                paymentMethod: params.paymentMethod.toUpperCase(),
                amount: params.amount,
                installments: params.installments || 1,
                idempotencyKey,
                splitSnapshot: splitResult.splits,
                status: 'PENDING',
            },
        });
        try {
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
            const updatedTransaction = await this.prisma.transaction.update({
                where: { id: transaction.id },
                data: {
                    gatewayId: data.id,
                    status: this.mapGatewayStatus(data.status),
                    gatewayMetadata: data,
                },
            });
            await this.logSplitRules(transaction.id, splitResult);
            return updatedTransaction;
        }
        catch (error) {
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
    async createRecipient(params) {
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
    async logSplitRules(transactionId, splitResult) {
        const logs = [
            {
                transactionId,
                recipientId: splitResult.platformSplit.recipient_id,
                recipientType: 'PLATFORM',
                amount: splitResult.platformSplit.amount,
                liable: splitResult.platformSplit.liable,
                chargeProcessingFee: splitResult.platformSplit.charge_processing_fee,
            },
            {
                transactionId,
                recipientId: splitResult.organizerSplit.recipient_id,
                recipientType: 'ORGANIZER',
                amount: splitResult.organizerSplit.amount,
                liable: splitResult.organizerSplit.liable,
                chargeProcessingFee: splitResult.organizerSplit.charge_processing_fee,
            },
        ];
        await this.prisma.splitRuleLog.createMany({
            data: logs,
        });
    }
    mapGatewayStatus(gatewayStatus) {
        const statusMap = {
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
};
exports.PagarmeService = PagarmeService;
exports.PagarmeService = PagarmeService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PagarmeService);
//# sourceMappingURL=pagarme.service.js.map
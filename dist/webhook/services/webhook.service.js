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
exports.WebhookService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../core/services/prisma.service");
let WebhookService = class WebhookService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async processPaymentWebhook(payload) {
        const { id: gatewayId, status, type } = payload;
        const transaction = await this.prisma.transaction.findUnique({
            where: { gatewayId },
            include: { order: true },
        });
        if (!transaction) {
            console.warn(`Transaction not found for gateway ID: ${gatewayId}`);
            return;
        }
        const newStatus = this.mapStatus(status);
        await this.prisma.transaction.update({
            where: { id: transaction.id },
            data: {
                status: newStatus,
                gatewayMetadata: payload,
                updatedAt: new Date(),
            },
        });
        if (newStatus === 'PAID') {
            await this.prisma.order.update({
                where: { id: transaction.orderId },
                data: { status: 'PAID' },
            });
            console.log(`Order ${transaction.orderId} marked as PAID`);
        }
        else if (newStatus === 'FAILED' || newStatus === 'CANCELED') {
            await this.prisma.order.update({
                where: { id: transaction.orderId },
                data: { status: 'FAILED' },
            });
            console.log(`Order ${transaction.orderId} marked as FAILED`);
        }
    }
    mapStatus(gatewayStatus) {
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
exports.WebhookService = WebhookService;
exports.WebhookService = WebhookService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], WebhookService);
//# sourceMappingURL=webhook.service.js.map
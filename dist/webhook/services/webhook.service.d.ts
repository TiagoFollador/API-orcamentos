import { PrismaService } from '../../core/services/prisma.service';
export declare class WebhookService {
    private prisma;
    constructor(prisma: PrismaService);
    processPaymentWebhook(payload: any): Promise<void>;
    private mapStatus;
}

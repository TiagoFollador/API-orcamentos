import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma.service';

@Injectable()
export class WebhookService {
  constructor(private prisma: PrismaService) {}

  async processPaymentWebhook(payload: any) {
    const { id: gatewayId, status, type } = payload;

    // Find transaction by gateway ID
    const transaction = await this.prisma.transaction.findUnique({
      where: { gatewayId },
      include: { order: true },
    });

    if (!transaction) {
      console.warn(`Transaction not found for gateway ID: ${gatewayId}`);
      return;
    }

    // Map gateway status
    const newStatus = this.mapStatus(status);

    // Update transaction
    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: newStatus as any,
        gatewayMetadata: payload,
        updatedAt: new Date(),
      },
    });

    // Update order status based on transaction status
    if (newStatus === 'PAID') {
      await this.prisma.order.update({
        where: { id: transaction.orderId },
        data: { status: 'PAID' },
      });
      
      // TODO: Trigger ticket generation and email sending
      console.log(`Order ${transaction.orderId} marked as PAID`);
    } else if (newStatus === 'FAILED' || newStatus === 'CANCELED') {
      await this.prisma.order.update({
        where: { id: transaction.orderId },
        data: { status: 'FAILED' },
      });

      // TODO: Release reserved tickets back to inventory
      console.log(`Order ${transaction.orderId} marked as FAILED`);
    }
  }

  private mapStatus(gatewayStatus: string): string {
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

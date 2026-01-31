import { Controller, Post, Body, UseGuards, HttpCode } from '@nestjs/common';
import { PagarmeSignatureGuard } from './guards/pagarme-signature.guard';
import { WebhookService } from './services/webhook.service';

@Controller('webhooks')
export class WebhookController {
  constructor(private webhookService: WebhookService) {}

  @Post('pagarme')
  @HttpCode(200)
  @UseGuards(PagarmeSignatureGuard)
  async handlePagarmeWebhook(@Body() payload: any) {
    // Acknowledge immediately
    setImmediate(() => {
      this.webhookService.processPaymentWebhook(payload)
        .catch(err => console.error('Webhook processing error:', err));
    });

    return { received: true };
  }
}

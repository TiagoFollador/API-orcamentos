import { WebhookService } from './services/webhook.service';
export declare class WebhookController {
    private webhookService;
    constructor(webhookService: WebhookService);
    handlePagarmeWebhook(payload: any): Promise<{
        received: boolean;
    }>;
}

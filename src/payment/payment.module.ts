import { Module } from '@nestjs/common';
import { PagarmeService } from './services/pagarme.service';

@Module({
  providers: [PagarmeService],
  exports: [PagarmeService],
})
export class PaymentModule {}

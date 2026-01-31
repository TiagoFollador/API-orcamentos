import { CanActivate, ExecutionContext } from '@nestjs/common';
export declare class PagarmeSignatureGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean;
}

import { Strategy } from 'passport-jwt';
import { AuthService } from '../services/auth.service';
declare const JwtStrategy_base: new (...args: [opt: import("passport-jwt").StrategyOptionsWithRequest] | [opt: import("passport-jwt").StrategyOptionsWithoutRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class JwtStrategy extends JwtStrategy_base {
    private authService;
    constructor(authService: AuthService);
    validate(payload: any): Promise<{
        email: string;
        role: import(".prisma/client").$Enums.UserRole;
        id: string;
        isEmailVerified: boolean;
    } | null>;
}
export {};

import { Request } from 'express';

/** Express request augmented with the authenticated admin set by JwtStrategy.validate(). */
export interface AuthRequest extends Request {
  user: { id: string; role: string };
}

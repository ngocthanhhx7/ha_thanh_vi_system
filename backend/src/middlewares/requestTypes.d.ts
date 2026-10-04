import type { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name: string;
        email: string;
        phone: string;
        role: 'admin' | 'staff' | 'customer';
      };
    }
  }
}

export type RequestWithUser = Request;

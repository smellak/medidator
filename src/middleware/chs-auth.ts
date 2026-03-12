import { Request, Response, NextFunction } from 'express';

export interface CHSUser {
  id: string;
  name: string;
  email: string;
  role: string;
  dept: string;
  orgId: string;
  orgName: string;
  accessLevel: 'full' | 'readonly';
}

declare global {
  namespace Express {
    interface Request {
      chsUser?: CHSUser;
    }
  }
}

export function parseCHSHeaders(req: Request): CHSUser | null {
  const id = req.headers['x-chs-user-id'] as string;
  const name = req.headers['x-chs-user-name'] as string;

  if (!id || !name) return null;

  return {
    id,
    name,
    email: (req.headers['x-chs-user-email'] as string) || '',
    role: (req.headers['x-chs-role'] as string) || '',
    dept: (req.headers['x-chs-dept'] as string) || '',
    orgId: (req.headers['x-chs-org-id'] as string) || '',
    orgName: (req.headers['x-chs-org-name'] as string) || '',
    accessLevel: ((req.headers['x-chs-access-level'] as string) || 'readonly') as 'full' | 'readonly',
  };
}

export function requireCHS(req: Request, res: Response, next: NextFunction): void {
  const user = parseCHSHeaders(req);
  if (!user) {
    res.status(401).json({
      text: 'Autenticación CHS requerida. Faltan headers X-CHS-User-Id y X-CHS-User-Name.',
      success: false,
      error: 'CHS_AUTH_REQUIRED',
    });
    return;
  }
  req.chsUser = user;
  next();
}

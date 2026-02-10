import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export type AuthJwtPayload = {
  sub: string;
  role?: string;
};

export type AuthenticatedRequest = Request & {
  user?: {
    id: string;
    role?: string;
  };
};

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing Authorization header" });
  }

  const token = header.slice("Bearer ".length).trim();

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthJwtPayload;
    req.user = {
      id: String(payload.sub),
      role: payload.role,
    };
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  return next();
}

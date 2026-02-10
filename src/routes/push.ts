import { Router } from "express";

import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { PushSubscription } from "../models/PushSubscription";

const router = Router();

router.get("/vapid-public-key", requireAuth, async (_req: AuthenticatedRequest, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY || "";
  return res.json({ publicKey });
});

router.post("/subscribe", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const sub = (req.body || {}) as any;
    const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint.trim() : "";
    const p256dh = typeof sub?.keys?.p256dh === "string" ? sub.keys.p256dh : "";
    const auth = typeof sub?.keys?.auth === "string" ? sub.keys.auth : "";

    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({ message: "Invalid subscription" });
    }

    const saved = await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        $set: {
          userId: req.user.id,
          endpoint,
          keys: { p256dh, auth },
        },
      },
      { new: true, upsert: true }
    );

    return res.json({ subscription: saved });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/unsubscribe", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const endpoint = typeof (req.body as any)?.endpoint === "string" ? (req.body as any).endpoint.trim() : "";
    if (!endpoint) return res.status(400).json({ message: "endpoint is required" });

    await PushSubscription.deleteOne({ endpoint });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;

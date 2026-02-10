import { Router } from "express";

import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { Announcement } from "../models/Announcement";

const router = Router();

function isValidObjectId(id: string) {
  return /^[a-f\d]{24}$/i.test(String(id || ""));
}

router.get("/", requireAuth, async (_req: AuthenticatedRequest, res) => {
  try {
    const list = await Announcement.find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return res.json({ announcements: list });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id || !isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid announcement id" });
    }

    const found = await Announcement.findById(id).lean();
    if (!found) return res.status(404).json({ message: "Announcement not found" });

    return res.json({ announcement: found });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;

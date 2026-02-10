import { Router } from "express";

import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { Event } from "../models/Event";

const router = Router();

function isValidDateKey(dateKey: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey);
}

function toDateKey(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidObjectId(id: string) {
  return /^[a-f\d]{24}$/i.test(String(id || ""));
}

router.get("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const fromQ = typeof req.query.from === "string" ? String(req.query.from).trim() : "";
    const toQ = typeof req.query.to === "string" ? String(req.query.to).trim() : "";

    const today = new Date();
    const fromDefault = new Date(today);
    fromDefault.setDate(fromDefault.getDate() - 30);
    const toDefault = new Date(today);
    toDefault.setDate(toDefault.getDate() + 90);

    const from = fromQ && isValidDateKey(fromQ) ? fromQ : toDateKey(fromDefault);
    const to = toQ && isValidDateKey(toQ) ? toQ : toDateKey(toDefault);

    const filter: Record<string, any> = {
      dateKey: { $gte: from, $lte: to },
    };

    const events = await Event.find(filter)
      .sort({ dateKey: 1, startTime: 1 })
      .limit(200)
      .select("title dateKey startTime endTime status cancelReason")
      .lean();

    return res.json({ events });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id || !isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid event id" });
    }

    const ev = await Event.findById(id).lean();
    if (!ev) return res.status(404).json({ message: "Event not found" });
    return res.json({ event: ev });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;

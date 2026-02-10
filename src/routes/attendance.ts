import { Router } from "express";
import type { SortOrder } from "mongoose";

import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { AttendanceRecord } from "../models/AttendanceRecord";
import { User } from "../models/User";
import { PushSubscription } from "../models/PushSubscription";
import webpush from "web-push";

const router = Router();

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

router.post("/record", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { dateKey, grade, present, absent, notes } = (req.body || {}) as Record<string, any>;

    if (!dateKey) {
      return res.status(400).json({ message: "dateKey is required" });
    }

    const p = Number(present);
    const a = Number(absent);

    if (!Number.isFinite(p) || p < 0 || !Number.isFinite(a) || a < 0) {
      return res.status(400).json({ message: "present and absent must be non-negative numbers" });
    }

    const normalizedGrade = grade ? String(grade).trim() : "";
    if (!normalizedGrade) {
      return res.status(400).json({ message: "grade is required" });
    }

    const normalizedNotes = notes ? String(notes) : "";

    const saved = await AttendanceRecord.findOneAndUpdate(
      {
        userId: req.user.id,
        dateKey: String(dateKey).trim(),
      },
      {
        $set: {
          userId: req.user.id,
          dateKey: String(dateKey).trim(),
          grade: normalizedGrade,
          present: Math.floor(p),
          absent: Math.floor(a),
          notes: normalizedNotes,
        },
      },
      { new: true, upsert: true }
    );

    const u = await User.findById(req.user.id).select("name school municipality").lean();

    try {
      const io = req.app.get("io") as any;
      if (io && saved) {
        io.emit("attendance:saved", {
          record: {
            id: String((saved as any)._id || ""),
            userId: String(req.user.id),
            dateKey: saved.dateKey,
            grade: saved.grade,
            present: saved.present,
            absent: saved.absent,
            notes: saved.notes || "",
            createdAt: (saved as any).createdAt,
            updatedAt: (saved as any).updatedAt,
          },
          user: {
            id: String(req.user.id),
            name: String((u as any)?.name || ""),
            school: String((u as any)?.school || ""),
            municipality: String((u as any)?.municipality || ""),
          },
        });
      }
    } catch (emitErr) {
      console.error("Failed to emit attendance:saved", emitErr);
    }

    try {
      const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
      const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
      const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

      if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
        webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

        const subs = await PushSubscription.find().lean();
        const school = String((u as any)?.school || "");
        const grade = String((saved as any)?.grade || "");
        const dateKey = String((saved as any)?.dateKey || "");

        const payload = JSON.stringify({
          title: "New attendance saved",
          body: `${school || "(school)"} • ${grade || "(grade)"} • ${dateKey}`,
          url: `/admin/attendance?date=${encodeURIComponent(dateKey)}`,
        });

        await Promise.all(
          subs.map(async (s: any) => {
            const subscription = {
              endpoint: s.endpoint,
              keys: s.keys,
            };

            try {
              await webpush.sendNotification(subscription as any, payload);
            } catch (pushErr: any) {
              const statusCode = pushErr?.statusCode;
              if (statusCode === 404 || statusCode === 410) {
                try {
                  await PushSubscription.deleteOne({ endpoint: s.endpoint });
                } catch {
                  // ignore cleanup failure
                }
              } else {
                console.error("Failed to send web push", pushErr);
              }
            }
          })
        );
      }
    } catch (pushErr) {
      console.error("Web push error", pushErr);
    }

    return res.status(200).json({ record: saved });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/by-date/:dateKey", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { dateKey } = req.params;
    if (!dateKey) {
      return res.status(400).json({ message: "dateKey is required" });
    }

    const record = await AttendanceRecord.findOne({
      userId: req.user.id,
      dateKey: String(dateKey).trim(),
    });

    return res.json({ record: record || null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/history", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const from = typeof req.query.from === "string" ? req.query.from.trim() : "";
    const to = typeof req.query.to === "string" ? req.query.to.trim() : "";
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const sort = typeof req.query.sort === "string" ? req.query.sort : "newest";

    const filter: Record<string, any> = { userId: req.user.id };

    if (from || to) {
      filter.dateKey = {};
      if (from) filter.dateKey.$gte = from;
      if (to) filter.dateKey.$lte = to;
    }

    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ notes: rx }, { dateKey: rx }, { grade: rx }];
    }

    const sortSpec: Record<string, SortOrder> =
      sort === "oldest" ? { dateKey: "asc", updatedAt: "asc" } : { dateKey: "desc", updatedAt: "desc" };

    const records = await AttendanceRecord.find(filter).sort(sortSpec).limit(1000);

    return res.json({ records });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;

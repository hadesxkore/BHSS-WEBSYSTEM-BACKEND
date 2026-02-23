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
        grade: normalizedGrade,
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
        if (!subs.length) {
          try {
            console.warn("[push] attendance: no subscriptions; skipping send");
          } catch {
            // ignore
          }
          return res.status(200).json({ record: saved });
        }
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
      } else {
        try {
          console.warn("[push] attendance: missing VAPID keys; skipping send");
        } catch {
          // ignore
        }
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

    const grade = typeof (req.query as any)?.grade === "string" ? String((req.query as any).grade).trim() : "";

    const filter: any = {
      userId: req.user.id,
      dateKey: String(dateKey).trim(),
    };

    if (grade) {
      filter.grade = grade;
    }

    const record = await AttendanceRecord.findOne(filter);

    return res.json({ record: record || null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/by-date/:dateKey/all", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { dateKey } = req.params;
    if (!dateKey) {
      return res.status(400).json({ message: "dateKey is required" });
    }

    const records = await AttendanceRecord.find({
      userId: req.user.id,
      dateKey: String(dateKey).trim(),
    }).sort({ grade: 1 });

    return res.json({ records });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/record/bulk", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { dateKey, entries } = (req.body || {}) as Record<string, any>;

    if (!dateKey) {
      return res.status(400).json({ message: "dateKey is required" });
    }

    if (!Array.isArray(entries)) {
      return res.status(400).json({ message: "entries must be an array" });
    }

    const normalizedDateKey = String(dateKey).trim();

    const cleaned = entries
      .map((e: any) => {
        const grade = e?.grade ? String(e.grade).trim() : "";
        const present = Number(e?.present);
        const absent = Number(e?.absent);
        const notes = e?.notes ? String(e.notes) : "";
        return {
          grade,
          present: Number.isFinite(present) ? Math.max(0, Math.floor(present)) : 0,
          absent: Number.isFinite(absent) ? Math.max(0, Math.floor(absent)) : 0,
          notes,
        };
      })
      .filter((e) => e.grade && (e.present + e.absent > 0 || String(e.notes || "").trim().length > 0));

    if (!cleaned.length) {
      return res.status(400).json({ message: "No valid entries to save" });
    }

    const saved = await Promise.all(
      cleaned.map(async (e) => {
        return AttendanceRecord.findOneAndUpdate(
          {
            userId: req.user!.id,
            dateKey: normalizedDateKey,
            grade: e.grade,
          },
          {
            $set: {
              userId: req.user!.id,
              dateKey: normalizedDateKey,
              grade: e.grade,
              present: e.present,
              absent: e.absent,
              notes: e.notes,
            },
          },
          { new: true, upsert: true }
        );
      })
    );

    return res.status(200).json({ records: saved });
  } catch (err: any) {
    console.error(err);

    const code = (err as any)?.code;
    if (code === 11000) {
      return res.status(409).json({
        message:
          "Duplicate key error while saving attendance. Your database likely still has the old unique index on (userId, dateKey). Drop the index userId_1_dateKey_1 on the AttendanceRecord collection, then retry.",
      });
    }

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

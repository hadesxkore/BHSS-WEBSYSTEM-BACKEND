import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import webpush from "web-push";

import { requireAdmin, requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { Event } from "../models/Event";
import { PushSubscription } from "../models/PushSubscription";

const router = Router();

const UPLOAD_ROOT = (process.env.UPLOAD_DIR || path.resolve(process.cwd(), "uploads")).trim();
const EVENTS_UPLOAD_DIR = path.join(UPLOAD_ROOT, "events");

function ensureUploadDir() {
  if (!fs.existsSync(EVENTS_UPLOAD_DIR)) {
    fs.mkdirSync(EVENTS_UPLOAD_DIR, { recursive: true });
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      ensureUploadDir();
      cb(null, EVENTS_UPLOAD_DIR);
    } catch (err) {
      cb(err as any, EVENTS_UPLOAD_DIR);
    }
  },
  filename: (_req, file, cb) => {
    const safeBase = String(file.originalname)
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9_.-]/g, "")
      .slice(0, 80);
    const ext = path.extname(safeBase) || "";
    const base = safeBase.replace(new RegExp(`${ext}$`), "") || "file";
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${base}-${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
});

function isValidDateKey(dateKey: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey);
}

function isValidTimeHHmm(t: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

function isValidObjectId(id: string) {
  return /^[a-f\d]{24}$/i.test(String(id || ""));
}

router.get("/", requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const from = typeof req.query.from === "string" ? req.query.from : "";
    const to = typeof req.query.to === "string" ? req.query.to : "";

    const filter: Record<string, any> = {};
    if (from) filter.dateKey = { ...(filter.dateKey || {}), $gte: String(from) };
    if (to) filter.dateKey = { ...(filter.dateKey || {}), $lte: String(to) };

    const events = await Event.find(filter).sort({ dateKey: 1, startTime: 1 }).limit(2000).lean();
    return res.json({ events });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post(
  "/",
  requireAuth,
  requireAdmin,
  upload.single("attachment"),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user?.id) return res.status(401).json({ message: "Unauthorized" });

      const title = String((req.body as any)?.title || "").trim();
      const description = String((req.body as any)?.description || "").trim();
      const dateKey = String((req.body as any)?.dateKey || "").trim();
      const startTime = String((req.body as any)?.startTime || "").trim();
      const endTime = String((req.body as any)?.endTime || "").trim();

      if (!title) return res.status(400).json({ message: "title is required" });
      if (!dateKey || !isValidDateKey(dateKey)) {
        return res.status(400).json({ message: "dateKey must be yyyy-MM-dd" });
      }
      if (!startTime || !isValidTimeHHmm(startTime)) {
        return res.status(400).json({ message: "startTime must be HH:mm" });
      }
      if (!endTime || !isValidTimeHHmm(endTime)) {
        return res.status(400).json({ message: "endTime must be HH:mm" });
      }
      if (endTime <= startTime) {
        return res.status(400).json({ message: "endTime must be after startTime" });
      }

      const f = req.file as Express.Multer.File | undefined;
      const attachment = f
        ? {
            filename: f.filename,
            originalName: f.originalname,
            mimeType: f.mimetype,
            size: f.size,
            url: `/uploads/events/${f.filename}`,
          }
        : undefined;

      const created = await Event.create({
        title,
        description,
        dateKey,
        startTime,
        endTime,
        attachment,
        createdBy: req.user.id,
      });

      try {
        const io = req.app.get("io") as any;
        if (io && created) {
          io.emit("event:created", {
            event: {
              id: String((created as any)._id || ""),
              title: created.title,
              dateKey: created.dateKey,
              startTime: created.startTime,
              endTime: created.endTime,
              status: String((created as any).status || "Scheduled"),
            },
          });
        }
      } catch (emitErr) {
        console.error("Failed to emit event:created", emitErr);
      }

      try {
        const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
        const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
        const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

        if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && created) {
          webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

          const subs = await PushSubscription.find().lean();
          const payload = JSON.stringify({
            title: "New event scheduled",
            body: `${created.title} • ${created.dateKey} • ${created.startTime}–${created.endTime}`,
            url: "/users/announcements",
            tag: `event-${String((created as any)._id || "")}`,
          });

          await Promise.all(
            subs.map(async (s: any) => {
              const subscription = { endpoint: s.endpoint, keys: s.keys };
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
                  console.error("Failed to send event web push", pushErr);
                }
              }
            })
          );
        }
      } catch (pushErr) {
        console.error("Event web push error", pushErr);
      }

      return res.status(201).json({ event: created });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.put(
  "/:id",
  requireAuth,
  requireAdmin,
  upload.single("attachment"),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user?.id) return res.status(401).json({ message: "Unauthorized" });

      const id = String(req.params.id || "").trim();
      if (!id || !isValidObjectId(id)) {
        return res.status(400).json({ message: "Invalid event id" });
      }

      const existing = await Event.findById(id);
      if (!existing) return res.status(404).json({ message: "Event not found" });
      if (String((existing as any).status || "Scheduled") === "Cancelled") {
        return res.status(400).json({ message: "Cancelled events cannot be edited" });
      }

      const title = String((req.body as any)?.title || existing.title || "").trim();
      const description = String((req.body as any)?.description || existing.description || "").trim();
      const dateKey = String((req.body as any)?.dateKey || existing.dateKey || "").trim();
      const startTime = String((req.body as any)?.startTime || existing.startTime || "").trim();
      const endTime = String((req.body as any)?.endTime || existing.endTime || "").trim();

      if (!title) return res.status(400).json({ message: "title is required" });
      if (!dateKey || !isValidDateKey(dateKey)) {
        return res.status(400).json({ message: "dateKey must be yyyy-MM-dd" });
      }
      if (!startTime || !isValidTimeHHmm(startTime)) {
        return res.status(400).json({ message: "startTime must be HH:mm" });
      }
      if (!endTime || !isValidTimeHHmm(endTime)) {
        return res.status(400).json({ message: "endTime must be HH:mm" });
      }
      if (endTime <= startTime) {
        return res.status(400).json({ message: "endTime must be after startTime" });
      }

      const f = req.file as Express.Multer.File | undefined;
      const attachment = f
        ? {
            filename: f.filename,
            originalName: f.originalname,
            mimeType: f.mimetype,
            size: f.size,
            url: `/uploads/events/${f.filename}`,
          }
        : undefined;

      existing.title = title;
      existing.description = description;
      existing.dateKey = dateKey;
      existing.startTime = startTime;
      existing.endTime = endTime;
      if (attachment) (existing as any).attachment = attachment;

      const saved = await existing.save();
      return res.json({ event: saved });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.post(
  "/:id/cancel",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user?.id) return res.status(401).json({ message: "Unauthorized" });

      const id = String(req.params.id || "").trim();
      if (!id || !isValidObjectId(id)) {
        return res.status(400).json({ message: "Invalid event id" });
      }

      const reason = String((req.body as any)?.reason || "").trim();
      if (!reason) {
        return res.status(400).json({ message: "Cancellation reason is required" });
      }

      const existing = await Event.findById(id);
      if (!existing) return res.status(404).json({ message: "Event not found" });
      if (String((existing as any).status || "Scheduled") === "Cancelled") {
        return res.status(400).json({ message: "Event is already cancelled" });
      }

      ;(existing as any).status = "Cancelled";
      ;(existing as any).cancelReason = reason;
      ;(existing as any).cancelledAt = new Date();
      ;(existing as any).cancelledBy = req.user.id;

      const saved = await existing.save();

      try {
        const io = req.app.get("io") as any;
        if (io && saved) {
          io.emit("event:cancelled", {
            event: {
              id: String((saved as any)._id || ""),
              title: saved.title,
              dateKey: saved.dateKey,
              startTime: saved.startTime,
              endTime: saved.endTime,
              status: String((saved as any).status || "Cancelled"),
              cancelReason: String((saved as any).cancelReason || reason || ""),
              cancelledAt: (saved as any).cancelledAt,
            },
          });
        }
      } catch (emitErr) {
        console.error("Failed to emit event:cancelled", emitErr);
      }

      try {
        const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
        const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
        const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

        if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && saved) {
          webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

          const subs = await PushSubscription.find().lean();
          const payload = JSON.stringify({
            title: "Event cancelled",
            body: `${saved.title} • ${saved.dateKey} • ${saved.startTime}–${saved.endTime}${reason ? ` • ${reason}` : ""}`,
            url: "/users/announcements",
            tag: `event-${String((saved as any)._id || "")}-cancelled`,
          });

          await Promise.all(
            subs.map(async (s: any) => {
              const subscription = { endpoint: s.endpoint, keys: s.keys };
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
                  console.error("Failed to send event cancelled web push", pushErr);
                }
              }
            })
          );
        }
      } catch (pushErr) {
        console.error("Event cancelled web push error", pushErr);
      }

      return res.json({ event: saved });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;

import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import webpush from "web-push";

import { requireAdmin, requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { Announcement } from "../models/Announcement";
import { PushSubscription } from "../models/PushSubscription";

const router = Router();

const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");
const ANNOUNCEMENTS_UPLOAD_DIR = path.join(UPLOAD_ROOT, "announcements");

function ensureUploadDir() {
  if (!fs.existsSync(ANNOUNCEMENTS_UPLOAD_DIR)) {
    fs.mkdirSync(ANNOUNCEMENTS_UPLOAD_DIR, { recursive: true });
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      ensureUploadDir();
      cb(null, ANNOUNCEMENTS_UPLOAD_DIR);
    } catch (err) {
      cb(err as any, ANNOUNCEMENTS_UPLOAD_DIR);
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
    files: 6,
  },
});

router.post(
  "/",
  requireAuth,
  requireAdmin,
  upload.array("attachments", 6),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user?.id) return res.status(401).json({ message: "Unauthorized" });

      const title = String((req.body as any)?.title || "").trim();
      const message = String((req.body as any)?.message || "").trim();
      const priority = String((req.body as any)?.priority || "Normal").trim();
      const audience = String((req.body as any)?.audience || "All").trim();

      if (!title) return res.status(400).json({ message: "title is required" });
      if (!message) return res.status(400).json({ message: "message is required" });

      const safePriority = ["Normal", "Important", "Urgent"].includes(priority) ? priority : "Normal";
      const safeAudience = ["All", "Users"].includes(audience) ? audience : "All";

      const files = (req.files || []) as Express.Multer.File[];
      const attachments = files.map((f) => ({
        filename: f.filename,
        originalName: f.originalname,
        mimeType: f.mimetype,
        size: f.size,
        url: `/uploads/announcements/${f.filename}`,
      }));

      const created = await Announcement.create({
        title,
        message,
        priority: safePriority,
        audience: safeAudience,
        attachments,
        createdBy: req.user.id,
      });

      try {
        const io = req.app.get("io") as any;
        if (io && created) {
          io.emit("announcement:created", {
            announcement: {
              id: String((created as any)._id || ""),
              title: created.title,
              priority: String((created as any).priority || "Normal"),
              audience: String((created as any).audience || "All"),
              createdAt: (created as any).createdAt ? new Date((created as any).createdAt).getTime() : Date.now(),
            },
          });
        }
      } catch (emitErr) {
        console.error("Failed to emit announcement:created", emitErr);
      }

      try {
        const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
        const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
        const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

        if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && created) {
          webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

          const subs = await PushSubscription.find().lean();

          const payload = JSON.stringify({
            title: "New announcement",
            body: `${created.title}`,
            url: "/users/announcements",
            tag: `announcement-${String((created as any)._id || "")}`,
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
                  console.error("Failed to send announcement web push", pushErr);
                }
              }
            })
          );
        }
      } catch (pushErr) {
        console.error("Announcement web push error", pushErr);
      }

      return res.status(201).json({ announcement: created });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;

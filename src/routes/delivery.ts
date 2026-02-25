import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import type { SortOrder } from "mongoose";

import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { DeliveryRecord } from "../models/DeliveryRecord";
import { User } from "../models/User";
import { PushSubscription } from "../models/PushSubscription";
import webpush from "web-push";

const router = Router();

const UPLOAD_ROOT = (process.env.UPLOAD_DIR || path.resolve(process.cwd(), "uploads")).trim();
const DELIVERY_UPLOAD_DIR = path.join(UPLOAD_ROOT, "delivery");

function ensureUploadDir() {
  if (!fs.existsSync(DELIVERY_UPLOAD_DIR)) {
    fs.mkdirSync(DELIVERY_UPLOAD_DIR, { recursive: true });
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      ensureUploadDir();
      cb(null, DELIVERY_UPLOAD_DIR);
    } catch (err) {
      cb(err as any, DELIVERY_UPLOAD_DIR);
    }
  },
  filename: (_req, file, cb) => {
    const safeBase = String(file.originalname)
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9_.-]/g, "")
      .slice(0, 80);
    const ext = path.extname(safeBase) || "";
    const base = safeBase.replace(new RegExp(`${ext}$`), "") || "image";
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${base}-${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 15,
  },
});

function parseStringArray(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map((v) => String(v)).filter(Boolean);
  }
  if (typeof input === "string") {
    const raw = input.trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v)).filter(Boolean);
      }
    } catch {
      // ignore
    }
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeConcernValue(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\u00A0/g, " ");
}

function isNoConcernsValue(value: string): boolean {
  const normalized = value
    .toLowerCase()
    .replace(/[\s._-]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();

  return [
    "no concern",
    "no concerns",
    "none",
    "no",
    "na",
    "n a",
    "no cencern",
    "no cencerns",
    "no cencer",
    "no cencers",
    "no concernss",
  ].includes(normalized);
}

router.post(
  "/item",
  requireAuth,
  (req, res, next) => {
    upload.array("images", 15)(req, res, (err: any) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_COUNT") {
          return res.status(400).json({ message: "You can only upload up to 15 images." });
        }
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ message: "One of the images is too large." });
        }
        return res.status(400).json({ message: err.message || "Upload failed" });
      }

      return res.status(400).json({ message: "Upload failed" });
    });
  },
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const {
        dateKey,
        categoryKey,
        categoryLabel,
        status,
        statusReason,
        statusUpdatedAt,
        uploadedAt,
        concerns,
        remarks,
        replaceImages,
      } = req.body as Record<string, any>;

      if (!dateKey || !categoryKey || !categoryLabel) {
        return res
          .status(400)
          .json({ message: "dateKey, categoryKey, categoryLabel are required" });
      }

      const normalizedStatus = status ? String(status).trim() : "Pending";
      const normalizedReason = statusReason ? String(statusReason) : "";
      const normalizedRemarks = remarks ? String(remarks) : "";
      const parsedConcernsRaw = parseStringArray(concerns);
      const parsedConcernsNormalized = parsedConcernsRaw
        .map((c) => normalizeConcernValue(c))
        .filter(Boolean);

      const parsedConcerns = parsedConcernsNormalized.some((c) => isNoConcernsValue(c))
        ? []
        : Array.from(new Set(parsedConcernsNormalized));

      const files = (req.files as Express.Multer.File[]) || [];
      const imageDocs = files.map((f) => ({
        filename: f.filename,
        originalName: f.originalname,
        mimeType: f.mimetype,
        size: f.size,
        url: `/uploads/delivery/${f.filename}`,
      }));

      const statusUpdatedAtDate = statusUpdatedAt
        ? new Date(String(statusUpdatedAt))
        : undefined;
      const uploadedAtDate = uploadedAt ? new Date(String(uploadedAt)) : undefined;

      const shouldReplace =
        String(replaceImages || "").toLowerCase() === "true" ||
        String(replaceImages || "").toLowerCase() === "1";

      const existing = await DeliveryRecord.findOne({
        userId: req.user.id,
        dateKey: String(dateKey),
        categoryKey: String(categoryKey),
      });

      const nextImages = shouldReplace
        ? imageDocs
        : [...(existing?.images || []), ...imageDocs];

      const update: Record<string, any> = {
        userId: req.user.id,
        dateKey: String(dateKey),
        categoryKey: String(categoryKey),
        categoryLabel: String(categoryLabel),
        status: normalizedStatus,
        statusReason: normalizedReason,
        statusUpdatedAt: statusUpdatedAtDate,
        uploadedAt: uploadedAtDate,
        concerns: parsedConcerns,
        remarks: normalizedRemarks,
        images: nextImages,
      };

      const saved = await DeliveryRecord.findOneAndUpdate(
        {
          userId: req.user.id,
          dateKey: String(dateKey),
          categoryKey: String(categoryKey),
        },
        { $set: update },
        { new: true, upsert: true }
      );

      const u = await User.findById(req.user.id).select("name school municipality").lean();

      try {
        const io = req.app.get("io") as any;
        if (io && saved) {
          io.emit("delivery:saved", {
            record: {
              id: String((saved as any)._id || ""),
              userId: String(req.user.id),
              dateKey: saved.dateKey,
              categoryKey: saved.categoryKey,
              categoryLabel: saved.categoryLabel,
              status: saved.status,
              statusReason: saved.statusReason || "",
              uploadedAt: (saved as any).uploadedAt,
              concerns: Array.isArray(saved.concerns) ? saved.concerns : [],
              remarks: saved.remarks || "",
              images: Array.isArray(saved.images)
                ? saved.images.map((img: any) => ({ url: img.url, filename: img.filename }))
                : [],
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
        console.error("Failed to emit delivery:saved", emitErr);
      }

      try {
        const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
        const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
        const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

        if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && saved) {
          webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

          const subs = await PushSubscription.find().lean();
          const school = String((u as any)?.school || "");
          const categoryLabel = String((saved as any)?.categoryLabel || "");
          const dateKey = String((saved as any)?.dateKey || "");

          const payload = JSON.stringify({
            title: "New delivery saved",
            body: `${school || "(school)"} • ${categoryLabel || "(category)"} • ${dateKey}`,
            url: `/admin/delivery?date=${encodeURIComponent(dateKey)}`,
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
                  console.error("Failed to send delivery web push", pushErr);
                }
              }
            })
          );
        }
      } catch (pushErr) {
        console.error("Delivery web push error", pushErr);
      }

      return res.status(200).json({ record: saved });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get("/history", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const dateKey = typeof req.query.dateKey === "string" ? req.query.dateKey : "";
    const search = typeof req.query.search === "string" ? req.query.search : "";
    const sort = typeof req.query.sort === "string" ? req.query.sort : "newest";

    const me = await User.findById(req.user.id).select("school hlaRoleType hlaManagerName hlaManageName").lean();
    const mySchool = String((me as any)?.school || "").trim();
    const myHlaRoleType = String((me as any)?.hlaRoleType || "").trim();

    const filter: Record<string, any> = { userId: req.user.id };

    if (myHlaRoleType === "HLA Coordinator" && mySchool) {
      const managers = await User.find({ school: mySchool, hlaRoleType: "HLA Manager" })
        .select("_id")
        .lean();
      const managerIds = (managers || []).map((u: any) => u?._id).filter(Boolean);
      if (managerIds.length) {
        filter.userId = { $in: managerIds };
      }
    }

    if (dateKey) {
      filter.dateKey = dateKey;
    }

    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { categoryLabel: rx },
        { categoryKey: rx },
        { status: rx },
        { statusReason: rx },
        { remarks: rx },
        { concerns: rx },
      ];
    }

    const sortSpec: Record<string, SortOrder> =
      sort === "oldest"
        ? { uploadedAt: "asc", updatedAt: "asc" }
        : { uploadedAt: "desc", updatedAt: "desc" };

    const records = await DeliveryRecord.find(filter).sort(sortSpec).limit(1000);

    const hlaManagerName = String((me as any)?.hlaManagerName || (me as any)?.hlaManageName || "");

    return res.json({
      records: (records || []).map((r: any) => ({
        ...(typeof r?.toObject === "function" ? r.toObject() : r),
        hlaManagerName,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get(
  "/by-date/:dateKey",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { dateKey } = req.params;
      if (!dateKey) {
        return res.status(400).json({ message: "dateKey is required" });
      }

      const records = await DeliveryRecord.find({
        userId: req.user.id,
        dateKey: String(dateKey),
      }).sort({ categoryLabel: 1 });

      return res.json({ records });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.delete("/item", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { dateKey, categoryKey } = (req.body || {}) as Record<string, any>;

    if (!dateKey || !categoryKey) {
      return res.status(400).json({ message: "dateKey and categoryKey are required" });
    }

    const deleted = await DeliveryRecord.findOneAndDelete({
      userId: req.user.id,
      dateKey: String(dateKey),
      categoryKey: String(categoryKey),
    });

    if (!deleted) {
      return res.status(404).json({ message: "Record not found" });
    }

    for (const img of deleted.images || []) {
      if (!img?.filename) continue;
      const p = path.join(DELIVERY_UPLOAD_DIR, img.filename);
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {
        // ignore
      }
    }

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;

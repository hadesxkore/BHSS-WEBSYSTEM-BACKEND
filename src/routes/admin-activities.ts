import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";

import { requireAuth, requireAdmin, type AuthenticatedRequest } from "../middleware/auth";
import { Activity } from "../models/Activity";
import { ActivityResponse } from "../models/ActivityResponse";
import { User } from "../models/User";

const router = Router();

// ─── Upload dir for activity question photos ──────────────────────────────────

const UPLOAD_ROOT = (process.env.UPLOAD_DIR || path.resolve(process.cwd(), "uploads")).trim();
const ACTIVITY_UPLOAD_DIR = path.join(UPLOAD_ROOT, "activities");

function ensureDir() {
    if (!fs.existsSync(ACTIVITY_UPLOAD_DIR)) {
        fs.mkdirSync(ACTIVITY_UPLOAD_DIR, { recursive: true });
    }
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        try { ensureDir(); cb(null, ACTIVITY_UPLOAD_DIR); }
        catch (e) { cb(e as any, ACTIVITY_UPLOAD_DIR); }
    },
    filename: (_req, file, cb) => {
        const safe = file.originalname.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 80);
        const ext = path.extname(safe) || "";
        const base = safe.replace(new RegExp(`${ext}$`), "") || "photo";
        cb(null, `${base}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
});

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ─── Helper ────────────────────────────────────────────────────────────────────

function formatActivity(a: any) {
    return {
        id: String(a._id),
        title: String(a.title || ""),
        description: String(a.description || ""),
        isActive: Boolean(a.isActive),
        fields: (a.fields || []).map((f: any) => ({
            id: String(f.id || ""),
            type: String(f.type || "text"),
            label: String(f.label || ""),
            description: String(f.description || ""),
            required: Boolean(f.required),
            photoUrl: String(f.photoUrl || ""),
            unit: String(f.unit || ""),
            placeholder: String(f.placeholder || ""),
        })),
        createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : "",
        updatedAt: a.updatedAt ? new Date(a.updatedAt).toISOString() : "",
    };
}

// ─── LIST activities ──────────────────────────────────────────────────────────

router.get("/", requireAuth, requireAdmin, async (_req, res) => {
    try {
        const list = await Activity.find().sort({ createdAt: -1 }).lean();
        return res.json({ activities: list.map(formatActivity) });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

// ─── CREATE activity ──────────────────────────────────────────────────────────

router.post("/", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { title, description, fields, isActive } = req.body;
        if (!title) return res.status(400).json({ message: "title is required" });

        const activity = await Activity.create({
            title: String(title).trim(),
            description: String(description || ""),
            isActive: isActive !== false,
            fields: Array.isArray(fields) ? fields : [],
        });

        return res.status(201).json({ activity: formatActivity(activity) });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

// ─── UPDATE activity ──────────────────────────────────────────────────────────

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id))
            return res.status(400).json({ message: "Invalid id" });

        const { title, description, fields, isActive } = req.body;
        const update: Record<string, any> = {};
        if (title !== undefined) update.title = String(title).trim();
        if (description !== undefined) update.description = String(description);
        if (fields !== undefined) update.fields = Array.isArray(fields) ? fields : [];
        if (isActive !== undefined) update.isActive = Boolean(isActive);

        const updated = await Activity.findByIdAndUpdate(id, { $set: update }, { new: true });
        if (!updated) return res.status(404).json({ message: "Activity not found" });
        return res.json({ activity: formatActivity(updated) });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

// ─── DELETE activity ──────────────────────────────────────────────────────────

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id))
            return res.status(400).json({ message: "Invalid id" });
        await Activity.findByIdAndDelete(id);
        await ActivityResponse.deleteMany({ activityId: new mongoose.Types.ObjectId(id) });
        return res.json({ success: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

// ─── UPLOAD question photo ────────────────────────────────────────────────────

router.post(
    "/upload-photo",
    requireAuth,
    requireAdmin,
    upload.single("photo"),
    (req: AuthenticatedRequest, res) => {
        try {
            const file = (req as any).file as Express.Multer.File | undefined;
            if (!file) return res.status(400).json({ message: "No file uploaded" });
            const url = `/uploads/activities/${file.filename}`;
            return res.json({ url });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Internal server error" });
        }
    }
);

// ─── GET responses for an activity (with municipality/school filter) ──────────

router.get("/:id/responses", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id))
            return res.status(400).json({ message: "Invalid id" });

        const municipality = typeof req.query.municipality === "string" ? req.query.municipality.trim() : "";
        const school = typeof req.query.school === "string" ? req.query.school.trim() : "";
        const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

        const responses = await ActivityResponse.find({
            activityId: new mongoose.Types.ObjectId(id),
        }).sort({ submittedAt: -1 }).lean();

        // Fetch users
        const userIds = responses.map((r: any) => r.userId);
        const users = await User.find({ _id: { $in: userIds } })
            .select("name school municipality hlaRoleType")
            .lean();
        const userMap = new Map(users.map((u: any) => [String(u._id), u]));

        let enriched = responses.map((r: any) => {
            const u = userMap.get(String(r.userId)) as any;
            return {
                id: String(r._id),
                activityId: String(r.activityId),
                userId: String(r.userId),
                user: {
                    name: String(u?.name || ""),
                    school: String(u?.school || ""),
                    municipality: String(u?.municipality || ""),
                    hlaRoleType: String(u?.hlaRoleType || ""),
                },
                answers: Array.isArray(r.answers)
                    ? r.answers.map((a: any) => ({ fieldId: String(a.fieldId), value: String(a.value || "") }))
                    : [],
                submittedAt: r.submittedAt ? new Date(r.submittedAt).toISOString() : "",
            };
        });

        if (municipality) enriched = enriched.filter((r) => r.user.municipality === municipality);
        if (school) enriched = enriched.filter((r) => r.user.school === school);
        if (search) {
            const q = search.toLowerCase();
            enriched = enriched.filter(
                (r) =>
                    r.user.name.toLowerCase().includes(q) ||
                    r.user.school.toLowerCase().includes(q) ||
                    r.user.municipality.toLowerCase().includes(q)
            );
        }

        return res.json({ responses: enriched });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

export default router;

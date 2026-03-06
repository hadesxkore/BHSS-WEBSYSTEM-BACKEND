import { Router } from "express";
import mongoose from "mongoose";

import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { Activity } from "../models/Activity";
import { ActivityResponse } from "../models/ActivityResponse";

const router = Router();

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
            options: Array.isArray(f.options) ? f.options.map(String) : [],
            photoUrl: String(f.photoUrl || ""),
            unit: String(f.unit || ""),
            placeholder: String(f.placeholder || ""),
        })),
        createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : "",
    };
}

// ─── GET active activities (for users) ───────────────────────────────────────

router.get("/", requireAuth, async (_req, res) => {
    try {
        const list = await Activity.find({ isActive: true })
            .sort({ createdAt: -1 })
            .lean();
        return res.json({ activities: list.map(formatActivity) });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

// ─── GET a single activity ────────────────────────────────────────────────────

router.get("/:id", requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id))
            return res.status(400).json({ message: "Invalid id" });

        const activity = await Activity.findOne({ _id: id, isActive: true }).lean();
        if (!activity) return res.status(404).json({ message: "Activity not found" });
        return res.json({ activity: formatActivity(activity) });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

// ─── GET my own previous response for an activity ────────────────────────────

router.get("/:id/my-response", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id))
            return res.status(400).json({ message: "Invalid id" });

        const existing = await ActivityResponse.findOne({
            activityId: new mongoose.Types.ObjectId(id),
            userId: req.user!.id,
        }).lean();

        if (!existing) return res.json({ response: null });

        return res.json({
            response: {
                id: String((existing as any)._id),
                answers: (existing as any).answers || [],
                submittedAt: (existing as any).submittedAt
                    ? new Date((existing as any).submittedAt).toISOString()
                    : "",
            },
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

// ─── SUBMIT / UPDATE response ─────────────────────────────────────────────────

router.post("/:id/submit", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id))
            return res.status(400).json({ message: "Invalid id" });

        if (!req.user?.id) return res.status(401).json({ message: "Unauthorized" });

        const activity = await Activity.findOne({ _id: id, isActive: true }).lean();
        if (!activity) return res.status(404).json({ message: "Activity not found or inactive" });

        const { answers } = req.body as { answers?: Array<{ fieldId: string; value: string }> };
        const parsedAnswers = Array.isArray(answers)
            ? answers.map((a) => ({ fieldId: String(a.fieldId || ""), value: String(a.value ?? "") }))
            : [];

        const saved = await ActivityResponse.findOneAndUpdate(
            {
                activityId: new mongoose.Types.ObjectId(id),
                userId: new mongoose.Types.ObjectId(req.user.id),
            },
            {
                $set: {
                    answers: parsedAnswers,
                    submittedAt: new Date(),
                },
            },
            { new: true, upsert: true }
        );

        return res.json({
            response: {
                id: String((saved as any)._id),
                answers: (saved as any).answers || [],
                submittedAt: (saved as any).submittedAt
                    ? new Date((saved as any).submittedAt).toISOString()
                    : "",
            },
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

export default router;

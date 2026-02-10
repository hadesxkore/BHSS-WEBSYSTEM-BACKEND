import { Router } from "express";

import { requireAdmin, requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { DeliveryRecord } from "../models/DeliveryRecord";

const router = Router();

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

router.get("/history", requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const from = typeof req.query.from === "string" ? req.query.from : "";
    const to = typeof req.query.to === "string" ? req.query.to : "";
    const search = typeof req.query.search === "string" ? req.query.search : "";
    const sort = typeof req.query.sort === "string" ? req.query.sort : "newest";

    const match: Record<string, any> = {};

    if (from && to) {
      match.dateKey = { $gte: from, $lte: to };
    } else if (from) {
      match.dateKey = { $gte: from };
    } else if (to) {
      match.dateKey = { $lte: to };
    }

    const sortStage =
      sort === "oldest" ? { uploadedAt: 1, updatedAt: 1 } : { uploadedAt: -1, updatedAt: -1 };

    const pipeline: any[] = [
      { $match: match },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    ];

    if (search.trim()) {
      const rx = new RegExp(escapeRegex(search.trim()), "i");
      pipeline.push({
        $match: {
          $or: [
            { dateKey: rx },
            { categoryLabel: rx },
            { categoryKey: rx },
            { status: rx },
            { statusReason: rx },
            { remarks: rx },
            { concerns: rx },
            { "user.municipality": rx },
            { "user.school": rx },
            { "user.schoolAddress": rx },
            { "user.username": rx },
          ],
        },
      });
    }

    pipeline.push(
      { $sort: sortStage },
      { $limit: 5000 },
      {
        $project: {
          _id: 1,
          dateKey: 1,
          categoryKey: 1,
          categoryLabel: 1,
          status: 1,
          statusReason: 1,
          uploadedAt: 1,
          concerns: 1,
          remarks: 1,
          images: {
            $map: {
              input: "$images",
              as: "img",
              in: { filename: "$$img.filename", url: "$$img.url" },
            },
          },
          municipality: { $ifNull: ["$user.municipality", ""] },
          school: { $ifNull: ["$user.school", ""] },
        },
      }
    );

    const records = await DeliveryRecord.aggregate(pipeline);

    return res.json({
      records: (records || []).map((r: any) => ({
        id: String(r._id),
        dateKey: r.dateKey,
        municipality: r.municipality || "",
        school: r.school || "",
        categoryKey: r.categoryKey,
        categoryLabel: r.categoryLabel,
        status: r.status,
        statusReason: r.statusReason || "",
        uploadedAt: r.uploadedAt ? new Date(r.uploadedAt).toISOString() : "",
        images: Array.isArray(r.images) ? r.images : [],
        concerns: Array.isArray(r.concerns) ? r.concerns : [],
        remarks: r.remarks || "",
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;

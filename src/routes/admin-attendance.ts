import { Router } from "express";

import { requireAdmin, requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { AttendanceRecord } from "../models/AttendanceRecord";

const router = Router();

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

router.get("/history", requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const from = typeof req.query.from === "string" ? req.query.from.trim() : "";
    const to = typeof req.query.to === "string" ? req.query.to.trim() : "";
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
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
      sort === "oldest" ? { dateKey: 1, updatedAt: 1 } : { dateKey: -1, updatedAt: -1 };

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

    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      pipeline.push({
        $match: {
          $or: [
            { dateKey: rx },
            { grade: rx },
            { notes: rx },
            { "user.school": rx },
            { "user.municipality": rx },
            { "user.name": rx },
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
          grade: 1,
          present: 1,
          absent: 1,
          notes: 1,
          createdAt: 1,
          updatedAt: 1,
          userId: 1,
          municipality: "$user.municipality",
          school: "$user.school",
          userName: "$user.name",
        },
      }
    );

    const records = await AttendanceRecord.aggregate(pipeline);
    return res.json({ records });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;

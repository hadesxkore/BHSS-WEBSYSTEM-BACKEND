import { Router } from "express";
import fs from "fs";
import mongoose from "mongoose";

import { requireAdmin, requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { FileSubmission } from "../models/FileSubmission";

const router = Router();

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDayRange(from?: string, to?: string) {
  const fromRaw = typeof from === "string" ? from.trim() : "";
  const toRaw = typeof to === "string" ? to.trim() : "";

  const mFrom = fromRaw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const mTo = toRaw.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  const start = mFrom
    ? new Date(Number(mFrom[1]), Number(mFrom[2]) - 1, Number(mFrom[3]), 0, 0, 0, 0)
    : null;
  const endExclusive = mTo
    ? new Date(Number(mTo[1]), Number(mTo[2]) - 1, Number(mTo[3]) + 1, 0, 0, 0, 0)
    : null;

  if (start && endExclusive) return { start, endExclusive };
  if (start && !endExclusive) {
    const d = new Date(start);
    d.setDate(d.getDate() + 1);
    return { start, endExclusive: d };
  }
  if (!start && endExclusive) {
    // If only "to" provided, treat it as a single day
    const d = new Date(endExclusive);
    d.setDate(d.getDate() - 1);
    return { start: d, endExclusive };
  }
  return null;
}

router.get("/history", requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const from = typeof req.query.from === "string" ? req.query.from : "";
    const to = typeof req.query.to === "string" ? req.query.to : "";
    const folder = typeof req.query.folder === "string" ? req.query.folder.trim() : "";
    const coordinatorId =
      typeof req.query.coordinatorId === "string" ? req.query.coordinatorId.trim() : "";
    const municipality =
      typeof req.query.municipality === "string" ? req.query.municipality.trim() : "";
    const school = typeof req.query.school === "string" ? req.query.school.trim() : "";
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    const match: Record<string, any> = {};

    if (folder) match.folder = folder;
    if (coordinatorId && mongoose.Types.ObjectId.isValid(coordinatorId)) {
      match.userId = new mongoose.Types.ObjectId(coordinatorId);
    }

    const range = parseDayRange(from, to);
    if (range) {
      match.uploadDate = { $gte: range.start, $lt: range.endExclusive };
    }

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
      { $match: { "user.hlaRoleType": "HLA Coordinator" } },
    ];

    if (municipality) {
      pipeline.push({ $match: { "user.municipality": municipality } });
    }

    if (school) {
      pipeline.push({ $match: { "user.school": school } });
    }

    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      pipeline.push({
        $match: {
          $or: [
            { folder: rx },
            { originalName: rx },
            { fileName: rx },
            { description: rx },
            { status: rx },
            { mimeType: rx },
            { "user.name": rx },
            { "user.username": rx },
            { "user.school": rx },
            { "user.municipality": rx },
            { "user.hlaRoleType": rx },
          ],
        },
      });
    }

    pipeline.push(
      { $sort: { uploadDate: -1, createdAt: -1 } },
      { $limit: 5000 },
      {
        $project: {
          _id: 1,
          folder: 1,
          fileName: 1,
          originalName: 1,
          fileSize: 1,
          mimeType: 1,
          description: 1,
          uploadDate: 1,
          status: 1,
          createdAt: 1,
          updatedAt: 1,
          user: {
            _id: "$user._id",
            name: "$user.name",
            username: "$user.username",
            municipality: "$user.municipality",
            school: "$user.school",
            hlaRoleType: "$user.hlaRoleType",
          },
        },
      }
    );

    const records = await FileSubmission.aggregate(pipeline);

    return res.json({
      records: (records || []).map((r: any) => ({
        id: String(r._id),
        folder: String(r.folder || ""),
        name: String(r.originalName || ""),
        size: Number(r.fileSize || 0),
        type: String(r.mimeType || ""),
        description: String(r.description || ""),
        uploadedAt: r.uploadDate ? new Date(r.uploadDate).toISOString() : "",
        status: String(r.status || ""),
        url: r.fileName ? `/uploads/file-submissions/${String(r.fileName)}` : "",
        coordinator: {
          id: String(r.user?._id || ""),
          name: String(r.user?.name || ""),
          username: String(r.user?.username || ""),
          municipality: String(r.user?.municipality || ""),
          school: String(r.user?.school || ""),
          hlaRoleType: String(r.user?.hlaRoleType || ""),
        },
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/download/:id", requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "id is required" });

    const file = await FileSubmission.findById(id);
    if (!file) return res.status(404).json({ message: "File not found" });

    if (!fs.existsSync(file.filePath)) {
      return res.status(404).json({ message: "File not found on server" });
    }

    res.setHeader("Content-Disposition", `attachment; filename="${file.originalName}"`);
    res.setHeader("Content-Type", file.mimeType);

    const fileStream = fs.createReadStream(file.filePath);
    fileStream.pipe(res);
  } catch (err) {
    console.error("Error downloading file:", err);
    return res.status(500).json({ message: "Failed to download file" });
  }
});

export default router;

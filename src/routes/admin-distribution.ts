import { Router } from "express";
import crypto from "crypto";

import {
  requireAdmin,
  requireAuth,
  type AuthenticatedRequest,
} from "../middleware/auth";
import { WaterDistributionBatch } from "../models/WaterDistributionBatch";
import { WaterDistributionRow } from "../models/WaterDistributionRow";
import { LpgDistributionBatch } from "../models/LpgDistributionBatch";
import { LpgDistributionRow } from "../models/LpgDistributionRow";

const router = Router();

function normalizeString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// -----------------------------------
// Water Distribution
// -----------------------------------

router.get(
  "/water/batches",
  requireAuth,
  requireAdmin,
  async (_req: AuthenticatedRequest, res) => {
    try {
      const batches = await WaterDistributionBatch.find({}).sort({ createdAt: -1 }).limit(200);
      return res.json({
        batches: batches.map((b) => ({
          id: String(b._id),
          municipality: b.municipality,
          bhssKitchenName: b.bhssKitchenName,
          sheetName: b.sheetName || "",
          sourceFileName: b.sourceFileName || "",
          uploadedByUserId: b.uploadedByUserId || "",
          createdAt: b.createdAt,
        })),
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get(
  "/water/latest",
  requireAuth,
  requireAdmin,
  async (_req: AuthenticatedRequest, res) => {
    try {
      const batch = await WaterDistributionBatch.findOne({})
        .sort({ createdAt: -1 })
        .select({ municipality: 1, bhssKitchenName: 1, sheetName: 1, sourceFileName: 1, uploadedByUserId: 1, createdAt: 1 })
        .lean();
      if (!batch) return res.json({ batch: null, rows: [] });

      const rows = await WaterDistributionRow.find({ batchId: batch._id })
        .sort({ municipality: 1, schoolName: 1 })
        .select({
          batchId: 1,
          municipality: 1,
          bhssKitchenName: 1,
          schoolName: 1,
          beneficiaries: 1,
          water: 1,
          week1: 1,
          week2: 1,
          week3: 1,
          week4: 1,
          week5: 1,
          total: 1,
          createdAt: 1,
        })
        .lean();

      return res.json({
        batch: {
          id: String((batch as any)._id),
          municipality: (batch as any).municipality || "ALL",
          bhssKitchenName: (batch as any).bhssKitchenName,
          sheetName: (batch as any).sheetName || "",
          sourceFileName: (batch as any).sourceFileName || "",
          uploadedByUserId: (batch as any).uploadedByUserId || "",
          createdAt: (batch as any).createdAt,
        },
        rows: (rows || []).map((r: any) => ({
          id: String(r._id),
          batchId: String(r.batchId),
          municipality: r.municipality,
          bhssKitchenName: r.bhssKitchenName,
          schoolName: r.schoolName,
          beneficiaries: r.beneficiaries,
          water: r.water,
          week1: r.week1,
          week2: r.week2,
          week3: r.week3,
          week4: r.week4,
          week5: r.week5,
          total: r.total,
          createdAt: r.createdAt,
        })),
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get(
  "/water/batches/:batchId",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const batchId = normalizeString(req.params.batchId);
      if (!batchId) return res.status(400).json({ message: "batchId is required" });

      const batch = await WaterDistributionBatch.findById(batchId)
        .select({ municipality: 1, bhssKitchenName: 1, sheetName: 1, sourceFileName: 1, uploadedByUserId: 1, createdAt: 1 })
        .lean();
      if (!batch) return res.status(404).json({ message: "Batch not found" });

      const rows = await WaterDistributionRow.find({ batchId: (batch as any)._id })
        .sort({ schoolName: 1 })
        .select({
          batchId: 1,
          municipality: 1,
          bhssKitchenName: 1,
          schoolName: 1,
          beneficiaries: 1,
          water: 1,
          week1: 1,
          week2: 1,
          week3: 1,
          week4: 1,
          week5: 1,
          total: 1,
          createdAt: 1,
        })
        .lean();

      return res.json({
        batch: {
          id: String((batch as any)._id),
          municipality: (batch as any).municipality,
          bhssKitchenName: (batch as any).bhssKitchenName,
          sheetName: (batch as any).sheetName || "",
          sourceFileName: (batch as any).sourceFileName || "",
          uploadedByUserId: (batch as any).uploadedByUserId || "",
          createdAt: (batch as any).createdAt,
        },
        rows: (rows || []).map((r: any) => ({
          id: String(r._id),
          batchId: String(r.batchId),
          municipality: r.municipality,
          bhssKitchenName: r.bhssKitchenName,
          schoolName: r.schoolName,
          beneficiaries: r.beneficiaries,
          water: r.water,
          week1: r.week1,
          week2: r.week2,
          week3: r.week3,
          week4: r.week4,
          week5: r.week5,
          total: r.total,
          createdAt: r.createdAt,
        })),
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.post(
  "/water/batches",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const bhssKitchenName = normalizeString(req.body?.bhssKitchenName || "BHSS Kitchen");
      const sheetName = normalizeString(req.body?.sheetName);
      const sourceFileName = normalizeString(req.body?.sourceFileName);
      const items = Array.isArray(req.body?.items) ? req.body.items : [];

      if (!bhssKitchenName) {
        return res.status(400).json({ message: "bhssKitchenName is required" });
      }

      if (items.length === 0) {
        return res.status(400).json({ message: "items is required" });
      }

      const docs = items.map((it: any) => ({
        municipality: normalizeString(it?.municipality),
        bhssKitchenName,
        schoolName: normalizeString(it?.schoolName),
        beneficiaries: normalizeNumber(it?.beneficiaries),
        water: normalizeNumber(it?.water),
        week1: normalizeNumber(it?.week1),
        week2: normalizeNumber(it?.week2),
        week3: normalizeNumber(it?.week3),
        week4: normalizeNumber(it?.week4),
        week5: normalizeNumber(it?.week5),
        total: normalizeNumber(it?.total),
      }));

      if (docs.some((d: any) => !d.municipality || !d.schoolName)) {
        return res
          .status(400)
          .json({ message: "Each item requires municipality and schoolName" });
      }

      const contentHash = sha256(
        JSON.stringify({
          kind: "water",
          bhssKitchenName,
          sheetName,
          items: docs
            .slice()
            .sort((a: any, b: any) =>
              String(a.municipality).localeCompare(String(b.municipality)) ||
              String(a.schoolName).localeCompare(String(b.schoolName))
            ),
        })
      );

      const existing = await WaterDistributionBatch.findOne({ contentHash });
      if (existing) {
        return res.json({
          unchanged: true,
          batch: {
            id: String(existing._id),
            municipality: existing.municipality || "ALL",
            bhssKitchenName: existing.bhssKitchenName,
            sheetName: existing.sheetName || "",
            sourceFileName: existing.sourceFileName || "",
            uploadedByUserId: existing.uploadedByUserId || "",
            createdAt: existing.createdAt,
          },
        });
      }

      const batch = await WaterDistributionBatch.create({
        municipality: "ALL",
        bhssKitchenName,
        contentHash,
        sheetName,
        sourceFileName,
        uploadedByUserId: req.user?.id ? String(req.user.id) : "",
      });

      await WaterDistributionRow.insertMany(
        docs.map((d: any) => ({ ...d, batchId: batch._id })),
        { ordered: true }
      );

      return res.status(201).json({
        unchanged: false,
        batch: {
          id: String(batch._id),
          municipality: batch.municipality,
          bhssKitchenName: batch.bhssKitchenName,
          sheetName: batch.sheetName || "",
          sourceFileName: batch.sourceFileName || "",
          uploadedByUserId: batch.uploadedByUserId || "",
          createdAt: batch.createdAt,
        },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.delete(
  "/water/batches/:batchId",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const batchId = normalizeString(req.params.batchId);
      if (!batchId) return res.status(400).json({ message: "batchId is required" });

      const batch = await WaterDistributionBatch.findById(batchId);
      if (!batch) return res.status(404).json({ message: "Batch not found" });

      await WaterDistributionRow.deleteMany({ batchId: batch._id });
      await WaterDistributionBatch.deleteOne({ _id: batch._id });

      return res.json({ message: "Deleted" });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.patch(
  "/water/rows/:rowId",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const rowId = normalizeString(req.params.rowId);
      const field = normalizeString(req.body?.field);
      const value = normalizeNumber(req.body?.value);

      if (!rowId) return res.status(400).json({ message: "rowId is required" });

      const allowed = new Set([
        "beneficiaries",
        "water",
        "week1",
        "week2",
        "week3",
        "week4",
        "week5",
        "total",
      ]);

      if (!allowed.has(field)) {
        return res.status(400).json({ message: "Invalid field" });
      }

      const updated = await WaterDistributionRow.findByIdAndUpdate(
        rowId,
        { $set: { [field]: value } },
        { new: true }
      );

      if (!updated) return res.status(404).json({ message: "Row not found" });

      return res.json({
        row: {
          id: String(updated._id),
          batchId: String(updated.batchId),
          municipality: updated.municipality,
          bhssKitchenName: updated.bhssKitchenName,
          schoolName: updated.schoolName,
          beneficiaries: updated.beneficiaries,
          water: updated.water,
          week1: updated.week1,
          week2: updated.week2,
          week3: updated.week3,
          week4: updated.week4,
          week5: updated.week5,
          total: updated.total,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

// -----------------------------------
// LPG Distribution
// -----------------------------------

router.get(
  "/lpg/batches",
  requireAuth,
  requireAdmin,
  async (_req: AuthenticatedRequest, res) => {
    try {
      const batches = await LpgDistributionBatch.find({}).sort({ createdAt: -1 }).limit(200);
      return res.json({
        batches: batches.map((b) => ({
          id: String(b._id),
          municipality: b.municipality || "ALL",
          bhssKitchenName: b.bhssKitchenName,
          sheetName: b.sheetName || "",
          sourceFileName: b.sourceFileName || "",
          uploadedByUserId: b.uploadedByUserId || "",
          createdAt: b.createdAt,
        })),
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get(
  "/lpg/latest",
  requireAuth,
  requireAdmin,
  async (_req: AuthenticatedRequest, res) => {
    try {
      const batch = await LpgDistributionBatch.findOne({})
        .sort({ createdAt: -1 })
        .select({ municipality: 1, bhssKitchenName: 1, sheetName: 1, sourceFileName: 1, uploadedByUserId: 1, createdAt: 1 })
        .lean();
      if (!batch) return res.json({ batch: null, rows: [] });

      const rows = await LpgDistributionRow.find({ batchId: (batch as any)._id })
        .sort({ municipality: 1, schoolName: 1 })
        .select({ batchId: 1, municipality: 1, bhssKitchenName: 1, schoolName: 1, gasul: 1, createdAt: 1 })
        .lean();

      return res.json({
        batch: {
          id: String((batch as any)._id),
          municipality: (batch as any).municipality || "ALL",
          bhssKitchenName: (batch as any).bhssKitchenName,
          sheetName: (batch as any).sheetName || "",
          sourceFileName: (batch as any).sourceFileName || "",
          uploadedByUserId: (batch as any).uploadedByUserId || "",
          createdAt: (batch as any).createdAt,
        },
        rows: (rows || []).map((r: any) => ({
          id: String(r._id),
          batchId: String(r.batchId),
          municipality: r.municipality,
          bhssKitchenName: r.bhssKitchenName,
          schoolName: r.schoolName,
          gasul: r.gasul,
          createdAt: r.createdAt,
        })),
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get(
  "/lpg/batches/:batchId",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const batchId = normalizeString(req.params.batchId);
      if (!batchId) return res.status(400).json({ message: "batchId is required" });

      const batch = await LpgDistributionBatch.findById(batchId);
      if (!batch) return res.status(404).json({ message: "Batch not found" });

      const rows = await LpgDistributionRow.find({ batchId: batch._id }).sort({ municipality: 1, schoolName: 1 });

      return res.json({
        batch: {
          id: String(batch._id),
          municipality: batch.municipality || "ALL",
          bhssKitchenName: batch.bhssKitchenName,
          sheetName: batch.sheetName || "",
          sourceFileName: batch.sourceFileName || "",
          uploadedByUserId: batch.uploadedByUserId || "",
          createdAt: batch.createdAt,
        },
        rows: rows.map((r) => ({
          id: String(r._id),
          batchId: String(r.batchId),
          municipality: r.municipality,
          bhssKitchenName: r.bhssKitchenName,
          schoolName: r.schoolName,
          gasul: r.gasul,
          createdAt: r.createdAt,
        })),
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.post(
  "/lpg/batches",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const bhssKitchenName = normalizeString(req.body?.bhssKitchenName || "BHSS Kitchen");
      const sheetName = normalizeString(req.body?.sheetName);
      const sourceFileName = normalizeString(req.body?.sourceFileName);
      const items = Array.isArray(req.body?.items) ? req.body.items : [];

      if (!bhssKitchenName) {
        return res.status(400).json({ message: "bhssKitchenName is required" });
      }

      if (items.length === 0) {
        return res.status(400).json({ message: "items is required" });
      }

      const docs = items.map((it: any) => ({
        municipality: normalizeString(it?.municipality),
        bhssKitchenName,
        schoolName: normalizeString(it?.schoolName),
        gasul: normalizeNumber(it?.gasul),
      }));

      if (docs.some((d: any) => !d.municipality || !d.schoolName)) {
        return res
          .status(400)
          .json({ message: "Each item requires municipality and schoolName" });
      }

      const contentHash = sha256(
        JSON.stringify({
          kind: "lpg",
          bhssKitchenName,
          sheetName,
          items: docs
            .slice()
            .sort((a: any, b: any) =>
              String(a.municipality).localeCompare(String(b.municipality)) ||
              String(a.schoolName).localeCompare(String(b.schoolName))
            ),
        })
      );

      const existing = await LpgDistributionBatch.findOne({ contentHash });
      if (existing) {
        return res.json({
          unchanged: true,
          batch: {
            id: String(existing._id),
            municipality: existing.municipality || "ALL",
            bhssKitchenName: existing.bhssKitchenName,
            sheetName: existing.sheetName || "",
            sourceFileName: existing.sourceFileName || "",
            uploadedByUserId: existing.uploadedByUserId || "",
            createdAt: existing.createdAt,
          },
        });
      }

      const batch = await LpgDistributionBatch.create({
        municipality: "ALL",
        bhssKitchenName,
        contentHash,
        sheetName,
        sourceFileName,
        uploadedByUserId: req.user?.id ? String(req.user.id) : "",
      });

      await LpgDistributionRow.insertMany(
        docs.map((d: any) => ({ ...d, batchId: batch._id })),
        { ordered: true }
      );

      return res.status(201).json({
        unchanged: false,
        batch: {
          id: String(batch._id),
          municipality: batch.municipality || "ALL",
          bhssKitchenName: batch.bhssKitchenName,
          sheetName: batch.sheetName || "",
          sourceFileName: batch.sourceFileName || "",
          uploadedByUserId: batch.uploadedByUserId || "",
          createdAt: batch.createdAt,
        },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.delete(
  "/lpg/batches/:batchId",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const batchId = normalizeString(req.params.batchId);
      if (!batchId) return res.status(400).json({ message: "batchId is required" });

      const batch = await LpgDistributionBatch.findById(batchId);
      if (!batch) return res.status(404).json({ message: "Batch not found" });

      await LpgDistributionRow.deleteMany({ batchId: batch._id });
      await LpgDistributionBatch.deleteOne({ _id: batch._id });

      return res.json({ message: "Deleted" });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.patch(
  "/lpg/rows/:rowId",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const rowId = normalizeString(req.params.rowId);
      const field = normalizeString(req.body?.field);
      const value = normalizeNumber(req.body?.value);

      if (!rowId) return res.status(400).json({ message: "rowId is required" });
      if (field !== "gasul") return res.status(400).json({ message: "Invalid field" });

      const updated = await LpgDistributionRow.findByIdAndUpdate(
        rowId,
        { $set: { gasul: value } },
        { new: true }
      );

      if (!updated) return res.status(404).json({ message: "Row not found" });

      return res.json({
        row: {
          id: String(updated._id),
          batchId: String(updated.batchId),
          municipality: updated.municipality,
          bhssKitchenName: updated.bhssKitchenName,
          schoolName: updated.schoolName,
          gasul: updated.gasul,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;

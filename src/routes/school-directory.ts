import { Router } from "express";

import { requireAdmin, requireAuth } from "../middleware/auth";
import { SchoolBeneficiary } from "../models/SchoolBeneficiary";
import { SchoolDetails } from "../models/SchoolDetails";

const router = Router();

function normalizeString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// ----------------------------
// Beneficiaries
// ----------------------------
router.get("/beneficiaries", requireAuth, requireAdmin, async (req, res) => {
  try {
    const municipality = normalizeString(req.query.municipality);
    const schoolYear = normalizeString(req.query.schoolYear);

    if (!municipality || !schoolYear) {
      return res.status(400).json({ message: "municipality and schoolYear are required" });
    }

    const rows = await SchoolBeneficiary.find({ municipality, schoolYear }).sort({
      bhssKitchenName: 1,
      schoolName: 1,
      createdAt: -1,
    });

    return res.json({
      rows: rows.map((r) => ({
        id: r._id,
        municipality: r.municipality,
        schoolYear: r.schoolYear,
        bhssKitchenName: r.bhssKitchenName,
        schoolName: r.schoolName,
        grade2: r.grade2,
        grade3: r.grade3,
        grade4: r.grade4,
        total: r.total,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post(
  "/beneficiaries/bulk",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const municipality = normalizeString(req.body?.municipality);
      const schoolYear = normalizeString(req.body?.schoolYear);
      const items = Array.isArray(req.body?.items) ? req.body.items : [];

      if (!municipality || !schoolYear) {
        return res.status(400).json({ message: "municipality and schoolYear are required" });
      }

      if (items.length === 0) {
        return res.status(400).json({ message: "items is required" });
      }

      const docs = items.map((it: any) => ({
        municipality,
        schoolYear,
        bhssKitchenName: normalizeString(it?.bhssKitchenName),
        schoolName: normalizeString(it?.schoolName),
        grade2: normalizeNumber(it?.grade2),
        grade3: normalizeNumber(it?.grade3),
        grade4: normalizeNumber(it?.grade4),
      }));

      if (docs.some((d: any) => !d.bhssKitchenName || !d.schoolName)) {
        return res
          .status(400)
          .json({ message: "Each item requires bhssKitchenName and schoolName" });
      }

      const created = await SchoolBeneficiary.insertMany(docs, { ordered: true });

      return res.status(201).json({
        rows: created.map((r) => ({
          id: r._id,
          municipality: r.municipality,
          schoolYear: r.schoolYear,
          bhssKitchenName: r.bhssKitchenName,
          schoolName: r.schoolName,
          grade2: r.grade2,
          grade3: r.grade3,
          grade4: r.grade4,
          total: r.total,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.patch("/beneficiaries/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);

    const update: any = {};

    if (req.body?.bhssKitchenName !== undefined) {
      update.bhssKitchenName = normalizeString(req.body.bhssKitchenName);
    }

    if (req.body?.schoolName !== undefined) {
      update.schoolName = normalizeString(req.body.schoolName);
    }

    if (req.body?.grade2 !== undefined) {
      update.grade2 = normalizeNumber(req.body.grade2);
    }

    if (req.body?.grade3 !== undefined) {
      update.grade3 = normalizeNumber(req.body.grade3);
    }

    if (req.body?.grade4 !== undefined) {
      update.grade4 = normalizeNumber(req.body.grade4);
    }

    const row = await SchoolBeneficiary.findById(id);
    if (!row) {
      return res.status(404).json({ message: "Row not found" });
    }

    Object.assign(row, update);
    await row.save();

    return res.json({
      row: {
        id: row._id,
        municipality: row.municipality,
        schoolYear: row.schoolYear,
        bhssKitchenName: row.bhssKitchenName,
        schoolName: row.schoolName,
        grade2: row.grade2,
        grade3: row.grade3,
        grade4: row.grade4,
        total: row.total,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.delete("/beneficiaries/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);

    const row = await SchoolBeneficiary.findByIdAndDelete(id);
    if (!row) {
      return res.status(404).json({ message: "Row not found" });
    }

    return res.json({ message: "Deleted" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ----------------------------
// School Details
// ----------------------------
router.get("/details", requireAuth, requireAdmin, async (req, res) => {
  try {
    const municipality = normalizeString(req.query.municipality);
    const schoolYear = normalizeString(req.query.schoolYear);

    if (!municipality || !schoolYear) {
      return res.status(400).json({ message: "municipality and schoolYear are required" });
    }

    const rows = await SchoolDetails.find({ municipality, schoolYear }).sort({
      completeName: 1,
      createdAt: -1,
    });

    return res.json({
      rows: rows.map((r) => ({
        id: r._id,
        municipality: r.municipality,
        schoolYear: r.schoolYear,
        completeName: r.completeName,
        principalName: r.principalName,
        principalContact: r.principalContact,
        hlaCoordinatorName: r.hlaCoordinatorName,
        hlaCoordinatorContact: r.hlaCoordinatorContact,
        hlaCoordinatorFacebook: r.hlaCoordinatorFacebook,
        hlaManagerName: r.hlaManagerName,
        hlaManagerContact: r.hlaManagerContact,
        hlaManagerFacebook: r.hlaManagerFacebook,
        chiefCookName: r.chiefCookName,
        chiefCookContact: r.chiefCookContact,
        chiefCookFacebook: r.chiefCookFacebook,
        assistantCookName: r.assistantCookName,
        assistantCookContact: r.assistantCookContact,
        assistantCookFacebook: r.assistantCookFacebook,
        nurseName: r.nurseName,
        nurseContact: r.nurseContact,
        nurseFacebook: r.nurseFacebook,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/details", requireAuth, requireAdmin, async (req, res) => {
  try {
    const municipality = normalizeString(req.body?.municipality);
    const schoolYear = normalizeString(req.body?.schoolYear);

    if (!municipality || !schoolYear) {
      return res.status(400).json({ message: "municipality and schoolYear are required" });
    }

    const completeName = normalizeString(req.body?.completeName);
    if (!completeName) {
      return res.status(400).json({ message: "completeName is required" });
    }

    const row = await SchoolDetails.create({
      municipality,
      schoolYear,
      completeName,
      principalName: normalizeString(req.body?.principalName),
      principalContact: normalizeString(req.body?.principalContact),
      hlaCoordinatorName: normalizeString(req.body?.hlaCoordinatorName),
      hlaCoordinatorContact: normalizeString(req.body?.hlaCoordinatorContact),
      hlaCoordinatorFacebook: normalizeString(req.body?.hlaCoordinatorFacebook),
      hlaManagerName: normalizeString(req.body?.hlaManagerName),
      hlaManagerContact: normalizeString(req.body?.hlaManagerContact),
      hlaManagerFacebook: normalizeString(req.body?.hlaManagerFacebook),
      chiefCookName: normalizeString(req.body?.chiefCookName),
      chiefCookContact: normalizeString(req.body?.chiefCookContact),
      chiefCookFacebook: normalizeString(req.body?.chiefCookFacebook),
      assistantCookName: normalizeString(req.body?.assistantCookName),
      assistantCookContact: normalizeString(req.body?.assistantCookContact),
      assistantCookFacebook: normalizeString(req.body?.assistantCookFacebook),
      nurseName: normalizeString(req.body?.nurseName),
      nurseContact: normalizeString(req.body?.nurseContact),
      nurseFacebook: normalizeString(req.body?.nurseFacebook),
    });

    return res.status(201).json({
      row: {
        id: row._id,
        municipality: row.municipality,
        schoolYear: row.schoolYear,
        completeName: row.completeName,
        principalName: row.principalName,
        principalContact: row.principalContact,
        hlaCoordinatorName: row.hlaCoordinatorName,
        hlaCoordinatorContact: row.hlaCoordinatorContact,
        hlaCoordinatorFacebook: row.hlaCoordinatorFacebook,
        hlaManagerName: row.hlaManagerName,
        hlaManagerContact: row.hlaManagerContact,
        hlaManagerFacebook: row.hlaManagerFacebook,
        chiefCookName: row.chiefCookName,
        chiefCookContact: row.chiefCookContact,
        chiefCookFacebook: row.chiefCookFacebook,
        assistantCookName: row.assistantCookName,
        assistantCookContact: row.assistantCookContact,
        assistantCookFacebook: row.assistantCookFacebook,
        nurseName: row.nurseName,
        nurseContact: row.nurseContact,
        nurseFacebook: row.nurseFacebook,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.patch("/details/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);

    const row = await SchoolDetails.findById(id);
    if (!row) {
      return res.status(404).json({ message: "Row not found" });
    }

    const fields = [
      "completeName",
      "principalName",
      "principalContact",
      "hlaCoordinatorName",
      "hlaCoordinatorContact",
      "hlaCoordinatorFacebook",
      "hlaManagerName",
      "hlaManagerContact",
      "hlaManagerFacebook",
      "chiefCookName",
      "chiefCookContact",
      "chiefCookFacebook",
      "assistantCookName",
      "assistantCookContact",
      "assistantCookFacebook",
      "nurseName",
      "nurseContact",
      "nurseFacebook",
    ] as const;

    fields.forEach((f) => {
      if (req.body?.[f] !== undefined) {
        (row as any)[f] = normalizeString(req.body[f]);
      }
    });

    if (!row.completeName) {
      return res.status(400).json({ message: "completeName is required" });
    }

    await row.save();

    return res.json({
      row: {
        id: row._id,
        municipality: row.municipality,
        schoolYear: row.schoolYear,
        completeName: row.completeName,
        principalName: row.principalName,
        principalContact: row.principalContact,
        hlaCoordinatorName: row.hlaCoordinatorName,
        hlaCoordinatorContact: row.hlaCoordinatorContact,
        hlaCoordinatorFacebook: row.hlaCoordinatorFacebook,
        hlaManagerName: row.hlaManagerName,
        hlaManagerContact: row.hlaManagerContact,
        hlaManagerFacebook: row.hlaManagerFacebook,
        chiefCookName: row.chiefCookName,
        chiefCookContact: row.chiefCookContact,
        chiefCookFacebook: row.chiefCookFacebook,
        assistantCookName: row.assistantCookName,
        assistantCookContact: row.assistantCookContact,
        assistantCookFacebook: row.assistantCookFacebook,
        nurseName: row.nurseName,
        nurseContact: row.nurseContact,
        nurseFacebook: row.nurseFacebook,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.delete("/details/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);

    const row = await SchoolDetails.findByIdAndDelete(id);
    if (!row) {
      return res.status(404).json({ message: "Row not found" });
    }

    return res.json({ message: "Deleted" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;

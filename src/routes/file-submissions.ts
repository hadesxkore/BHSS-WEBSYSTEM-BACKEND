import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { FileSubmission } from "../models/FileSubmission";
import { User } from "../models/User";
import { requireAuth } from "../middleware/auth";

const router = Router();

const FRUITS_VEG_FOLDER = "Fruits & Vegetables";

function normalizeFolderForClient(folder: unknown): string {
  const raw = String(folder || "");
  if (raw === "Fruits" || raw === "Vegetables") return FRUITS_VEG_FOLDER;
  return raw;
}

function getLocalDayRange(dateStr: string) {
  const raw = String(dateStr || "").trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;

  const start = new Date(y, mo - 1, d, 0, 0, 0, 0);
  const end = new Date(y, mo - 1, d + 1, 0, 0, 0, 0);
  return { start, end };
}

// Ensure uploads directory exists
const UPLOAD_ROOT = (process.env.UPLOAD_DIR || path.resolve(process.cwd(), "uploads")).trim();
const uploadsDir = path.join(UPLOAD_ROOT, "file-submissions");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  },
});

// File filter
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // If the folder is COA, allow all file types
  if (req.body.folder === "COA") {
    return cb(null, true);
  }

  const allowedMimes = [
    "image/jpeg",
    "image/png",
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only JPEG/PNG images are allowed."));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 15,
  },
});

// Get all files for the authenticated user
router.get("/", requireAuth, async (req: any, res) => {
  try {
    const { folder, date } = req.query;
    const userId = req.user?.id;

    const query: any = { userId };

    if (folder) {
      if (String(folder) === FRUITS_VEG_FOLDER) {
        query.folder = { $in: [FRUITS_VEG_FOLDER, "Fruits", "Vegetables"] };
      } else {
        query.folder = folder;
      }
    }

    if (date) {
      const range = getLocalDayRange(String(date));
      if (range) {
        query.uploadDate = {
          $gte: range.start,
          $lt: range.end,
        };
      }
    }

    const files = await FileSubmission.find(query).sort({ createdAt: -1 });

    return res.json({
      files: files.map((file) => ({
        id: file._id,
        name: file.originalName,
        size: file.fileSize,
        type: file.mimeType,
        description: file.description,
        uploadedAt: file.uploadDate,
        status: file.status,
        folder: normalizeFolderForClient(file.folder),
        url: `/uploads/file-submissions/${file.fileName}`,
      })),
    });
  } catch (err) {
    console.error("Error fetching files:", err);
    return res.status(500).json({ message: "Failed to fetch files" });
  }
});

// Upload files
router.post("/upload", requireAuth, upload.array("files", 15), async (req: any, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    const { folder, description, uploadDate } = req.body;
    const userId = req.user?.id;

    if (!files || files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    if (!folder) {
      return res.status(400).json({ message: "Folder is required" });
    }

    const folderRaw = String(folder || "");
    const folderNormalized =
      folderRaw === "Fruits" || folderRaw === "Vegetables" ? FRUITS_VEG_FOLDER : folderRaw;

    const validFolders = [
      FRUITS_VEG_FOLDER,
      "Meat",
      "NutriBun",
      "Patties",
      "Groceries",
      "Consumables",
      "Water",
      "LPG",
      "Rice",
      "COA",
      "Others",
    ];

    if (!validFolders.includes(folderNormalized)) {
      return res.status(400).json({ message: "Invalid folder" });
    }

    const date = uploadDate ? new Date(uploadDate) : new Date();

    const savedFiles = await Promise.all(
      files.map(async (file) => {
        const fileSubmission = new FileSubmission({
          userId,
          folder: folderNormalized,
          fileName: file.filename,
          originalName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          filePath: file.path,
          description: description || "",
          uploadDate: date,
          status: "uploaded",
        });

        await fileSubmission.save();
        return fileSubmission;
      })
    );

    try {
      const io = req.app.get("io") as any;
      const u = await User.findById(userId).select("name school municipality username hlaRoleType").lean();
      if (io && savedFiles.length > 0) {
        io.emit("file-submission:uploaded", {
          submission: {
            userId: String(userId || ""),
            folder: String(folderNormalized || ""),
            filesCount: savedFiles.length,
            uploadedAt: date,
            firstFileName: String((savedFiles[0] as any)?.originalName || ""),
          },
          user: {
            id: String(userId || ""),
            name: String((u as any)?.name || ""),
            username: String((u as any)?.username || ""),
            school: String((u as any)?.school || ""),
            municipality: String((u as any)?.municipality || ""),
            hlaRoleType: String((u as any)?.hlaRoleType || ""),
          },
        });
      }
    } catch (emitErr) {
      console.error("Failed to emit file-submission:uploaded", emitErr);
    }

    return res.json({
      message: `${savedFiles.length} file(s) uploaded successfully`,
      files: savedFiles.map((file) => ({
        id: file._id,
        name: file.originalName,
        size: file.fileSize,
        type: file.mimeType,
        description: file.description,
        uploadedAt: file.uploadDate,
        status: file.status,
        folder: normalizeFolderForClient(file.folder),
        url: `/uploads/file-submissions/${file.fileName}`,
      })),
    });
  } catch (err) {
    console.error("Error uploading files:", err);
    return res.status(500).json({ message: "Failed to upload files" });
  }
});

// Delete a file
router.delete("/:id", requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const file = await FileSubmission.findOne({ _id: id, userId });

    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    // Delete the physical file
    if (fs.existsSync(file.filePath)) {
      fs.unlinkSync(file.filePath);
    }

    await FileSubmission.deleteOne({ _id: id });

    return res.json({ message: "File deleted successfully" });
  } catch (err) {
    console.error("Error deleting file:", err);
    return res.status(500).json({ message: "Failed to delete file" });
  }
});

// Download a file
router.get("/download/:id", requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const file = await FileSubmission.findOne({ _id: id, userId });

    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

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

// Get file counts per folder
router.get("/stats/counts", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const { date } = req.query;

    const matchStage: any = { userId };

    if (date) {
      const range = getLocalDayRange(String(date));
      if (range) {
        matchStage.uploadDate = {
          $gte: range.start,
          $lt: range.end,
        };
      }
    }

    const counts = await FileSubmission.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$folder",
          count: { $sum: 1 },
        },
      },
    ]);

    const folderCounts: Record<string, number> = {};
    counts.forEach((item) => {
      const normalized = normalizeFolderForClient(item._id);
      folderCounts[normalized] = (folderCounts[normalized] || 0) + Number(item.count || 0);
    });

    return res.json({ folderCounts });
  } catch (err) {
    console.error("Error fetching file counts:", err);
    return res.status(500).json({ message: "Failed to fetch file counts" });
  }
});

export default router;

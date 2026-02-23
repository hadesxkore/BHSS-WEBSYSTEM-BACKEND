import { Router } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";

import { User } from "../models/User";
import { type AuthenticatedRequest, requireAdmin, requireAuth } from "../middleware/auth";

const router = Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, path.resolve(process.cwd(), "uploads"));
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "");
      const safeExt = ext && ext.length <= 10 ? ext : "";
      cb(null, `avatar-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
    },
  }),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image uploads are allowed"));
    }
    return cb(null, true);
  },
});

function canAccessUser(req: AuthenticatedRequest, targetUserId: string) {
  if (!req.user) return false;
  if (req.user.role === "admin") return true;
  return String(req.user.id) === String(targetUserId);
}

router.get("/", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const users = await User.find({}, { password: 0 }).sort({ createdAt: -1 });

    return res.json({
      users: users.map((u) => ({
        id: u._id,
        username: u.username,
        email: u.email,
        name: u.name,
        role: u.role,
        school: u.school,
        contactNumber: (u as any).contactNumber,
        schoolAddress: (u as any).schoolAddress,
        hlaManagerName: u.hlaManagerName,
        hlaRoleType: u.hlaRoleType,
        municipality: u.municipality,
        province: u.province,
        isActive: u.isActive,
        createdAt: u.createdAt,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    if (!canAccessUser(req, id)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const user = await User.findById(id, { password: 0 });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        school: user.school,
        contactNumber: (user as any).contactNumber,
        schoolAddress: (user as any).schoolAddress,
        hlaManagerName: (user as any).hlaManagerName,
        hlaRoleType: (user as any).hlaRoleType,
        avatarUrl: (user as any).avatarUrl,
        municipality: user.municipality,
        province: user.province,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.patch("/:id/active", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "isActive must be boolean" });
    }

    const updated = await User.findByIdAndUpdate(
      id,
      { isActive },
      { new: true, projection: { password: 0 } }
    );

    if (!updated) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      user: {
        id: updated._id,
        username: updated.username,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        school: updated.school,
        contactNumber: (updated as any).contactNumber,
        schoolAddress: (updated as any).schoolAddress,
        hlaManagerName: (updated as any).hlaManagerName,
        avatarUrl: (updated as any).avatarUrl,
        municipality: updated.municipality,
        province: updated.province,
        isActive: updated.isActive,
        createdAt: updated.createdAt,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.patch("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    if (!canAccessUser(req, id)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const isAdmin = req.user?.role === "admin";
    const {
      email,
      username,
      name,
      role,
      school,
      contactNumber,
      schoolAddress,
      hlaManagerName,
      hlaRoleType,
      avatarUrl,
      municipality,
      province,
      isActive,
    } = req.body;

    const update: Record<string, any> = {};

    if (typeof email === "string") {
      update.email = String(email).trim().toLowerCase();
    }
    if (typeof username === "string") {
      update.username = String(username).trim().toLowerCase();
    }
    if (typeof name === "string") {
      update.name = String(name).trim();
    }
    if (typeof contactNumber === "string") {
      update.contactNumber = String(contactNumber).trim();
    }
    if (typeof schoolAddress === "string") {
      update.schoolAddress = String(schoolAddress).trim();
    }
    if (typeof hlaManagerName === "string") {
      update.hlaManagerName = String(hlaManagerName).trim();
    }
    if (typeof hlaRoleType === "string") {
      update.hlaRoleType = String(hlaRoleType).trim();
    }

    if (typeof avatarUrl === "string") {
      update.avatarUrl = String(avatarUrl).trim();
    }

    if (isAdmin) {
      if (typeof role === "string") {
        update.role = String(role).trim();
      }
      if (typeof school === "string") {
        update.school = String(school).trim();
      }
      if (typeof municipality === "string") {
        update.municipality = String(municipality).trim();
      }
      if (typeof province === "string") {
        update.province = String(province).trim();
      }
      if (typeof isActive === "boolean") {
        update.isActive = isActive;
      }
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    if (update.email || update.username) {
      const or: any[] = [];
      if (update.email) or.push({ email: update.email });
      if (update.username) or.push({ username: update.username });

      const existing = await User.findOne({ $or: or });
      if (existing && String(existing._id) !== String(id)) {
        return res
          .status(409)
          .json({ message: "Username or email already exists" });
      }
    }

    const updated = await User.findByIdAndUpdate(id, update, {
      new: true,
      projection: { password: 0 },
    });

    if (!updated) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      user: {
        id: updated._id,
        username: updated.username,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        school: updated.school,
        contactNumber: (updated as any).contactNumber,
        schoolAddress: (updated as any).schoolAddress,
        hlaManagerName: (updated as any).hlaManagerName,
        municipality: updated.municipality,
        province: updated.province,
        isActive: updated.isActive,
        createdAt: updated.createdAt,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.patch("/:id/password", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const isAdmin = req.user?.role === "admin";
    const isSelf = String(req.user?.id || "") === String(id);

    const { password, currentPassword, newPassword } = req.body;

    if (isAdmin && typeof password === "string") {
      if (!password || String(password).length < 6) {
        return res
          .status(400)
          .json({ message: "password must be at least 6 characters" });
      }

      const hashed = await bcrypt.hash(String(password), 10);
      const updated = await User.findByIdAndUpdate(
        id,
        { password: hashed },
        { new: true, projection: { password: 0 } }
      );

      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }

      return res.json({
        user: {
          id: updated._id,
          username: updated.username,
          email: updated.email,
          name: updated.name,
          role: updated.role,
          school: updated.school,
          contactNumber: (updated as any).contactNumber,
          schoolAddress: (updated as any).schoolAddress,
          hlaManagerName: (updated as any).hlaManagerName,
          avatarUrl: (updated as any).avatarUrl,
          municipality: updated.municipality,
          province: updated.province,
          isActive: updated.isActive,
          createdAt: updated.createdAt,
        },
      });
    }

    if (!isSelf) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "currentPassword and newPassword are required" });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ message: "newPassword must be at least 6 characters" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const ok = await bcrypt.compare(String(currentPassword), String(user.password));
    if (!ok) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    const hashed = await bcrypt.hash(String(newPassword), 10);
    user.password = hashed;
    await user.save();

    const safe = await User.findById(id, { password: 0 });
    if (!safe) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      user: {
        id: safe._id,
        username: safe.username,
        email: safe.email,
        name: safe.name,
        role: safe.role,
        school: safe.school,
        contactNumber: (safe as any).contactNumber,
        schoolAddress: (safe as any).schoolAddress,
        hlaManagerName: (safe as any).hlaManagerName,
        avatarUrl: (safe as any).avatarUrl,
        municipality: safe.municipality,
        province: safe.province,
        isActive: safe.isActive,
        createdAt: safe.createdAt,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post(
  "/:id/avatar",
  requireAuth,
  upload.single("avatar"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;

      if (!canAccessUser(req, id)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const avatarUrl = `/uploads/${req.file.filename}`;

      const updated = await User.findByIdAndUpdate(
        id,
        { avatarUrl },
        { new: true, projection: { password: 0 } }
      );

      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }

      return res.json({
        user: {
          id: updated._id,
          username: updated.username,
          email: updated.email,
          name: updated.name,
          role: updated.role,
          school: updated.school,
          contactNumber: (updated as any).contactNumber,
          schoolAddress: (updated as any).schoolAddress,
          hlaManagerName: (updated as any).hlaManagerName,
          avatarUrl: (updated as any).avatarUrl,
          municipality: updated.municipality,
          province: updated.province,
          isActive: updated.isActive,
          createdAt: updated.createdAt,
        },
      });
    } catch (err: any) {
      console.error(err);
      const msg = err?.message || "Internal server error";
      if (msg === "Only image uploads are allowed") {
        return res.status(400).json({ message: msg });
      }
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await User.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      email,
      username,
      password,
      school,
      contactNumber,
      schoolAddress,
      hlaManagerName,
      hlaRoleType,
      municipality,
      province,
      role,
      name,
    } = req.body;

    if (!username || !password || !school || !municipality) {
      return res.status(400).json({
        message:
          "username, password, school, and municipality are required",
      });
    }

    const normalizedUsername = String(username).trim().toLowerCase();
    const normalizedEmail =
      typeof email === "string" && String(email).trim()
        ? String(email).trim().toLowerCase()
        : undefined;

    const or: any[] = [{ username: normalizedUsername }];
    if (normalizedEmail) or.push({ email: normalizedEmail });
    const existing = await User.findOne({ $or: or });
    if (existing) {
      return res.status(409).json({ message: "Username or email already exists" });
    }

    const hashed = await bcrypt.hash(String(password), 10);

    const payload: any = {
      username: normalizedUsername,
      password: hashed,
      name: name ? String(name) : normalizedUsername,
      role: role ? String(role) : "user",
      school: String(school).trim(),
      contactNumber: contactNumber ? String(contactNumber).trim() : "",
      schoolAddress: schoolAddress ? String(schoolAddress).trim() : "",
      hlaManagerName: hlaManagerName ? String(hlaManagerName).trim() : "",
      hlaRoleType: hlaRoleType ? String(hlaRoleType).trim() : "",
      municipality: String(municipality).trim(),
      province: province ? String(province).trim() : "Bataan",
      isActive: true,
    };
    if (normalizedEmail) payload.email = normalizedEmail;

    const created = await User.create(payload);
    const createdDoc = Array.isArray(created) ? created[0] : created;

    return res.status(201).json({
      user: {
        id: (createdDoc as any)._id,
        username: (createdDoc as any).username,
        email: (createdDoc as any).email,
        name: (createdDoc as any).name,
        role: (createdDoc as any).role,
        school: (createdDoc as any).school,
        contactNumber: (createdDoc as any).contactNumber,
        schoolAddress: (createdDoc as any).schoolAddress,
        hlaManagerName: (createdDoc as any).hlaManagerName,
        hlaRoleType: (createdDoc as any).hlaRoleType,
        municipality: (createdDoc as any).municipality,
        province: (createdDoc as any).province,
        isActive: (createdDoc as any).isActive,
        createdAt: (createdDoc as any).createdAt,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;

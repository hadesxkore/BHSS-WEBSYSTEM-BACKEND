import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { User } from "../models/User";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = "7d";

const AUTH_DEBUG = String(process.env.AUTH_DEBUG || "").toLowerCase() === "true";

function authDebugLog(...args: any[]) {
  if (!AUTH_DEBUG) return;
  console.log("[auth:login]", ...args);
}

router.post("/register", async (req, res) => {
  try {
    const { username, email, password, name, role } = req.body;

    if (!username || !email || !password || !name) {
      return res.status(400).json({
        message: "username, email, password and name are required",
      });
    }

    const normalizedUsername = String(username).trim().toLowerCase();
    const normalizedEmail = String(email).trim().toLowerCase();

    const existing = await User.findOne({
      $or: [{ username: normalizedUsername }, { email: normalizedEmail }],
    });
    if (existing) {
      return res.status(409).json({ message: "Username or email already registered" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      username: normalizedUsername,
      email: normalizedEmail,
      password: hashed,
      name,
      role: role || "student",
    });

    return res.status(201).json({
      id: user._id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    authDebugLog("request", {
      hasUsername: Boolean(username),
      hasPassword: Boolean(password),
      usernameType: typeof username,
    });

    if (!username || !password) {
      return res.status(400).json({ message: "username and password are required" });
    }

    const normalizedUsername = String(username).trim().toLowerCase();

    authDebugLog("normalizedUsername", normalizedUsername);

    const user = await User.findOne({ username: normalizedUsername });
    if (!user) {
      authDebugLog("userNotFound");
      return res.status(401).json({ message: "Invalid credentials" });
    }

    authDebugLog("userFound", {
      id: String(user._id),
      username: user.username,
      role: user.role,
      isActive: (user as any).isActive,
      passwordLooksBcrypt:
        String(user.password || "").startsWith("$2a$") ||
        String(user.password || "").startsWith("$2b$") ||
        String(user.password || "").startsWith("$2y$"),
      passwordLength: String(user.password || "").length,
    });

    let isMatch = false;
    try {
      isMatch = await bcrypt.compare(String(password), String(user.password));
    } catch {
      isMatch = false;
    }

    authDebugLog("bcryptCompare", { isMatch });

    if (!isMatch) {
      const stored = String(user.password || "");
      const incoming = String(password || "");

      const looksBcrypt = stored.startsWith("$2a$") || stored.startsWith("$2b$") || stored.startsWith("$2y$");
      const looksPlaintext = !looksBcrypt && stored.length > 0;

      authDebugLog("fallbackPlaintextCheck", {
        looksBcrypt,
        looksPlaintext,
        storedLength: stored.length,
      });

      if (looksPlaintext && stored === incoming) {
        const hashed = await bcrypt.hash(incoming, 10);
        await User.updateOne({ _id: user._id }, { $set: { password: hashed } });
        isMatch = true;
      }
    }

    if (!isMatch) {
      authDebugLog("invalidCredentials");
      return res.status(401).json({ message: "Invalid credentials" });
    }

    authDebugLog("loginSuccess", { id: String(user._id), username: user.username, role: user.role });

    const token = jwt.sign({ sub: user._id, role: user.role }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    return res.json({
      token,
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
        municipality: user.municipality,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;

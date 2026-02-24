import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import http from "http";
import { Server as SocketIOServer, type Socket } from "socket.io";

import { connectDB } from "./config/db";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import schoolDirectoryRoutes from "./routes/school-directory";
import deliveryRoutes from "./routes/delivery";
import adminDeliveryRoutes from "./routes/admin-delivery";
import attendanceRoutes from "./routes/attendance";
import adminAttendanceRoutes from "./routes/admin-attendance";
import pushRoutes from "./routes/push";
import adminEventsRoutes from "./routes/admin-events";
import eventsRoutes from "./routes/events";
import announcementsRoutes from "./routes/announcements";
import adminAnnouncementsRoutes from "./routes/admin-announcements";
import adminDistributionRoutes from "./routes/admin-distribution";
import fileSubmissionsRoutes from "./routes/file-submissions";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: true,
    credentials: true,
  },
});

app.set("io", io);

io.on("connection", (socket: Socket) => {
  console.log("Socket connected", socket.id);
  socket.on("disconnect", () => {
    console.log("Socket disconnected", socket.id);
  });
});

app.use(cors());
app.use(express.json());

const UPLOAD_DIR = (process.env.UPLOAD_DIR || path.resolve(process.cwd(), "uploads")).trim();

try {
  if (UPLOAD_DIR && !fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
} catch (e) {
  console.error("Failed to ensure upload directory exists", e);
}

app.use(
  "/uploads",
  express.static(UPLOAD_DIR || path.resolve(process.cwd(), "uploads"), {
    etag: true,
    lastModified: true,
    maxAge: "7d",
    setHeaders: (res) => {
      try {
        res.setHeader("Cache-Control", "public, max-age=604800, immutable");
      } catch {
        // ignore
      }
    },
  })
);

app.get("/", (_req, res) => {
  res.json({ message: "BHSS Websystem Backend API" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/school-directory", schoolDirectoryRoutes);
app.use("/api/delivery", deliveryRoutes);
app.use("/api/admin/delivery", adminDeliveryRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/admin/attendance", adminAttendanceRoutes);
app.use("/api/admin/events", adminEventsRoutes);
app.use("/api/events", eventsRoutes);
app.use("/api/admin/announcements", adminAnnouncementsRoutes);
app.use("/api/announcements", announcementsRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/admin/distribution", adminDistributionRoutes);
app.use("/api/file-submissions", fileSubmissionsRoutes);

connectDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to database", err);
    process.exit(1);
  });

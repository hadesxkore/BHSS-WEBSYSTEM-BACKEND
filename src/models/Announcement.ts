import mongoose, { Document, Schema } from "mongoose";

export type AnnouncementAttachment = {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
};

export type AnnouncementPriority = "Normal" | "Important" | "Urgent";

export type AnnouncementAudience = "All" | "Users";

export interface IAnnouncement extends Document {
  title: string;
  message: string;
  priority: AnnouncementPriority;
  audience: AnnouncementAudience;
  attachments?: AnnouncementAttachment[];
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const attachmentSchema = new Schema<AnnouncementAttachment>(
  {
    filename: { type: String, required: true, trim: true },
    originalName: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    size: { type: Number, required: true, min: 0 },
    url: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const announcementSchema = new Schema<IAnnouncement>(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    priority: {
      type: String,
      required: true,
      enum: ["Normal", "Important", "Urgent"],
      default: "Normal",
      index: true,
    },
    audience: {
      type: String,
      required: true,
      enum: ["All", "Users"],
      default: "All",
      index: true,
    },
    attachments: { type: [attachmentSchema], required: false, default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: true }
);

announcementSchema.index({ createdAt: -1 });

export const Announcement = mongoose.model<IAnnouncement>("Announcement", announcementSchema);

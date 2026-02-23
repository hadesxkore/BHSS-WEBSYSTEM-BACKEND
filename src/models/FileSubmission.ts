import mongoose, { Document, Schema } from "mongoose";

export type FolderType =
  | "Fruits"
  | "Vegetables"
  | "Meat"
  | "NutriBun"
  | "Patties"
  | "Groceries"
  | "Consumables"
  | "Water"
  | "LPG"
  | "Rice"
  | "Others";

export interface IFileSubmission extends Document {
  userId: mongoose.Types.ObjectId;
  folder: FolderType;
  fileName: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  filePath: string;
  description?: string;
  uploadDate: Date;
  status: "pending" | "uploaded" | "rejected";
  createdAt?: Date;
  updatedAt?: Date;
}

const fileSubmissionSchema = new Schema<IFileSubmission>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    folder: {
      type: String,
      required: true,
      enum: [
        "Fruits",
        "Vegetables",
        "Meat",
        "NutriBun",
        "Patties",
        "Groceries",
        "Consumables",
        "Water",
        "LPG",
        "Rice",
        "Others",
      ],
    },
    fileName: { type: String, required: true },
    originalName: { type: String, required: true },
    fileSize: { type: Number, required: true },
    mimeType: { type: String, required: true },
    filePath: { type: String, required: true },
    description: { type: String, default: "" },
    uploadDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ["pending", "uploaded", "rejected"],
      default: "uploaded",
    },
  },
  { timestamps: true }
);

// Index for faster queries
fileSubmissionSchema.index({ userId: 1, folder: 1 });
fileSubmissionSchema.index({ uploadDate: 1 });

export const FileSubmission = mongoose.model<IFileSubmission>(
  "FileSubmission",
  fileSubmissionSchema
);

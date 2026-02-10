import mongoose, { Document, Schema } from "mongoose";

export interface IAttendanceRecord extends Document {
  userId: mongoose.Types.ObjectId;
  dateKey: string;
  grade: string;
  present: number;
  absent: number;
  notes: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const attendanceRecordSchema = new Schema<IAttendanceRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    dateKey: { type: String, required: true, trim: true, index: true },
    grade: { type: String, required: true, default: "", trim: true },
    present: { type: Number, required: true, default: 0, min: 0 },
    absent: { type: Number, required: true, default: 0, min: 0 },
    notes: { type: String, required: true, default: "" },
  },
  { timestamps: true }
);

attendanceRecordSchema.index({ userId: 1, dateKey: 1 }, { unique: true });

export const AttendanceRecord = mongoose.model<IAttendanceRecord>(
  "AttendanceRecord",
  attendanceRecordSchema
);

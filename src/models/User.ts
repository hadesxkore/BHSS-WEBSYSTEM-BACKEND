import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  username: string;
  email?: string;
  password: string;
  name: string;
  role: string;
  school?: string;
  contactNumber?: string;
  schoolAddress?: string;
  hlaManagerName?: string;
  avatarUrl?: string;
  municipality?: string;
  province?: string;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const userSchema = new Schema<IUser>(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    email: { type: String, required: false, lowercase: true, trim: true, default: undefined },
    password: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, required: true, default: "student" },
    school: { type: String, required: false, default: "" },
    contactNumber: { type: String, required: false, default: "" },
    schoolAddress: { type: String, required: false, default: "" },
    hlaManagerName: { type: String, required: false, default: "" },
    avatarUrl: { type: String, required: false, default: "" },
    municipality: { type: String, required: false, default: "" },
    province: { type: String, required: false, default: "Bataan" },
    isActive: { type: Boolean, required: false, default: true },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true, sparse: true });

export const User = mongoose.model<IUser>("User", userSchema);

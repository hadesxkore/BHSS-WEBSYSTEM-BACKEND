import mongoose, { Document, Schema } from "mongoose";

export interface ISchoolBeneficiary extends Document {
  municipality: string;
  schoolYear: string;
  bhssKitchenName: string;
  schoolName: string;
  grade2: number;
  grade3: number;
  grade4: number;
  total: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const schoolBeneficiarySchema = new Schema<ISchoolBeneficiary>(
  {
    municipality: { type: String, required: true, trim: true },
    schoolYear: { type: String, required: true, trim: true },
    bhssKitchenName: { type: String, required: true, trim: true },
    schoolName: { type: String, required: true, trim: true },
    grade2: { type: Number, required: true, default: 0 },
    grade3: { type: Number, required: true, default: 0 },
    grade4: { type: Number, required: true, default: 0 },
    total: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

schoolBeneficiarySchema.pre("validate", function () {
  const doc = this as ISchoolBeneficiary;
  const g2 = Number.isFinite(doc.grade2) ? doc.grade2 : 0;
  const g3 = Number.isFinite(doc.grade3) ? doc.grade3 : 0;
  const g4 = Number.isFinite(doc.grade4) ? doc.grade4 : 0;
  doc.total = g2 + g3 + g4;
});

schoolBeneficiarySchema.index({ municipality: 1, schoolYear: 1 });

export const SchoolBeneficiary = mongoose.model<ISchoolBeneficiary>(
  "SchoolBeneficiary",
  schoolBeneficiarySchema
);

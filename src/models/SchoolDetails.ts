import mongoose, { Document, Schema } from "mongoose";

export interface ISchoolDetails extends Document {
  municipality: string;
  schoolYear: string;
  completeName: string;
  principalName: string;
  principalContact: string;
  hlaCoordinatorName: string;
  hlaCoordinatorContact: string;
  hlaCoordinatorFacebook: string;
  hlaManagerName: string;
  hlaManagerContact: string;
  hlaManagerFacebook: string;
  chiefCookName: string;
  chiefCookContact: string;
  chiefCookFacebook: string;
  assistantCookName: string;
  assistantCookContact: string;
  assistantCookFacebook: string;
  nurseName: string;
  nurseContact: string;
  nurseFacebook: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const schoolDetailsSchema = new Schema<ISchoolDetails>(
  {
    municipality: { type: String, required: true, trim: true },
    schoolYear: { type: String, required: true, trim: true },

    completeName: { type: String, required: true, trim: true },

    principalName: { type: String, required: false, default: "", trim: true },
    principalContact: { type: String, required: false, default: "", trim: true },

    hlaCoordinatorName: { type: String, required: false, default: "", trim: true },
    hlaCoordinatorContact: { type: String, required: false, default: "", trim: true },
    hlaCoordinatorFacebook: { type: String, required: false, default: "", trim: true },

    hlaManagerName: { type: String, required: false, default: "", trim: true },
    hlaManagerContact: { type: String, required: false, default: "", trim: true },
    hlaManagerFacebook: { type: String, required: false, default: "", trim: true },

    chiefCookName: { type: String, required: false, default: "", trim: true },
    chiefCookContact: { type: String, required: false, default: "", trim: true },
    chiefCookFacebook: { type: String, required: false, default: "", trim: true },

    assistantCookName: { type: String, required: false, default: "", trim: true },
    assistantCookContact: { type: String, required: false, default: "", trim: true },
    assistantCookFacebook: { type: String, required: false, default: "", trim: true },

    nurseName: { type: String, required: false, default: "", trim: true },
    nurseContact: { type: String, required: false, default: "", trim: true },
    nurseFacebook: { type: String, required: false, default: "", trim: true },
  },
  { timestamps: true }
);

schoolDetailsSchema.index({ municipality: 1, schoolYear: 1 });

export const SchoolDetails = mongoose.model<ISchoolDetails>(
  "SchoolDetails",
  schoolDetailsSchema
);

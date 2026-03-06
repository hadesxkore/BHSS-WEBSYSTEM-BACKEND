import mongoose, { Schema, Document } from "mongoose";

export interface IActivityAnswer {
    fieldId: string;
    value: string;
}

export interface IActivityResponse extends Document {
    activityId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    answers: IActivityAnswer[];
    submittedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const ActivityAnswerSchema = new Schema<IActivityAnswer>(
    {
        fieldId: { type: String, required: true },
        value: { type: String, default: "" },
    },
    { _id: false }
);

const ActivityResponseSchema = new Schema<IActivityResponse>(
    {
        activityId: { type: Schema.Types.ObjectId, ref: "Activity", required: true },
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        answers: { type: [ActivityAnswerSchema], default: [] },
        submittedAt: { type: Date, default: () => new Date() },
    },
    { timestamps: true }
);

// One response per user per activity (upsert on re-submit)
ActivityResponseSchema.index({ activityId: 1, userId: 1 }, { unique: true });

export const ActivityResponse = mongoose.model<IActivityResponse>(
    "ActivityResponse",
    ActivityResponseSchema
);

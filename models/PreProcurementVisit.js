const mongoose = require("mongoose");

const visitSchema = new mongoose.Schema({
  farmer: { type: mongoose.Schema.Types.ObjectId, ref: "Farmer", required: true },
  cropRecord: { type: mongoose.Schema.Types.ObjectId, ref: "CropRecord", required: true },
  location: { type: String, required: true },
  status: {
    type: String,
    enum: ["REQUESTED", "ACCEPTED", "IN_PROGRESS", "COMPLETED"],
    default: "REQUESTED"
  },
  requestedAt: { type: Date, default: Date.now },
  scheduledAt: Date,
  inspector: String,
  assessment: String,
  notes: String,
  recommendation: String,
  completedAt: Date
}, { timestamps: true });

module.exports = mongoose.model("PreProcurementVisit", visitSchema);

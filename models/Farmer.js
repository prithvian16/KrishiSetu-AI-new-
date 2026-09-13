const mongoose = require("mongoose");

const bankSchema = new mongoose.Schema({
  accountHolderName: { type: String, required: true },
  accountNumber: { type: String, required: true },
  ifsc: { type: String, required: true },
  bankName: { type: String, required: true },
  governmentSyncStatus: {
    type: String,
    enum: ["PENDING", "SYNCED", "FAILED"],
    default: "PENDING"
  },
  governmentReferenceId: { type: String, default: null },
  syncedAt: { type: Date, default: null }
}, { _id: false });

const farmerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  mobile: { type: String, required: true, unique: true },
  farmerId: { type: String, required: true, unique: true },
  village: String,
  district: String,
  state: String,
  landArea: Number,
  preferredLanguage: { type: String, default: "Hindi" },
  bank: { type: bankSchema, required: true }
}, { timestamps: true });

module.exports = mongoose.model("Farmer", farmerSchema);

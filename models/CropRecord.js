const mongoose = require("mongoose");

const cropRecordSchema = new mongoose.Schema({
  farmer: { type: mongoose.Schema.Types.ObjectId, ref: "Farmer", required: true },
  cropType: { type: String, required: true },
  estimatedQuantity: { type: Number, required: true },
  location: String,
  cropPhotoUrl: String,

  aiScreening: {
    grade: { type: String, enum: ["A", "B", "C", "PENDING"], default: "PENDING" },
    visibleDamage: { type: String, default: "Not assessed" },
    score: { type: Number, default: 0 },
    disclaimer: { type: String, default: "Preliminary screening only; not an official quality decision." }
  },

  verification: {
    status: { type: String, enum: ["PENDING", "VERIFIED", "REJECTED"], default: "PENDING" },
    grade: String,
    quantity: Number,
    condition: String,
    inspector: String,
    inspectionDate: Date,
    notes: String
  },

  priceInfo: {
    authorisedPrice: Number,
    farmerPreferredPrice: Number,
    matchStatus: { type: String, default: "NOT_SET" }
  }
}, { timestamps: true });

module.exports = mongoose.model("CropRecord", cropRecordSchema);

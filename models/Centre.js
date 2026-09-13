const mongoose = require("mongoose");

const centreSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  district: String,
  cropsAccepted: [String],
  minimumGrade: { type: String, default: "C" },
  distanceKm: Number,
  hourlyCapacity: { type: Number, required: true },
  currentLoad: { type: Number, default: 0 },
  bookedQuantity: { type: Number, default: 0 },
  currentServingToken: { type: Number, default: 0 },
  queueCount: { type: Number, default: 0 },
  averageServiceMinutes: { type: Number, default: 12 },
  openTime: { type: String, default: "08:00" },
  closeTime: { type: String, default: "18:00" }
});

module.exports = mongoose.model("Centre", centreSchema);

const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
  tokenNumber: { type: Number, required: true },
  tokenCode: { type: String, required: true, unique: true },
  farmer: { type: mongoose.Schema.Types.ObjectId, ref: "Farmer", required: true },
  cropRecord: { type: mongoose.Schema.Types.ObjectId, ref: "CropRecord", required: true },
  centre: { type: mongoose.Schema.Types.ObjectId, ref: "Centre", required: true },

  slotDate: { type: String, required: true },
  slotStart: String,
  slotEnd: String,
  quantity: Number,

  status: {
    type: String,
    enum: ["BOOKED", "ARRIVED", "CALLED", "GRADING", "ACCEPTED", "REJECTED", "CANCELLED", "NO_SHOW", "PAID"],
    default: "BOOKED"
  },

  queuePosition: Number,
  etaMin: Number,
  etaMax: Number,

  createdAt: { type: Date, default: Date.now },
  arrivedAt: Date,
  completedAt: Date,

  notifications: {
    type: [{
      type: { type: String },
      message: { type: String },
      sentAt: { type: Date, default: Date.now }
    }],
    default: []
  },

  payment: {
    status: { type: String, enum: ["NOT_STARTED", "PROCESSING", "PAID"], default: "NOT_STARTED" },
    amount: Number,
    reference: String,
    updatedAt: Date
  }
});

const Booking = mongoose.model("Booking", bookingSchema);
module.exports = Booking;

const express = require("express");
const Centre = require("../models/Centre");
const Booking = require("../models/Booking");

const router = express.Router();
const ACTIVE_STATUSES = ["BOOKED", "ARRIVED", "CALLED", "GRADING"];

router.get("/overview", async (req, res) => {
  try {
    const [centres, bookings, active, completed, rejected, processingPayments] = await Promise.all([
      Centre.find().lean(),
      Booking.countDocuments(),
      Booking.countDocuments({ status: { $in: ACTIVE_STATUSES } }),
      Booking.countDocuments({ status: { $in: ["ACCEPTED", "PAID"] } }),
      Booking.countDocuments({ status: "REJECTED" }),
      Booking.countDocuments({ "payment.status": "PROCESSING" })
    ]);

    const activeBookings = await Booking.find({ status: { $in: ACTIVE_STATUSES } }).lean();
    const acceptedBookings = await Booking.find({ status: { $in: ["ACCEPTED", "PAID"] } }).lean();
    const totalQuantity = acceptedBookings.reduce((sum, b) => sum + Number(b.quantity || 0), 0);
    const activeQuantity = activeBookings.reduce((sum, b) => sum + Number(b.quantity || 0), 0);
    const avgWait = activeBookings.length
      ? Math.round(activeBookings.reduce((sum, b) => sum + Number(b.etaMin || 0), 0) / activeBookings.length)
      : 0;

    res.json({ centres, bookings, active, completed, rejected, processingPayments, totalProcurementQuantity: totalQuantity, activeQuantity, averageEstimatedWait: avgWait });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get("/queue/:centreId", async (req, res) => {
  try {
    const bookings = await Booking.find({ centre: req.params.centreId, status: { $in: ACTIVE_STATUSES } })
      .sort({ tokenNumber: 1 })
      .populate("farmer", "name farmerId mobile")
      .populate("cropRecord", "cropType estimatedQuantity aiScreening");
    res.json(bookings);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get("/centre/:centreId/status", async (req, res) => {
  try {
    const centre = await Centre.findById(req.params.centreId).lean();
    if (!centre) return res.status(404).json({ message: "Centre not found." });
    const queue = await Booking.find({ centre: centre._id, status: { $in: ACTIVE_STATUSES } })
      .sort({ tokenNumber: 1 })
      .populate("farmer", "name farmerId mobile")
      .populate("cropRecord", "cropType estimatedQuantity aiScreening")
      .lean();
    res.json({ centre, queue });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post("/call-next/:centreId", async (req, res) => {
  try {
    const next = await Booking.findOne({ centre: req.params.centreId, status: { $in: ["ARRIVED", "BOOKED"] } })
      .sort({ tokenNumber: 1 })
      .populate("farmer", "name farmerId mobile")
      .populate("cropRecord", "cropType estimatedQuantity aiScreening")
      .populate("centre", "name code");

    if (!next) return res.status(404).json({ message: "No farmer waiting." });

    next.status = "CALLED";
    next.notifications.push({ type: "QUEUE", message: `Token ${next.tokenCode}: please proceed to the verification bay.` });
    await next.save();

    await Centre.findByIdAndUpdate(req.params.centreId, { currentServingToken: next.tokenNumber });
    res.json(next);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post("/centre/:id/capacity", async (req, res) => {
  try {
    const capacity = Number(req.body.hourlyCapacity);
    if (!Number.isFinite(capacity) || capacity <= 0) return res.status(400).json({ message: "Hourly capacity must be greater than 0." });
    const centre = await Centre.findByIdAndUpdate(req.params.id, { hourlyCapacity: capacity }, { new: true, runValidators: true });
    if (!centre) return res.status(404).json({ message: "Centre not found." });
    res.json(centre);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;

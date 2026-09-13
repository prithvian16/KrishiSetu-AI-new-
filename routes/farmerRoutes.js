const express = require("express");
const crypto = require("crypto");
const Farmer = require("../models/Farmer");
const CropRecord = require("../models/CropRecord");

const router = express.Router();

function maskAccount(accountNumber) {
  const s = String(accountNumber || "");
  if (s.length <= 4) return "****";
  return "*".repeat(Math.max(0, s.length - 4)) + s.slice(-4);
}

// Demo-only government sync. In production this would call an authorised government API.
function syncBankToGovernment(farmer) {
  farmer.bank.governmentSyncStatus = "SYNCED";
  farmer.bank.governmentReferenceId = "GOV-" + crypto.randomBytes(5).toString("hex").toUpperCase();
  farmer.bank.syncedAt = new Date();
}

router.post("/signup", async (req, res) => {
  try {
    const { name, mobile, village, district, state, landArea, preferredLanguage, bank } = req.body;

    if (!name || !mobile || !bank?.accountHolderName || !bank?.accountNumber || !bank?.ifsc || !bank?.bankName) {
      return res.status(400).json({ message: "All farmer and bank fields are required." });
    }

    const exists = await Farmer.findOne({ mobile });
    if (exists) return res.status(409).json({ message: "A farmer with this mobile number already exists." });

    const farmerId = "KSF-" + Date.now().toString().slice(-8);
    const farmer = new Farmer({
      name, mobile, village, district, state, landArea, preferredLanguage,
      farmerId, bank
    });

    // Prototype behavior: simulate successful transfer to the government system.
    syncBankToGovernment(farmer);
    await farmer.save();

    res.status(201).json({
      message: "Farmer registered. Bank details marked as synced to the government system (prototype simulation).",
      farmer: {
        id: farmer._id,
        farmerId: farmer.farmerId,
        name: farmer.name,
        mobile: farmer.mobile
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/:farmerId", async (req, res) => {
  try {
    const farmer = await Farmer.findOne({ farmerId: req.params.farmerId }).lean();
    if (!farmer) return res.status(404).json({ message: "Farmer not found." });

    const cropRecords = await CropRecord.find({ farmer: farmer._id }).sort({ createdAt: -1 }).lean();

    farmer.bank.maskedAccountNumber = maskAccount(farmer.bank.accountNumber);
    delete farmer.bank.accountNumber;

    res.json({ farmer, cropRecords });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/:farmerId/active-booking", async (req,res)=>{
  try {
    const farmer = await Farmer.findOne({ farmerId:req.params.farmerId });
    if(!farmer) return res.status(404).json({message:"Farmer not found."});
    const Booking = require("../models/Booking");
    const booking = await Booking.findOne({farmer:farmer._id,status:{ $in:["BOOKED","ARRIVED","CALLED","GRADING"]}})
      .populate("centre").populate("cropRecord");
    res.json(booking || null);
  } catch(err){res.status(500).json({message:err.message});}
});


router.get("/:farmerId/visit-request", async (req, res) => {
  try {
    const farmer = await Farmer.findOne({ farmerId: req.params.farmerId });
    if (!farmer) return res.status(404).json({ message: "Farmer not found." });
    const PreProcurementVisit = require("../models/PreProcurementVisit");
    const filter = { farmer: farmer._id };
    if (req.query.cropRecordId) filter.cropRecord = req.query.cropRecordId;
    const visit = await PreProcurementVisit.findOne(filter)
      .sort({ createdAt: -1 }).populate("cropRecord", "cropType estimatedQuantity location aiScreening");
    res.json(visit || null);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get("/:farmerId/payments", async (req, res) => {
  try {
    const farmer = await Farmer.findOne({ farmerId: req.params.farmerId });
    if (!farmer) return res.status(404).json({ message: "Farmer not found." });
    const Booking = require("../models/Booking");
    const bookings = await Booking.find({
      farmer: farmer._id,
      "payment.status": { $in: ["PROCESSING", "PAID"] }
    })
      .sort({ completedAt: -1, createdAt: -1 })
      .populate("centre", "name code district")
      .populate("cropRecord", "cropType estimatedQuantity")
      .lean();
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const farmer = await Farmer.findOne({ mobile: req.body.mobile }).lean();
    if (!farmer) return res.status(404).json({ message: "Farmer not found. Please sign up first." });
    res.json({ farmerId: farmer.farmerId, name: farmer.name });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

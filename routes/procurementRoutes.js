const express = require("express");
const CropRecord = require("../models/CropRecord");
const Farmer = require("../models/Farmer");
const Centre = require("../models/Centre");
const Booking = require("../models/Booking");
const PreProcurementVisit = require("../models/PreProcurementVisit");

const router = express.Router();

const ACTIVE_STATUSES = ["BOOKED", "ARRIVED", "CALLED", "GRADING"];
const gradeRank = { A: 3, B: 2, C: 1 };

function normaliseCrop(value) {
  return String(value || "").trim().toLowerCase();
}

function calculateScreening({ cropType, visibleDamage, moisture, impurity }) {
  let score = 100;
  if (visibleDamage === "medium") score -= 15;
  if (visibleDamage === "high") score -= 35;
  if (Number(moisture) > 17) score -= 25;
  else if (Number(moisture) > 14) score -= 10;
  if (Number(impurity) > 3) score -= 20;
  else if (Number(impurity) > 1) score -= 8;

  const grade = score >= 80 ? "A" : score >= 60 ? "B" : "C";
  return {
    grade,
    score,
    visibleDamage: visibleDamage || "low",
    cropType,
    disclaimer: "Preliminary screening only; official acceptance depends on physical verification."
  };
}

async function syncCentreState(centreId, slotDate) {
  const filter = { centre: centreId, status: { $in: ACTIVE_STATUSES } };
  if (slotDate) filter.slotDate = slotDate;

  const queue = await Booking.find(filter).sort({ tokenNumber: 1, createdAt: 1 });
  const centre = await Centre.findById(centreId);
  if (!centre) return null;

  let bookedQuantity = 0;
  queue.forEach((booking, index) => {
    booking.queuePosition = index + 1;
    const base = (index + 1) * Number(centre.averageServiceMinutes || 12);
    booking.etaMin = Math.max(5, Math.round(base - 8));
    booking.etaMax = Math.max(booking.etaMin, Math.round(base + 12));
    bookedQuantity += Number(booking.quantity || 0);
  });
  if (queue.length) await Booking.bulkSave(queue);

  const serving = queue.find(b => ["CALLED", "GRADING"].includes(b.status));
  centre.queueCount = queue.length;
  centre.bookedQuantity = bookedQuantity;
  centre.currentServingToken = serving?.tokenNumber || 0;
  await centre.save();
  return centre;
}

router.post("/crops", async (req, res) => {
  try {
    const farmer = await Farmer.findOne({ farmerId: req.body.farmerId });
    if (!farmer) return res.status(404).json({ message: "Farmer not found." });

    const screening = req.body.runScreening === false || req.body.runScreening === "false"
      ? {
          grade: "PENDING",
          score: 0,
          visibleDamage: "Not assessed",
          cropType: req.body.cropType,
          disclaimer: "No pre-arrival quality check was requested. Official acceptance depends on physical verification."
        }
      : calculateScreening(req.body);

    const quantity = Number(req.body.estimatedQuantity);
    if (!req.body.cropType || !Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ message: "Crop type and a valid quantity are required." });
    }

    const crop = await CropRecord.create({
      farmer: farmer._id,
      cropType: req.body.cropType,
      estimatedQuantity: quantity,
      location: req.body.location,
      cropPhotoUrl: req.body.cropPhotoUrl,
      aiScreening: screening,
      priceInfo: {
        authorisedPrice: Number(req.body.authorisedPrice || 2300),
        farmerPreferredPrice: req.body.farmerPreferredPrice ? Number(req.body.farmerPreferredPrice) : null,
        matchStatus: req.body.farmerPreferredPrice
          ? Number(req.body.authorisedPrice || 2300) >= Number(req.body.farmerPreferredPrice) ? "MATCHED" : "BELOW_PREFERENCE"
          : "NOT_SET"
      }
    });

    res.status(201).json(crop);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.post("/visit-request", async (req, res) => {
  try {
    const farmer = await Farmer.findOne({ farmerId: req.body.farmerId });
    const crop = await CropRecord.findById(req.body.cropRecordId);
    if (!farmer || !crop) return res.status(404).json({ message: "Farmer or crop record not found." });
    if (String(crop.farmer) !== String(farmer._id)) return res.status(403).json({ message: "This crop does not belong to the selected farmer." });
    if (!crop.location) return res.status(400).json({ message: "A farm/village location is required for the expert visit." });

    const existing = await PreProcurementVisit.findOne({
      farmer: farmer._id,
      cropRecord: crop._id,
      status: { $in: ["REQUESTED", "ACCEPTED", "IN_PROGRESS"] }
    });
    if (existing) return res.json(existing);

    const visit = await PreProcurementVisit.create({
      farmer: farmer._id,
      cropRecord: crop._id,
      location: crop.location,
      status: "REQUESTED"
    });
    res.status(201).json(await visit.populate([
      { path: "farmer", select: "name farmerId mobile" },
      { path: "cropRecord", select: "cropType estimatedQuantity location aiScreening" }
    ]));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get("/visit-requests", async (req, res) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : { status: { $in: ["REQUESTED", "ACCEPTED", "IN_PROGRESS"] } };
    const visits = await PreProcurementVisit.find(filter)
      .sort({ requestedAt: 1 })
      .populate("farmer", "name farmerId mobile village district")
      .populate("cropRecord", "cropType estimatedQuantity location aiScreening");

    // A visit can outlive a crop record if that crop is deleted later.
    // Do not send orphaned visit records to the inspector UI.
    res.json(visits.filter(v => v.farmer && v.cropRecord));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post("/visit-requests/:id/accept", async (req, res) => {
  try {
    const visit = await PreProcurementVisit.findById(req.params.id);
    if (!visit) return res.status(404).json({ message: "Visit request not found." });
    if (visit.status !== "REQUESTED") return res.status(400).json({ message: "This visit request is no longer pending." });
    visit.status = "ACCEPTED";
    visit.inspector = req.body.inspector || "Authorised Field Expert";
    visit.scheduledAt = req.body.scheduledAt ? new Date(req.body.scheduledAt) : new Date(Date.now() + 2 * 60 * 60 * 1000);
    await visit.save();
    res.json(await visit.populate([
      { path: "farmer", select: "name farmerId mobile village district" },
      { path: "cropRecord", select: "cropType estimatedQuantity location aiScreening" }
    ]));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post("/visit-requests/:id/complete", async (req, res) => {
  try {
    const visit = await PreProcurementVisit.findById(req.params.id);
    if (!visit) return res.status(404).json({ message: "Visit request not found." });
    if (!["ACCEPTED", "IN_PROGRESS"].includes(visit.status)) return res.status(400).json({ message: "Accept the visit before completing the assessment." });
    if (!req.body.assessment) return res.status(400).json({ message: "Assessment is required." });
    visit.status = "COMPLETED";
    visit.assessment = req.body.assessment;
    visit.notes = req.body.notes || "";
    visit.recommendation = req.body.recommendation || "Proceed to the procurement centre for official physical verification.";
    visit.inspector = req.body.inspector || visit.inspector || "Authorised Field Expert";
    visit.completedAt = new Date();
    await visit.save();
    res.json(await visit.populate([
      { path: "farmer", select: "name farmerId mobile village district" },
      { path: "cropRecord", select: "cropType estimatedQuantity location aiScreening" }
    ]));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get("/centres/recommend", async (req, res) => {
  try {
    const { cropType, grade, quantity } = req.query;
    const requestedCrop = normaliseCrop(cropType);
    const requestedQuantity = Number(quantity || 0);
    const centres = await Centre.find().lean();

    const results = centres
      .filter(c => c.cropsAccepted.some(crop => normaliseCrop(crop) === requestedCrop))
      .map(c => {
        const gradeOk = !grade || grade === "PENDING" || (gradeRank[grade] || 0) >= (gradeRank[c.minimumGrade] || 1);
        const available = Math.max(0, Number(c.hourlyCapacity || 0) - Number(c.bookedQuantity || 0));
        const queueDelay = Number(c.queueCount || 0) * Number(c.averageServiceMinutes || 12);
        const capacityPenalty = requestedQuantity > available ? 40 : 0;
        const gradePenalty = gradeOk ? 0 : 100;
        const score = gradePenalty + Number(c.distanceKm || 0) * 1.5 + queueDelay * 0.6 + capacityPenalty;

        return {
          ...c,
          gradeAccepted: gradeOk,
          availableCapacity: available,
          estimatedQueueDelayMinutes: Math.round(queueDelay),
          totalExpectedMinutes: Math.round(Number(c.distanceKm || 0) * 3 + queueDelay),
          recommendationScore: Math.round(score)
        };
      })
      .sort((a, b) => a.recommendationScore - b.recommendationScore);

    res.json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/book", async (req, res) => {
  try {
    const farmer = await Farmer.findOne({ farmerId: req.body.farmerId });
    const crop = await CropRecord.findById(req.body.cropRecordId);
    const centre = await Centre.findById(req.body.centreId);

    if (!farmer || !crop || !centre) return res.status(404).json({ message: "Farmer, crop or centre not found." });
    if (String(crop.farmer) !== String(farmer._id)) return res.status(403).json({ message: "This crop does not belong to the selected farmer." });
    if (!centre.cropsAccepted.some(c => normaliseCrop(c) === normaliseCrop(crop.cropType))) {
      return res.status(400).json({ message: `${centre.name} does not accept ${crop.cropType}.` });
    }

    const grade = crop.aiScreening?.grade;
    if (grade && grade !== "PENDING" && (gradeRank[grade] || 0) < (gradeRank[centre.minimumGrade] || 1)) {
      return res.status(400).json({ message: `${centre.name} requires minimum grade ${centre.minimumGrade}.` });
    }

    const slotDate = req.body.slotDate || new Date().toISOString().slice(0, 10);
    const existing = await Booking.findOne({ farmer: farmer._id, slotDate, status: { $in: ACTIVE_STATUSES } });
    if (existing) return res.status(409).json({ message: "Only one active booking per farmer per day is allowed." });

    const activeBookings = await Booking.find({ centre: centre._id, slotDate, status: { $in: ACTIVE_STATUSES } }).sort({ tokenNumber: 1 });
    const lastToken = await Booking.findOne({ centre: centre._id, slotDate }).sort({ tokenNumber: -1 }).lean();
    const tokenNumber = (lastToken?.tokenNumber || 0) + 1;
    const queuePosition = activeBookings.length + 1;
    const etaMin = Math.max(5, queuePosition * Number(centre.averageServiceMinutes || 12) - 8);
    const etaMax = queuePosition * Number(centre.averageServiceMinutes || 12) + 12;

    const booking = await Booking.create({
      tokenNumber,
      tokenCode: `${centre.code}-${String(tokenNumber).padStart(3, "0")}`,
      farmer: farmer._id,
      cropRecord: crop._id,
      centre: centre._id,
      slotDate,
      slotStart: req.body.slotStart || "10:00",
      slotEnd: req.body.slotEnd || "11:00",
      quantity: crop.estimatedQuantity,
      queuePosition,
      etaMin,
      etaMax,
      notifications: [{
        type: "BOOKING",
        message: `Token ${centre.code}-${String(tokenNumber).padStart(3, "0")} booked. Estimated wait ${etaMin}-${etaMax} minutes.`
      }]
    });

    await syncCentreState(centre._id, slotDate);
    const populated = await Booking.findById(booking._id).populate("centre").populate("farmer", "name farmerId mobile").populate("cropRecord");
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/booking/:tokenCode", async (req, res) => {
  try {
    const booking = await Booking.findOne({ tokenCode: req.params.tokenCode })
      .populate("farmer", "name farmerId mobile")
      .populate("cropRecord")
      .populate("centre");
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    res.json(booking);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/booking/:id/arrive", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    if (!ACTIVE_STATUSES.includes(booking.status)) return res.status(400).json({ message: "This booking is no longer active." });
    booking.status = "ARRIVED";
    booking.arrivedAt = new Date();
    booking.notifications.push({ type: "ARRIVAL", message: `Check-in recorded for ${booking.tokenCode}.` });
    await booking.save();
    await syncCentreState(booking.centre, booking.slotDate);
    res.json(await Booking.findById(booking._id).populate("centre").populate("farmer", "name farmerId mobile").populate("cropRecord"));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/booking/:id/cancel", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    if (!ACTIVE_STATUSES.includes(booking.status)) return res.status(400).json({ message: "This booking is no longer active." });

    booking.status = "CANCELLED";
    booking.notifications.push({ type: "QUEUE", message: "Booking cancelled. Remaining queue positions were recalculated." });
    await booking.save();
    await syncCentreState(booking.centre, booking.slotDate);

    res.json({ message: "Booking cancelled and queue recalculated.", booking });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/operator/:id/record", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate("cropRecord");
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    if (!booking.cropRecord) return res.status(400).json({ message: "Crop record is missing." });
    if (!ACTIVE_STATUSES.includes(booking.status)) return res.status(400).json({ message: "This booking is not waiting for verification." });

    const accepted = req.body.result === "ACCEPTED";
    const verifiedQuantity = Number(req.body.quantity);
    const pricePerQuintal = Number(req.body.pricePerQuintal || 2300);
    if (!Number.isFinite(verifiedQuantity) || verifiedQuantity <= 0) return res.status(400).json({ message: "Enter a valid verified quantity." });

    booking.status = accepted ? "ACCEPTED" : "REJECTED";
    booking.completedAt = new Date();
    booking.cropRecord.verification = {
      status: accepted ? "VERIFIED" : "REJECTED",
      grade: req.body.grade,
      quantity: verifiedQuantity,
      condition: req.body.condition,
      inspector: req.body.inspector || "Demo Inspector",
      inspectionDate: new Date(),
      notes: req.body.notes
    };
    await booking.cropRecord.save();

    if (accepted) {
      booking.payment = {
        status: "PROCESSING",
        amount: verifiedQuantity * pricePerQuintal,
        reference: "PFMS-DEMO-" + Date.now().toString().slice(-7),
        updatedAt: new Date()
      };
      booking.notifications.push({ type: "PROCUREMENT", message: "Crop accepted. Payment processing has started." });
    } else {
      booking.notifications.push({ type: "REJECTION", message: "Official verification recorded. The farmer can correct the issue and book again." });
    }

    await booking.save();
    await syncCentreState(booking.centre, booking.slotDate);
    res.json(await Booking.findById(booking._id).populate("centre").populate("farmer", "name farmerId mobile").populate("cropRecord"));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/booking/:id/payment", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    if (booking.status !== "ACCEPTED" && booking.status !== "PAID") return res.status(400).json({ message: "Booking must be accepted before payment is completed." });
    booking.payment.status = "PAID";
    booking.payment.updatedAt = new Date();
    booking.status = "PAID";
    booking.payment.reference ||= "PFMS-DEMO-" + Date.now().toString().slice(-7);
    await booking.save();
    res.json(booking);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/farmer/:farmerId/active", async (req, res) => {
  try {
    const farmer = await Farmer.findOne({ farmerId: req.params.farmerId });
    if (!farmer) return res.status(404).json({ message: "Farmer not found." });
    const bookings = await Booking.find({ farmer: farmer._id, status: { $in: ACTIVE_STATUSES } })
      .sort({ createdAt: -1 }).populate("centre").populate("cropRecord");
    res.json(bookings);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;

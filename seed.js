const mongoose = require("mongoose");
const Farmer = require("./models/Farmer");
const Centre = require("./models/Centre");
const CropRecord = require("./models/CropRecord");
const Booking = require("./models/Booking");
const PreProcurementVisit = require("./models/PreProcurementVisit");

const MONGO_URL = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/krishi_setu_ai";
const DEMO_DATE = new Date().toISOString().slice(0, 10);

const centres = [
  {
    name: "Najafgarh Procurement Centre",
    code: "CENTREA",
    district: "South West Delhi",
    cropsAccepted: ["Paddy", "Wheat", "Maize"],
    minimumGrade: "C",
    distanceKm: 7,
    hourlyCapacity: 120,
    averageServiceMinutes: 10,
    openTime: "08:00",
    closeTime: "18:00"
  },
  {
    name: "Bawana Procurement Centre",
    code: "CENTREB",
    district: "North West Delhi",
    cropsAccepted: ["Paddy", "Wheat", "Maize", "Bajra"],
    minimumGrade: "B",
    distanceKm: 14,
    hourlyCapacity: 140,
    averageServiceMinutes: 8,
    openTime: "08:00",
    closeTime: "18:00"
  },
  {
    name: "Narela Procurement Centre",
    code: "CENTREC",
    district: "North Delhi",
    cropsAccepted: ["Paddy", "Wheat", "Bajra", "Maize"],
    minimumGrade: "C",
    distanceKm: 18,
    hourlyCapacity: 180,
    averageServiceMinutes: 9,
    openTime: "08:00",
    closeTime: "18:00"
  }
];

const demoFarmers = [
  { name: "Ramesh Kumar", mobile: "9999999999", farmerId: "KSF-DEMO-001", village: "Najafgarh", district: "South West Delhi", state: "Delhi", landArea: 6.5 },
  { name: "Suresh Yadav", mobile: "9999999901", farmerId: "KSF-DEMO-002", village: "Bawana", district: "North West Delhi", state: "Delhi", landArea: 5.2 },
  { name: "Anil Kumar", mobile: "9999999902", farmerId: "KSF-DEMO-003", village: "Narela", district: "North Delhi", state: "Delhi", landArea: 4.8 },
  { name: "Deepak Rana", mobile: "9999999903", farmerId: "KSF-DEMO-004", village: "Najafgarh", district: "South West Delhi", state: "Delhi", landArea: 7.1 },
  { name: "Vinod Chauhan", mobile: "9999999904", farmerId: "KSF-DEMO-005", village: "Bawana", district: "North West Delhi", state: "Delhi", landArea: 5.9 },
  { name: "Mohan Singh", mobile: "9999999905", farmerId: "KSF-DEMO-006", village: "Narela", district: "North Delhi", state: "Delhi", landArea: 4.1 },
  { name: "Rajesh Malik", mobile: "9999999906", farmerId: "KSF-DEMO-007", village: "Bawana", district: "North West Delhi", state: "Delhi", landArea: 6.0 },
  { name: "Pawan Dahiya", mobile: "9999999907", farmerId: "KSF-DEMO-008", village: "Narela", district: "North Delhi", state: "Delhi", landArea: 8.0 },
  { name: "Amit Verma", mobile: "9999999908", farmerId: "KSF-DEMO-009", village: "Bawana", district: "North West Delhi", state: "Delhi", landArea: 4.7 },
  { name: "Ravi Kumar", mobile: "9999999909", farmerId: "KSF-DEMO-010", village: "Narela", district: "North Delhi", state: "Delhi", landArea: 5.5 },
  { name: "Harish Meena", mobile: "9999999910", farmerId: "KSF-DEMO-011", village: "Bawana", district: "North West Delhi", state: "Delhi", landArea: 6.3 },
  { name: "Karan Singh", mobile: "9999999911", farmerId: "KSF-DEMO-012", village: "Narela", district: "North Delhi", state: "Delhi", landArea: 5.0 }
];

function bankFor(farmer) {
  return {
    accountHolderName: farmer.name,
    accountNumber: "1100000000" + farmer.farmerId.slice(-3),
    ifsc: "DEMO0000123",
    bankName: "Demo Bank",
    governmentSyncStatus: "SYNCED",
    governmentReferenceId: "GOV-DEMO-" + farmer.farmerId.slice(-3),
    syncedAt: new Date()
  };
}

async function upsertCentre(data) {
  return Centre.findOneAndUpdate({ code: data.code }, { $set: data }, { upsert: true, new: true, setDefaultsOnInsert: true });
}

async function upsertFarmer(data) {
  return Farmer.findOneAndUpdate(
    { farmerId: data.farmerId },
    { $set: { ...data, bank: bankFor(data), preferredLanguage: "Hindi" } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function seed() {
  await mongoose.connect(MONGO_URL);

  const centreDocs = {};
  for (const centre of centres) centreDocs[centre.code] = await upsertCentre(centre);
  const farmerDocs = {};
  for (const farmer of demoFarmers) farmerDocs[farmer.farmerId] = await upsertFarmer(farmer);

  // Replace only this prototype's deterministic demo records; user-created data is preserved.
  await Booking.deleteMany({ tokenCode: /^CENTREB-(03[6-9]|04[0-7])$/ });
  await CropRecord.deleteMany({ farmer: { $in: Object.values(farmerDocs).map(f => f._id) }, location: "Demo Field" });
  await PreProcurementVisit.deleteMany({ farmer: { $in: Object.values(farmerDocs).map(f => f._id) }, location: "Demo Field" });

  const centre = centreDocs.CENTREB;
  for (let i = 0; i < 12; i++) {
    const farmer = farmerDocs[demoFarmers[i].farmerId];
    const quantity = i === 0 ? 25 : 20 + (i % 3) * 5;
    const crop = await CropRecord.create({
      farmer: farmer._id,
      cropType: "Wheat",
      estimatedQuantity: quantity,
      location: "Demo Field",
      aiScreening: {
        grade: i === 0 ? "B" : "A",
        visibleDamage: i === 0 ? "medium" : "low",
        score: i === 0 ? 76 : 92,
        disclaimer: "Preliminary screening only; official acceptance depends on physical verification."
      },
      priceInfo: { authorisedPrice: 2300, farmerPreferredPrice: null, matchStatus: "NOT_SET" }
    });

    const tokenNumber = 36 + i;
    const queuePosition = i + 1;
    const etaMin = Math.max(5, queuePosition * centre.averageServiceMinutes - 8);
    const etaMax = queuePosition * centre.averageServiceMinutes + 12;
    await Booking.create({
      tokenNumber,
      tokenCode: `CENTREB-${String(tokenNumber).padStart(3, "0")}`,
      farmer: farmer._id,
      cropRecord: crop._id,
      centre: centre._id,
      slotDate: DEMO_DATE,
      slotStart: "10:00",
      slotEnd: "11:00",
      quantity,
      status: i === 0 ? "BOOKED" : "ARRIVED",
      queuePosition,
      etaMin,
      etaMax,
      notifications: [{ type: "BOOKING", message: `Token CENTREB-${String(tokenNumber).padStart(3, "0")} booked for today's procurement queue.` }]
    });
  }

  // Give the inspector dashboard one realistic pending field-visit request for the demo.
  const demoFarmer = farmerDocs["KSF-DEMO-001"];
  const demoCrop = await CropRecord.findOne({ farmer: demoFarmer._id, location: "Demo Field" }).sort({ createdAt: 1 });
  if (demoCrop) {
    await PreProcurementVisit.create({
      farmer: demoFarmer._id,
      cropRecord: demoCrop._id,
      location: "Demo Field, Najafgarh",
      status: "REQUESTED"
    });
  }

  // Keep centre counters exactly aligned with the seeded queue.
  const active = await Booking.find({ centre: centre._id, slotDate: DEMO_DATE, status: { $in: ["BOOKED", "ARRIVED", "CALLED", "GRADING"] } });
  centre.queueCount = active.length;
  centre.bookedQuantity = active.reduce((sum, b) => sum + Number(b.quantity || 0), 0);
  centre.currentServingToken = 0;
  await centre.save();

  console.log("KrishiSetuAI demo seed complete.");
  console.log("Farmer login: 9999999999");
  console.log("Farmer ID: KSF-DEMO-001");
  console.log("Demo token: CENTREB-047");
  console.log(`Demo date: ${DEMO_DATE}`);
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});

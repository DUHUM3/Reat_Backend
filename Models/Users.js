const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phoneNumber: { type: String, required: true, unique: true },
  fcmToken: { type: String }, // 🔥 تمت إضافة هذا السطر
});


module.exports = mongoose.model("User", UserSchema);

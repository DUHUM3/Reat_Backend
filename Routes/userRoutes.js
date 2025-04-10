const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../Models/Users");
const router = express.Router();
const tokenService = require("../services/tokenService");
const authMiddleware = require("../middleware/authMiddleware");
require("dotenv").config();

const verificationCodes = new Map();
 
// إعداد Nodemailer
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

router.post("/send-verification-code", async (req, res) => {
  try {
    const { name, email, password, phoneNumber, fcmToken } = req.body; // إضافة fcmToken

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const verificationCode = crypto.randomInt(100000, 999999).toString();
    verificationCodes.set(email, { 
      name, 
      email, 
      password, 
      phoneNumber, 
      fcmToken, // تخزين fcmToken مؤقتاً للتحقق
      verificationCode 
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Email Verification Code",
      text: `Your verification code is: ${verificationCode}`,
    });

    res.status(200).json({ message: "Verification code sent to email" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

// التحقق من الكود وإنشاء الحساب
router.post("/verify-email", async (req, res) => {
  try {
    const { email, code } = req.body;

    const userData = verificationCodes.get(email);
    if (!userData) {
      return res.status(400).json({ message: "No verification request found for this email" });
    }

    if (userData.verificationCode !== code) {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    const hashedPassword = await bcrypt.hash(userData.password, 10);

    const newUser = new User({
      name: userData.name,
      email: userData.email,
      password: hashedPassword,
      phoneNumber: userData.phoneNumber,
      fcmToken: userData.fcmToken // حفظ fcmToken في قاعدة البيانات
    });

    await newUser.save();
    verificationCodes.delete(email);

    res.status(201).json({ message: "Account created successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

// تسجيل الدخول وإنشاء توكن JWT
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const token = tokenService.generateToken(user);

    res.status(200).json({ 
      message: "Login successful", 
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

router.post("/logout", authMiddleware, (req, res) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    
    if (!token || !tokenService.isTokenActive(token)) {
      return res.status(400).json({ message: "User not logged in" });
    }

    tokenService.revokeToken(token);
    res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

// مثال على مسار محمي باستخدام التوكن
router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

module.exports = router;
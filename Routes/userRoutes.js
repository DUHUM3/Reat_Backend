const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken"); // مكتبة JWT
const User = require("../Models/Users");
const router = express.Router();
require("dotenv").config();

const verificationCodes = new Map();
const activeTokens = new Set(); // تخزين الرموز النشطة (لضمان تسجيل دخول لمرة واحدة)

// إعداد Nodemailer
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// إرسال كود التحقق عند طلب التسجيل
router.post("/send-verification-code", async (req, res) => {
  try {
    const { name, email, password, phoneNumber } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const verificationCode = crypto.randomInt(100000, 999999).toString();
    verificationCodes.set(email, { name, email, password, phoneNumber, verificationCode });

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
    });

    await newUser.save();
    verificationCodes.delete(email);

    res.status(201).json({ message: "Account created successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

// 🔐 تسجيل الدخول وإنشاء توكن JWT لمرة واحدة
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

    // إنشاء التوكن JWT لمرة واحدة فقط
    if (activeTokens.has(email)) {
      return res.status(403).json({ message: "User already logged in elsewhere" });
    }

    const token = jwt.sign({ userId: user._id, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    activeTokens.add(email);

    res.status(200).json({ message: "Login successful", token });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

// 🔓 تسجيل الخروج وحذف التوكن
router.post("/logout", (req, res) => {
  try {
    const { email } = req.body;

    if (!activeTokens.has(email)) {
      return res.status(400).json({ message: "User not logged in" });
    }

    activeTokens.delete(email);
    res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

module.exports = router;

const express = require("express");
const router = express.Router();
const Admin = require("../Models/Admin");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const authMiddleware = require("../middleware/authAdminMiddleware");

// تسجيل الدخول (Login)
router.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        const admin = await Admin.findOne({ username });
        
        if (!admin) return res.status(404).json({ message: "Admin not found" });
        
        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });
        
        const token = jwt.sign({ id: admin._id }, "SECRET_KEY", { expiresIn: "1h" });
        res.json({ token, admin: { id: admin._id, username: admin.username } });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});

// إنشاء حساب إداري (Register)
router.post("/register", async (req, res) => {
    try {
        const { username, password } = req.body;
        const existingAdmin = await Admin.findOne({ username });
        if (existingAdmin) return res.status(400).json({ message: "Username already exists" });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const newAdmin = new Admin({ username, password: hashedPassword });
        await newAdmin.save();
        
        res.status(201).json({ message: "Admin created successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});

// جلب بيانات الأدمن (محمي بالتوثيق)
router.get("/profile", authMiddleware, async (req, res) => {
    try {
        const admin = await Admin.findById(req.admin.id).select("-password");
        if (!admin) return res.status(404).json({ message: "Admin not found" });
        res.json(admin);
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;

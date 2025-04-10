const express = require('express');
const app = express();
const path = require("path");
const cors = require('cors');
require('dotenv').config();
const connectDB = require('./config/db'); // استدعاء ملف الاتصال بقاعدة البيانات
const multer = require('multer');
const admin = require('firebase-admin');

// تحميل ملف خدمة Firebase JSON
const serviceAccount = require('./services/rest-d6cae-firebase-adminsdk-fbsvc-933dad5778.json');

// تهيئة Firebase Admin
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
// Middleware لتحليل بيانات JSON
app.use(express.json());

// إعداد مجلد التخزين للملفات المرفوعة
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

// إعداد `multer` مع التخزين المحدد
const upload = multer({ storage: storage });

// جعل مجلد `uploads` متاحًا للوصول العام
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// استيراد المسارات (Routes) إذا كنت تحتاجها
const videoRoutes = require('./Routes/videoRoutes');
const authRoutes = require('./Routes/userRoutes');
const adminRoutes = require("./Routes/adminRoutes");




app.use('/videos', videoRoutes); 
app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);
// إعدادات CORS
const PORT = process.env.PORT || 5000;

// الاتصال بقاعدة البيانات
connectDB();



// إعدادات CORS
app.use(cors());

// تشغيل الخادم
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});

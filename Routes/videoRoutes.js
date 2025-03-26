const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { Category, Video, Series } = require('../Models/Video');

const router = express.Router();

// 🟢 إعداد multer لتخزين الملفات داخل مجلد السلسلة
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const seriesName = req.body.seriesName || 'default_series';
        const uploadPath = `uploads/videos/${seriesName}/`;

        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage });
const categoryStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = 'uploads/categories/';
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const uploadCategoryImage = multer({ storage: categoryStorage });

// 🟢 إضافة قسم جديد
router.post('/categories', uploadCategoryImage.single('image'), async (req, res) => {
    try {
        const { name, description } = req.body;

        // 🔴 التحقق من أن القسم غير موجود مسبقًا
        const existingCategory = await Category.findOne({ name });
        if (existingCategory) {
            return res.status(400).json({ error: 'اسم القسم موجود بالفعل، لا يمكن تكراره' });
        }

        // 🟢 حفظ مسار الصورة إذا تم رفعها
        const imagePath = req.file ? req.file.path : null;

        const category = new Category({ name, description, image: imagePath });
        await category.save();
        
        res.status(201).json({ message: 'تم إنشاء القسم بنجاح', category });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



// 🟢 إضافة مسلسل جديد
router.post('/series', async (req, res) => {
    try {
        const { title, description, category } = req.body;

        // 🔴 التحقق من أن المسلسل غير موجود مسبقًا
        const existingSeries = await Series.findOne({ title });
        if (existingSeries) {
            return res.status(400).json({ error: 'اسم المسلسل موجود بالفعل، لا يمكن تكراره' });
        }

        const series = new Series({ title, description, category });
        await series.save();
        res.status(201).json({ message: 'تم إنشاء المسلسل بنجاح', series });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🟢 إضافة فيديو مع رفع ملف
router.post('/videos', upload.single('videos'), async (req, res) => {
    try {
        const { title, category, series, url } = req.body;

        // التحقق من أن الفيديو مرتبط إما بقسم أو مسلسل
        if (!category && !series) {
            return res.status(400).json({ error: 'يجب أن يكون الفيديو مرتبطًا إما بقسم أو مسلسل' });
        }

        // التحقق من رفع الملف
        if (!req.file) {
            return res.status(400).json({ error: 'يجب رفع ملف فيديو' });
        }

        const filename = req.file.filename;
        const videoPath = req.file.path;

        const video = new Video({ title, filename, category, series, url: videoPath });
        await video.save();

        res.status(201).json({ message: 'تم إنشاء الفيديو ورفعه بنجاح', video });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/all-data', async (req, res) => {
    try {
        const categories = await Category.find();
        const seriesList = await Series.find().populate('category', 'name'); // جلب اسم القسم المرتبط بالمسلسل

        res.status(200).json({
            categories,
            series: seriesList
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🟢 عرض آخر 10 فيديوهات من قسم "films" وآخر 10 فيديوهات تم إضافتها للمسلسلات في روت واحد
router.get('/latest-videos', async (req, res) => {
    try {
        // جلب القسم الذي اسمه "films"
        const category = await Category.findOne({ name: 'films' });
        if (!category) {
            return res.status(404).json({ error: 'القسم "films" غير موجود' });
        }

        // جلب آخر 10 فيديوهات من قسم "films"
        const filmsVideos = await Video.find({ category: category._id })
            .sort({ createdAt: -1 }) // ترتيب الفيديوهات حسب تاريخ الإضافة (الأحدث أولاً)
            .limit(10);

        // جلب آخر 10 فيديوهات تم إضافتها للمسلسلات
        const seriesVideos = await Video.find({ series: { $ne: null } }) // الفيديوهات التي لها مسلسل
            .sort({ createdAt: -1 }) // ترتيب الفيديوهات حسب تاريخ الإضافة (الأحدث أولاً)
            .limit(10);

        // إرسال البيانات
        res.status(200).json({
            filmsVideos,
            seriesVideos
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🟢 عرض كل فيديوهات قسم معين أو مسلسل معين
router.get('/videos-by-category-or-series', async (req, res) => {
    try {
        const { categoryId, seriesId } = req.query;

        // التحقق من وجود واحد من المعاملات
        if (!categoryId && !seriesId) {
            return res.status(400).json({ error: 'يجب تحديد id قسم أو مسلسل' });
        }

        let query = {};

        // إذا تم تقديم categoryId، فإننا نبحث عن الفيديوهات المرتبطة بهذا القسم
        if (categoryId) {
            query.category = categoryId;
        }

        // إذا تم تقديم seriesId، فإننا نبحث عن الفيديوهات المرتبطة بهذا المسلسل
        if (seriesId) {
            query.series = seriesId;
        }

        // جلب الفيديوهات وفقًا للـ query المقدم
        const videos = await Video.find(query).sort({ createdAt: -1 }); // ترتيب الفيديوهات حسب تاريخ الإضافة (الأحدث أولاً)

        if (videos.length === 0) {
            return res.status(404).json({ message: 'لا توجد فيديوهات لهذا القسم أو المسلسل' });
        }

        res.status(200).json({ videos });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



module.exports = router;

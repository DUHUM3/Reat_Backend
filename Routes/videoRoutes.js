const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Category, Video, Series } = require('../Models/Video');
const FormData = require('form-data'); // ✅ تأكد من استيراد FormData بشكل صحيح
const router = express.Router();

// متغيرات Uploadcare
const UPLOADCARE_PUBLIC_KEY = '0cb9675c5c475bdeeca9'; // استخدم Public Key لرفع الملفات
const UPLOADCARE_API_URL = 'https://upload.uploadcare.com/base/';

// 🟢 إعداد multer لتخزين الملفات داخل مجلد السلسلة
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let uploadPath;

        if (file.mimetype.startsWith('video/')) {
            const seriesName = req.body.seriesName || 'default_series';
            uploadPath = `uploads/videos/${seriesName}/`;
        } else if (file.mimetype.startsWith('image/')) {
            uploadPath = `uploads/thumbnails/`; // 🔹 تخزين الصور في مجلد منفصل
        } else {
            return cb(new Error('نوع الملف غير مدعوم'), false);
        }

        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

// 🟢 إعداد `multer` لدعم الفيديو والصورة
const upload = multer({ storage });

// 🟢 إضافة وظيفة لرفع الملفات إلى Uploadcare
const uploadToUploadcare = async (filePath) => {
    try {
        const fileStream = fs.createReadStream(filePath);
        const formData = new FormData();
        formData.append('file', fileStream);
        formData.append('UPLOADCARE_PUB_KEY', UPLOADCARE_PUBLIC_KEY);
        formData.append('UPLOADCARE_STORE', 'auto');

        const response = await axios.post(
            UPLOADCARE_API_URL,
            formData,
            {
                headers: formData.getHeaders()
            }
        );

        if (response.data && response.data.file) {
            // ✅ إرجاع الرابط الكامل بدلاً من الـ UUID فقط
            return `https://ucarecdn.com/${response.data.file}/`;
        } else {
            throw new Error('فشل رفع الملف');
        }
    } catch (error) {
        console.error('Error uploading to Uploadcare:', error.message);
        if (error.response) {
            console.error('Error response from Uploadcare:', error.response.data);
        }
        throw new Error('فشل رفع الملف إلى Uploadcare');
    }
};

 // 🟢 مسار جلب تفاصيل الفيديو حسب الـ ID
router.get('/videos/:id', async (req, res) => {
    try {
        const videoId = req.params.id;
        const video = await Video.findById(videoId);

        if (!video) {
            return res.status(404).json({ message: 'الفيديو غير موجود' });
        }

        // ✅ إرجاع التفاصيل مع روابط الفيديو والصورة
        res.json({
            message: 'تم جلب تفاصيل الفيديو بنجاح',
            video: {
                _id: video._id,
                title: video.title,
                filename: video.filename,
                category: video.category,
                views: video.views,
                rating: video.rating,
                uploadedAt: video.uploadedAt,
                url: `https://ucarecdn.com/${video.url}/`, // 🔹 رابط الفيديو
                thumbnail: `https://ucarecdn.com/${video.thumbnail}/` // 🔹 رابط الصورة
            }
        });
    } catch (error) {
        console.error('Error fetching video details:', error);
        res.status(500).json({ message: 'حدث خطأ أثناء جلب تفاصيل الفيديو' });
    }
});

 


// 🟢 إضافة فيديو
router.post('/videos', upload.fields([{ name: 'video' }, { name: 'thumbnail' }]), async (req, res) => {
    try {
        const { title, category, series } = req.body;

        if (!category && !series) {
            return res.status(400).json({ error: 'يجب أن يكون الفيديو مرتبطًا إما بقسم أو مسلسل' });
        }

        if (!req.files || !req.files.video) {
            return res.status(400).json({ error: 'يجب رفع ملف فيديو' });
        }

        const videoFile = req.files.video[0];
        const thumbnailFile = req.files.thumbnail ? req.files.thumbnail[0] : null;

        // رفع الفيديو إلى Uploadcare
        const videoFileUrl = await uploadToUploadcare(videoFile.path);

        // رفع الصورة المصغرة إذا كانت موجودة
        let thumbnailUrl = null;
        if (thumbnailFile) {
            thumbnailUrl = await uploadToUploadcare(thumbnailFile.path);
        }

        const video = new Video({
            title,
            filename: videoFile.filename,
            category,
            series,
            url: videoFileUrl,
            thumbnail: thumbnailUrl // 🔹 حفظ الرابط الخاص بالصورة المصغرة
        });

        await video.save();

        res.status(201).json({ message: 'تم إنشاء الفيديو ورفع الغلاف بنجاح', video });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🟢 إضافة قسم جديد
router.post('/categories', upload.single('image'), async (req, res) => {
    try {
        const { name, description } = req.body;

        const existingCategory = await Category.findOne({ name });
        if (existingCategory) {
            return res.status(400).json({ error: 'اسم القسم موجود بالفعل، لا يمكن تكراره' });
        }

        const imagePath = req.file ? req.file.path : null;

        // رفع الصورة إلى Uploadcare إذا كانت موجودة
        let imageUrl = null;
        if (imagePath) {
            imageUrl = await uploadToUploadcare(imagePath);
        }

        const category = new Category({ name, description, image: imageUrl });
        await category.save();

        res.status(201).json({ message: 'تم إنشاء القسم بنجاح', category });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🟢 إضافة مسلسل جديد
router.post('/series', upload.single('image'), async (req, res) => {
    try {
        const { title, description, category } = req.body;

        const existingSeries = await Series.findOne({ title });
        if (existingSeries) {
            return res.status(400).json({ error: 'اسم المسلسل موجود بالفعل، لا يمكن تكراره' });
        }

        const imageUrl = req.file ? await uploadToUploadcare(req.file.path) : null;

        const series = new Series({ title, description, category, imageUrl });
        await series.save();

        res.status(201).json({ message: 'تم إنشاء المسلسل بنجاح', series });
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

        // جلب آخر 10 فيديوهات من قسم "films" مع جميع التفاصيل
        const filmsVideos = await Video.find({ category: category._id })
            .sort({ createdAt: -1 })
            .limit(10);

        // جلب آخر 10 فيديوهات من المسلسلات مع جميع التفاصيل + معلومات المسلسل
        const seriesVideos = await Video.find({ series: { $ne: null } })
            .populate('series', 'title imageUrl') // جلب معلومات المسلسل (العنوان والصورة)
            .sort({ createdAt: -1 })
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

// 🟢 مسار لعرض جميع الأقسام
router.get('/categories', async (req, res) => {
    try {
        // استرجاع جميع الأقسام من قاعدة البيانات
        const categories = await Category.find();

        // التحقق مما إذا كانت الأقسام موجودة
        if (!categories || categories.length === 0) {
            return res.status(404).json({ message: 'لا توجد أقسام' });
        }

        // إرسال الأقسام
        res.status(200).json({ categories });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



module.exports = router;

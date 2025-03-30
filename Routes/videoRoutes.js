const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Category, Video, Series ,Complaint } = require('../Models/Video');
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
                url: `${video.url}/`, // 🔹 رابط الفيديو
                thumbnail: `${video.thumbnail}/` // 🔹 رابط الصورة
            }
        });
    } catch (error) {
        console.error('Error fetching video details:', error);
        res.status(500).json({ message: 'حدث خطأ أثناء جلب تفاصيل الفيديو' });
    }
});

 


router.post('/videos', upload.fields([{ name: 'video' }, { name: 'thumbnail' }]), async (req, res) => {
    try {
        const { title, category, series } = req.body;

        if (!category && !series) {
            return res.status(400).json({ error: 'يجب أن يكون الفيديو مرتبطًا إما بقسم فرعي أو مسلسل' });
        }

        if (category) {
            // 🔹 التحقق مما إذا كان القسم المحدد رئيسي
            const selectedCategory = await Category.findById(category);
            if (!selectedCategory) {
                return res.status(404).json({ error: 'القسم غير موجود' });
            }

            if (selectedCategory.parent === null) {
                return res.status(400).json({ error: 'لا يمكن إضافة فيديو إلى قسم رئيسي، فقط إلى الأقسام الفرعية' });
            }
        }

        if (!req.files || !req.files.video) {
            return res.status(400).json({ error: 'يجب رفع ملف فيديو' });
        }

        const videoFile = req.files.video[0];
        const thumbnailFile = req.files.thumbnail ? req.files.thumbnail[0] : null;

        // 🔹 رفع الفيديو إلى Uploadcare
        const videoFileUrl = await uploadToUploadcare(videoFile.path);

        // 🔹 رفع الصورة المصغرة إذا كانت موجودة
        let thumbnailUrl = null;
        if (thumbnailFile) {
            thumbnailUrl = await uploadToUploadcare(thumbnailFile.path);
        }

        // 🔹 إنشاء الفيديو
        const video = new Video({
            title,
            filename: videoFile.filename,
            category,
            series,
            url: videoFileUrl,
            thumbnail: thumbnailUrl
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

        // 🔹 التحقق من وجود اسم القسم مسبقًا
        const existingCategory = await Category.findOne({ name });
        if (existingCategory) {
            return res.status(400).json({ error: 'اسم القسم موجود بالفعل، لا يمكن تكراره' });
        }

        let imageUrl = null;
        if (req.file) {
            // 🔹 رفع الصورة إلى Uploadcare
            imageUrl = await uploadToUploadcare(req.file.path);
        }

        // 🔹 إنشاء القسم الجديد مع الصورة المرفوعة
        const category = new Category({ name, description, image: imageUrl });
        await category.save();

        res.status(201).json({ message: 'تم إنشاء القسم بنجاح', category });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🟢 إضافة قسم فرعي لقسم رئيسي
router.post('/categories/add-subcategory', upload.single('image'), async (req, res) => {
    try {
        const { name, description, parentId } = req.body;

        // ✅ التحقق من وجود القسم الرئيسي
        const parentCategory = await Category.findById(parentId);
        if (!parentCategory) {
            return res.status(404).json({ message: 'القسم الرئيسي غير موجود' });
        }

        let imageUrl = null;
        if (req.file) {
            // ✅ رفع الصورة إلى Uploadcare
            imageUrl = await uploadToUploadcare(req.file.path);
        }

        // ✅ إنشاء القسم الفرعي مع الصورة المرفوعة
        const subcategory = new Category({
            name,
            description,
            image: imageUrl,
            parent: parentId, // ربطه بالقسم الرئيسي
        });

        await subcategory.save();

        // ✅ تحديث القسم الرئيسي بإضافة القسم الفرعي إليه
        parentCategory.subcategories.push(subcategory._id);
        await parentCategory.save();

        res.status(201).json({ message: 'تم إضافة القسم الفرعي بنجاح', subcategory });
    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ أثناء الإضافة', error: error.message });
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

// 🟢 مسار لعرض الأقسام الرئيسية فقط
router.get('/categories', async (req, res) => {
    try {
        // 🔹 جلب الأقسام الرئيسية فقط (التي ليس لديها parent)
        const categories = await Category.find({ parent: null });

        // 🔹 التحقق مما إذا كانت الأقسام موجودة
        if (!categories || categories.length === 0) {
            return res.status(404).json({ message: 'لا توجد أقسام رئيسية' });
        }

        // 🔹 إرسال الأقسام الرئيسية فقط
        res.status(200).json({ categories });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// 🟢 مسار لعرض جميع الأقسام الفرعية لقسم معين
router.get('/categories/:parentId/subcategories', async (req, res) => {
    try {
        const { parentId } = req.params;

        // 🔹 التحقق مما إذا كان القسم الرئيسي موجودًا
        const parentCategory = await Category.findById(parentId);
        if (!parentCategory) {
            return res.status(404).json({ message: 'القسم الرئيسي غير موجود' });
        }

        // 🔹 جلب جميع الأقسام الفرعية التي تنتمي لهذا القسم الرئيسي
        const subcategories = await Category.find({ parent: parentId });

        if (!subcategories || subcategories.length === 0) {
            return res.status(404).json({ message: 'لا توجد أقسام فرعية لهذا القسم' });
        }

        res.status(200).json({ parent: parentCategory.name, subcategories });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


router.put('/videos/:id/view', async (req, res) => {
    try {
        const video = await Video.findByIdAndUpdate(
            req.params.id,
            { $inc: { views: 1 } }, // زيادة المشاهدات بمقدار 1
            { new: true } // إرجاع العنصر بعد التحديث
        );
        if (!video) return res.status(404).json({ message: "Video not found" });
        res.json(video);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/videos/:id/rate', async (req, res) => {
    try {
        const video = await Video.findByIdAndUpdate(
            req.params.id,
            { rating: 1 }, // تثبيت التقييم عند 1
            { new: true }
        );
        if (!video) return res.status(404).json({ message: "Video not found" });
        res.json(video);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/videos/:id/suggestions', async (req, res) => {
    try {
        const videoId = req.params.id;
        const video = await Video.findById(videoId);

        if (!video) {
            return res.status(404).json({ message: 'الفيديو غير موجود' });
        }

        let query = {};

        // إذا كان الفيديو مرتبطًا بمسلسل، نقترح فيديوهات من نفس المسلسل
        if (video.series) {
            query.series = video.series;
        } else if (video.category) {
            // إذا لم يكن مرتبطًا بمسلسل، نقترح فيديوهات من نفس الفئة
            query.category = video.category;
        }

        // استثناء الفيديو الأصلي من النتائج
        query._id = { $ne: video._id };

        // جلب 10 فيديوهات مقترحة بناءً على نفس الفئة أو المسلسل
        const suggestedVideos = await Video.find(query)
            .sort({ views: -1 }) // ترتيب الفيديوهات بناءً على عدد المشاهدات
            .limit(10);

        // التحقق إذا كانت القائمة فارغة
        if (suggestedVideos.length === 0) {
            return res.status(404).json({ message: 'لا توجد فيديوهات مقترحة حالياً' });
        }

        res.status(200).json({ suggestedVideos });
    } catch (error) {
        console.error('Error fetching suggested videos:', error);
        res.status(500).json({ message: 'حدث خطأ أثناء جلب الفيديوهات المقترحة' });
    }
});


// 🔎 البحث عن قسم أو فيديو
router.get('/search', async (req, res) => {
    try {
      const { type, query } = req.query; // استخراج نوع البحث والكلمة المفتاحية
  
      if (!type || !query) {
        return res.status(400).json({ message: 'يجب تحديد نوع البحث وإدخال كلمة البحث.' });
      }
  
      let results = [];
  
      if (type === 'category') {
        results = await Category.find({ name: { $regex: query, $options: 'i' } }); // البحث عن الأقسام
      } else if (type === 'video') {
        results = await Video.find({ title: { $regex: query, $options: 'i' } }).populate('category series'); // البحث عن الفيديوهات مع جلب بيانات القسم والمسلسل
      } else {
        return res.status(400).json({ message: 'نوع البحث غير صالح، استخدم category أو video فقط.' });
      }
  
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: 'حدث خطأ أثناء البحث.', error: error.message });
    }
  });


  // إضافة شكوى جديدة
router.post('/complaints', async (req, res) => {
    try {
        const { title, description, user } = req.body;

        // تحقق من أن جميع الحقول المطلوبة متوفرة
        if (!title || !description || !user) {
            return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
        }

        // إنشاء كائن الشكوى الجديد
        const newComplaint = new Complaint({
            title,
            description,
            user
        });

        // حفظ الشكوى في قاعدة البيانات
        await newComplaint.save();

        res.status(201).json({ message: 'تم إرسال الشكوى بنجاح', complaint: newComplaint });
    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ أثناء إرسال الشكوى', error: error.message });
    }
});

module.exports = router;

const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Category, Video, Series ,Complaint } = require('../Models/Video');
const authMiddleware = require('../middleware/authMiddleware'); // استيراد الميدلير للتحقق من التوكن

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

        // ✅ إرجاع التفاصيل مع روابط الفيديو والصورة والمفضلة
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
                favorites: video.favorites, // ✅ حالة المفضلة
                favoritesCount: video.favoritesCount, // ✅ عدد المرات المضافة للمفضلة
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


// روت لعرض أحدث الأفلام والمسلسلات في قوائم منفصلة
router.get('/latest-videos', async (req, res) => {
    try {
        // 1. العثور على قسم الأفلام الرئيسي وقسم المسلسلات الرئيسي
        const moviesCategory = await Category.findOne({ name: 'قسم الافلام', parent: null });
        const seriesCategory = await Category.findOne({ name: 'قسم المسلسلات', parent: null });

        if (!moviesCategory && !seriesCategory) {
            return res.status(404).json({ message: 'لم يتم العثور على قسم الأفلام أو المسلسلات' });
        }

        // 2. جلب الأقسام الفرعية لكل قسم رئيسي
        let movieSubcategoriesIds = [];
        let seriesSubcategoriesIds = [];
        
        if (moviesCategory) {
            const movieSubcategories = await Category.find({ parent: moviesCategory._id });
            movieSubcategoriesIds = movieSubcategories.map(sub => sub._id);
        }
        
        if (seriesCategory) {
            const seriesSubcategories = await Category.find({ parent: seriesCategory._id });
            seriesSubcategoriesIds = seriesSubcategories.map(sub => sub._id);
        }

        // 3. جلب أحدث 10 أفلام من الأقسام الفرعية للأفلام
        const latestMovies = await Video.find({
            $or: [
                { category: { $in: movieSubcategoriesIds } },
                { series: { $in: movieSubcategoriesIds } }
            ]
        })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('category series');

        // 4. جلب أحدث 10 مسلسلات من الأقسام الفرعية للمسلسلات
        const latestSeries = await Video.find({
            $or: [
                { category: { $in: seriesSubcategoriesIds } },
                { series: { $in: seriesSubcategoriesIds } }
            ]
        })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('category series');

        // 5. إرسال النتيجة مع قوائم منفصلة
        res.status(200).json({
            message: 'أحدث الأفلام والمسلسلات في قوائم منفصلة',
            movies: {
                count: latestMovies.length,
                videos: latestMovies
            },
            series: {
                count: latestSeries.length,
                videos: latestSeries
            }
        });

    } catch (error) {
        console.error('Error fetching latest movies and series:', error);
        res.status(500).json({ 
            message: 'حدث خطأ أثناء جلب أحدث الأفلام والمسلسلات', 
            error: error.message 
        });
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

router.put('/videos/:id/view', authMiddleware, async (req, res) => {
    try {
        // العثور على الفيديو
        const video = await Video.findById(req.params.id);

        if (!video) {
            return res.status(404).json({ message: "الفيديو غير موجود" });
        }

        // تحقق من التكرار بناءً على نفس التكنمرين
        if (video.viewedBy && video.viewedBy.includes(req.user.userId)) {
            return res.status(400).json({ message: "لقد شاهدت هذا الفيديو بالفعل" });
        }

        // إضافة الـ userId إلى قائمة المستخدمين الذين شاهدوا الفيديو
        video.viewedBy = video.viewedBy || [];
        video.viewedBy.push(req.user.userId);

        // زيادة عدد المشاهدات
        video.views += 1;

        // حفظ الفيديو مع التحديثات
        await video.save();

        res.json({ message: "تم إضافة المشاهدة بنجاح", video });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "حدث خطأ في الخادم" });
    }
});


// روت لإضافة الفيديو إلى المفضلة
router.post('/add-to-favorites/:videoId', authMiddleware, async (req, res) => {
    try {
      // العثور على الفيديو حسب الـ ID
      const video = await Video.findById(req.params.videoId);
      
      if (!video) {
        return res.status(404).json({ message: 'الفيديو غير موجود' });
      }
  
      // تحديث حالة المفضلة وزيادة العدد
      if (!video.favorites) {
        video.favorites = true; // تعيين المفضلة إلى true
        video.favoritesCount += 1; // زيادة عدد المفضلات
        await video.save(); // حفظ التحديثات في قاعدة البيانات
        return res.status(200).json({ message: 'تم إضافة الفيديو إلى المفضلة', video });
      } else {
        return res.status(400).json({ message: 'الفيديو بالفعل في المفضلة' });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'حدث خطأ في الخادم' });
    }
  });


  // روت لجلب جميع الفيديوهات في المفضلة
router.get('/favorites', authMiddleware, async (req, res) => {
    try {
        // البحث عن جميع الفيديوهات التي تم وضعها في المفضلة
        const favoriteVideos = await Video.find({ favorites: true });
        
        if (favoriteVideos.length === 0) {
            return res.status(404).json({ message: 'لا توجد فيديوهات في المفضلة' });
        }

        res.status(200).json({ videos: favoriteVideos });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'حدث خطأ في الخادم' });
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
// إضافة شكوى جديدة
router.post('/complaints', authMiddleware, async (req, res) => {
    try {
        const { title, description } = req.body;

        // استخراج معرف المستخدم من التوكن
        const userId = req.user.userId;

        // تحقق من أن جميع الحقول المطلوبة متوفرة
        if (!title || !description) {
            return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
        }

        // إنشاء كائن الشكوى الجديد
        const newComplaint = new Complaint({
            title,
            description,
            user: userId // استخدام userId المستخرج من التوكن
        });

        // حفظ الشكوى في قاعدة البيانات
        await newComplaint.save();

        res.status(201).json({ message: 'تم إرسال الشكوى بنجاح', complaint: newComplaint });
    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ أثناء إرسال الشكوى', error: error.message });
    }
});
// 🟢 مسار لعرض جميع الأقسام مع تفاصيلها متضمنة الأقسام الفرعية المتداخلة
router.get('/all-categories-nested', async (req, res) => {
    try {
        // دالة مساعدة لجلب الأقسام بشكل متداخل
        const getCategoriesWithSubcategories = async (parentId = null) => {
            const categories = await Category.find({ parent: parentId });
            
            const result = [];
            
            for (const category of categories) {
                // جلب عدد الفيديوهات في هذا القسم مباشرة
                const videosCount = await Video.countDocuments({ category: category._id });
                
                // جلب الأقسام الفرعية بشكل متكرر
                const subcategories = await getCategoriesWithSubcategories(category._id);
                
                // حساب عدد الفيديوهات في الأقسام الفرعية
                let subcategoriesVideosCount = 0;
                if (subcategories.length > 0) {
                    const subcategoryIds = subcategories.map(sub => sub._id);
                    subcategoriesVideosCount = await Video.countDocuments({ 
                        category: { $in: subcategoryIds } 
                    });
                }
                
                // بناء كائن القسم مع تفاصيله
                const categoryWithDetails = {
                    _id: category._id,
                    name: category.name,
                    description: category.description,
                    image: category.image,
                    createdAt: category.createdAt,
                    updatedAt: category.updatedAt,
                    totalVideos: videosCount + subcategoriesVideosCount,
                    subcategories: subcategories
                };
                
                result.push(categoryWithDetails);
            }
            
            return result;
        };

        // جلب جميع الأقسام بشكل متداخل
        const allCategories = await getCategoriesWithSubcategories();

        if (allCategories.length === 0) {
            return res.status(404).json({ message: 'لا توجد أقسام متاحة' });
        }

        res.status(200).json({
            message: 'تم جلب جميع الأقسام مع تفاصيلها المتداخلة بنجاح',
            totalCategories: allCategories.length,
            categories: allCategories
        });

    } catch (error) {
        console.error('Error fetching nested categories:', error);
        res.status(500).json({ 
            message: 'حدث خطأ أثناء جلب الأقسام المتداخلة', 
            error: error.message 
        });
    }
});


// 🟡 مسار لعرض كل الأقسام الفرعية النهائية (التي لا تحتوي على أقسام فرعية أخرى)
router.get('/leaf-categories', async (req, res) => {
    try {
        // جلب جميع الأقسام
        const allCategories = await Category.find();

        // استخراج الـ _id لكل قسم
        const allCategoryIds = allCategories.map(cat => cat._id.toString());

        // استخراج الـ parent لكل قسم، أي الأقسام التي هي آباء لأقسام أخرى
        const parentIds = allCategories
            .filter(cat => cat.parent)
            .map(cat => cat.parent.toString());

        // الأقسام النهائية هي التي لا تظهر كـ parent
        const leafCategoryIds = allCategoryIds.filter(id => !parentIds.includes(id));

        // جلب تفاصيل هذه الأقسام النهائية
        const leafCategories = await Category.find({ _id: { $in: leafCategoryIds } });

        if (leafCategories.length === 0) {
            return res.status(404).json({ message: 'لا توجد أقسام فرعية نهائية' });
        }

        res.status(200).json({
            message: 'تم جلب الأقسام الفرعية النهائية بنجاح',
            totalLeafCategories: leafCategories.length,
            leafCategories: leafCategories
        });

    } catch (error) {
        console.error('Error fetching leaf categories:', error);
        res.status(500).json({ 
            message: 'حدث خطأ أثناء جلب الأقسام النهائية', 
            error: error.message 
        });
    }
});


router.get('/all-videos', async (req, res) => {
    try {
        // استخراج معاملات البحث والتصفية من query parameters
        const { category, series, sortBy, order, search } = req.query;

        // بناء كائن الاستعلام
        const query = {};
        
        if (category) query.category = category;
        if (series) query.series = series;
        if (search) query.title = { $regex: search, $options: 'i' };

        // بناء كائن الترتيب
        const sortOptions = {};
        if (sortBy) {
            const validSortFields = ['title', 'views', 'rating', 'createdAt', 'updatedAt'];
            if (validSortFields.includes(sortBy)) {
                sortOptions[sortBy] = order === 'desc' ? -1 : 1;
            }
        } else {
            sortOptions.createdAt = -1; // الترتيب الافتراضي بالأحدث أولاً
        }

        // جلب جميع الفيديوهات مع التصفية والترتيب
        const videos = await Video.find(query)
            .sort(sortOptions)
            .populate('category series');

        if (videos.length === 0) {
            return res.status(404).json({ message: 'لا توجد فيديوهات متاحة' });
        }

        res.status(200).json({
            message: 'تم جلب الفيديوهات بنجاح',
            totalVideos: videos.length,
            videos
        });

    } catch (error) {
        console.error('Error fetching all videos:', error);
        res.status(500).json({ 
            message: 'حدث خطأ أثناء جلب الفيديوهات', 
            error: error.message 
        });
    }
});


// Route to delete a category
router.delete('/category/:categoryId', async (req, res) => {
    try {
      const categoryId = req.params.categoryId;
  
      // Find the category
      const category = await Category.findById(categoryId);
      if (!category) {
        return res.status(404).json({ message: 'القسم غير موجود' });
      }
  
      // If category has a parent, remove this category from the parent's subcategories
      if (category.parent) {
        await Category.updateOne(
          { _id: category.parent },
          { $pull: { subcategories: categoryId } }
        );
      }
  
      // Use deleteOne instead of remove
      await Category.deleteOne({ _id: categoryId });
  
      return res.status(200).json({ message: 'تم حذف القسم وكل المحتوى المرتبط به بنجاح' });
    } catch (err) {
      return res.status(500).json({ message: 'حدث خطأ أثناء الحذف', error: err.message });
    }
  });
  
// Route to delete a video
router.delete('/video/:videoId', async (req, res) => {
    try {
      const videoId = req.params.videoId;
  
      // Find the video
      const video = await Video.findById(videoId);
      if (!video) {
        return res.status(404).json({ message: 'الفيديو غير موجود' });
      }
  
      // Use deleteOne instead of remove
      await Video.deleteOne({ _id: videoId });
  
      return res.status(200).json({ message: 'تم حذف الفيديو بنجاح' });
    } catch (err) {
      return res.status(500).json({ message: 'حدث خطأ أثناء الحذف', error: err.message });
    }
  });

 

router.put('/videos/:id', upload.single('thumbnail'), async (req, res) => {
    try {
        const { title, description } = req.body;
        const videoId = req.params.id;

        // التحقق من وجود الفيديو
        const video = await Video.findById(videoId);
        if (!video) {
            return res.status(404).json({ message: 'الفيديو غير موجود' });
        }

        // تحديث البيانات النصية إذا وجدت
        if (title) video.title = title;
        if (description) video.description = description;

        // تحديث الصورة المصغرة إذا تم رفع ملف جديد
        if (req.file) {
            const newThumbnailUrl = await uploadToUploadcare(req.file.path);
            video.thumbnail = newThumbnailUrl;
        }

        await video.save();

        res.status(200).json({ 
            message: 'تم تحديث الفيديو بنجاح', 
            video: {
                _id: video._id,
                title: video.title,
                description: video.description,
                thumbnail: video.thumbnail,
                url: video.url,
                category: video.category,
                series: video.series,
                views: video.views,
                rating: video.rating
            }
        });
    } catch (error) {
        res.status(500).json({ 
            message: 'حدث خطأ أثناء تحديث الفيديو', 
            error: error.message 
        });
    }
});



router.put('/categories/:id', upload.single('image'), async (req, res) => {
    try {
        const { name, description } = req.body;
        const categoryId = req.params.id;

        // التحقق من وجود القسم
        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ message: 'القسم غير موجود' });
        }

        // التحقق من عدم تكرار الاسم إذا تم تغييره
        if (name && name !== category.name) {
            const existingCategory = await Category.findOne({ name });
            if (existingCategory) {
                return res.status(400).json({ message: 'اسم القسم موجود بالفعل' });
            }
            category.name = name;
        }

        // تحديث الوصف إذا وجد
        if (description) category.description = description;

        // تحديث الصورة إذا تم رفع ملف جديد
        if (req.file) {
            const newImageUrl = await uploadToUploadcare(req.file.path);
            category.image = newImageUrl;
        }

        await category.save();

        res.status(200).json({ 
            message: 'تم تحديث القسم بنجاح', 
            category: {
                _id: category._id,
                name: category.name,
                description: category.description,
                image: category.image,
                parent: category.parent,
                subcategories: category.subcategories,
                createdAt: category.createdAt,
                updatedAt: category.updatedAt
            }
        });
    } catch (error) {
        res.status(500).json({ 
            message: 'حدث خطأ أثناء تحديث القسم', 
            error: error.message 
        });
    }
});



// 🟢 روت للإحصائيات التفصيلية
router.get('/stats', async (req, res) => {
    try {
        // 1. إحصائيات الفيديوهات
        const totalVideos = await Video.countDocuments();
        const videosByCategory = await Video.aggregate([
            { $group: { _id: "$category", count: { $sum: 1 } } },
            { $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "category" } },
            { $unwind: "$category" },
            { $project: { "category.name": 1, count: 1 } }
        ]);
        
        const videosBySeries = await Video.aggregate([
            { $group: { _id: "$series", count: { $sum: 1 } } },
            { $lookup: { from: "series", localField: "_id", foreignField: "_id", as: "series" } },
            { $unwind: "$series" },
            { $project: { "series.title": 1, count: 1 } }
        ]);

        // 2. إحصائيات المشاهدات
        const totalViews = await Video.aggregate([
            { $group: { _id: null, totalViews: { $sum: "$views" } } }
        ]);
        
        const mostViewedVideos = await Video.find()
            .sort({ views: -1 })
            .limit(5)
            .select('title views thumbnail');

        // 3. إحصائيات الأقسام
        const totalCategories = await Category.countDocuments();
        const categoriesWithMostVideos = await Video.aggregate([
            { $group: { _id: "$category", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 },
            { $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "category" } },
            { $unwind: "$category" },
            { $project: { "category.name": 1, count: 1 } }
        ]);

        // 4. إحصائيات المسلسلات
        const totalSeries = await Series.countDocuments();
        const seriesWithMostEpisodes = await Video.aggregate([
            { $group: { _id: "$series", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 },
            { $lookup: { from: "series", localField: "_id", foreignField: "_id", as: "series" } },
            { $unwind: "$series" },
            { $project: { "series.title": 1, count: 1 } }
        ]);

        // 5. إحصائيات المفضلة
        const totalFavorites = await Video.countDocuments({ favorites: true });
        const mostFavoritedVideos = await Video.find({ favorites: true })
            .sort({ favoritesCount: -1 })
            .limit(5)
            .select('title favoritesCount thumbnail');

        // 6. إحصائيات الشكاوى
        const totalComplaints = await Complaint.countDocuments();
        const recentComplaints = await Complaint.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .select('title status createdAt');

        // 7. إحصائيات النشاط الأخير
        const recentlyAddedVideos = await Video.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .select('title createdAt thumbnail');
            
        const recentlyUpdatedCategories = await Category.find()
            .sort({ updatedAt: -1 })
            .limit(5)
            .select('name updatedAt');

        // تجميع كل الإحصائيات في كائن واحد
        const stats = {
            videos: {
                total: totalVideos,
                byCategory: videosByCategory,
                bySeries: videosBySeries,
                mostViewed: mostViewedVideos,
                recentlyAdded: recentlyAddedVideos
            },
            views: {
                total: totalViews[0]?.totalViews || 0
            },
            categories: {
                total: totalCategories,
                mostPopular: categoriesWithMostVideos,
                recentlyUpdated: recentlyUpdatedCategories
            },
            series: {
                total: totalSeries,
                mostEpisodes: seriesWithMostEpisodes
            },
            favorites: {
                total: totalFavorites,
                mostFavorited: mostFavoritedVideos
            },
            complaints: {
                total: totalComplaints,
                recent: recentComplaints
            }
        };

        res.status(200).json({
            message: 'تم جلب الإحصائيات بنجاح',
            stats
        });
    } catch (error) {
        console.error('Error fetching statistics:', error);
        res.status(500).json({
            message: 'حدث خطأ أثناء جلب الإحصائيات',
            error: error.message
        });
    }
});

module.exports = router;

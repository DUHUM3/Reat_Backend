const mongoose = require('mongoose');

// 🟢 Category Model (الأقسام)
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }, 
  description: { type: String },
  image: { type: String }, // 🔹 صورة القسم
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null }, // 🔹 القسم الرئيسي
  subcategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }] // 🔹 الأقسام الفرعية
});

// تحديث القسم الرئيسي لإضافة القسم الفرعي تلقائيًا
categorySchema.pre('save', async function (next) {
  if (this.parent) {
    await mongoose.model('Category').updateOne(
      { _id: this.parent },
      { $addToSet: { subcategories: this._id } }
    );
  }
  next();
});

const Category = mongoose.model('Category', categorySchema);

// 🟢 Video Model (الفيديوهات)
const videoSchema = new mongoose.Schema({
  title: { type: String, required: true },
  filename: { type: String },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  series: { type: mongoose.Schema.Types.ObjectId, ref: 'Series' },
  url: { type: String, required: true },
  thumbnail: { type: String }, // 🔹 صورة الغلاف
  uploadedAt: { type: Date, default: Date.now },
  views: { type: Number, default: 0 },
  favorites: { type: Boolean, default: false }, // Added a field to mark as favorite
  favoritesCount: { type: Number, default: 0 } // Added to store the number of favorites
});

// 🔴 منع تكرار اسم الحلقة داخل نفس المسلسل
videoSchema.index({ title: 1, series: 1 }, { unique: true });


videoSchema.pre('save', function (next) {
  if (!this.category && !this.series) {
    return next(new Error('يجب أن يكون الفيديو مرتبطًا إما بقسم أو مسلسل.'));
  }
  next();
});

const Video = mongoose.model('Video', videoSchema);

const seriesSchema = new mongoose.Schema({ 
  title: { type: String, required: true, unique: true },
  description: { type: String },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  imageUrl: { type: String }, // 🔹 رابط صورة المسلسل
  episodes: [
    {
      title: { type: String, required: true },
      videoUrl: { type: String, required: true },
      uploadedAt: { type: Date, default: Date.now }
    }
  ],
  createdAt: { type: Date, default: Date.now }
});


// 🔴 منع تكرار اسم الحلقة داخل نفس المسلسل
seriesSchema.index({ 'episodes.title': 1, title: 1 }, { unique: true });

const Series = mongoose.model('Series', seriesSchema);


const complaintSchema = new mongoose.Schema({
  title: { type: String, required: true }, // عنوان الشكوى
  description: { type: String, required: true }, // وصف الشكوى
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // مقدم الشكوى
  createdAt: { type: Date, default: Date.now } // تاريخ الإنشاء
});

const Complaint = mongoose.model('Complaint', complaintSchema);


module.exports = { Category, Video, Series ,Complaint };

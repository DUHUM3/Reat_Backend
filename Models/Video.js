const mongoose = require('mongoose');

// 🟢 Category Model (الأقسام)
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }, 
  description: { type: String },
  image: { type: String } // 🔹 إضافة حقل الصورة
});

const Category = mongoose.model('Category', categorySchema);

// 🟢 Video Model (الفيديوهات)
const videoSchema = new mongoose.Schema({
  title: { type: String, required: true },
  filename: { type: String },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  series: { type: mongoose.Schema.Types.ObjectId, ref: 'Series' },
  url: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
  views: { type: Number, default: 0 }, // 🔹 حقل عدد المشاهدات
  rating: { type: Number, default: 1, min: 1, max: 1 } // 🔹 منح الفيديو نجمة واحدة دائمًا
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

// 🟢 Series Model (المسلسلات)
const seriesSchema = new mongoose.Schema({
  title: { type: String, required: true, unique: true }, // 🛑 اسم المسلسل يجب أن يكون فريدًا
  description: { type: String },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
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

module.exports = { Category, Video, Series };

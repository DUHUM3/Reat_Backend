const mongoose = require('mongoose');

// 🟢 Category Model (الأقسام)
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }, 
  description: { type: String },
  image: { type: String },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  subcategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }]
});

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
  thumbnail: { type: String },
  uploadedAt: { type: Date, default: Date.now },
  views: { type: Number, default: 0 },
  viewedBy: [{ 
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    viewedAt: { type: Date, default: Date.now }
  }],
  favoritesCount: { type: Number, default: 0 }
});

videoSchema.index({ title: 1, series: 1 }, { unique: true });

videoSchema.pre('save', function (next) {
  if (!this.category && !this.series) {
    return next(new Error('يجب أن يكون الفيديو مرتبطًا إما بقسم أو مسلسل.'));
  }
  next();
});

// Method لتسجيل مشاهدة الفيديو (مرة واحدة لكل مستخدم)
videoSchema.methods.addView = async function(userId) {
  // التحقق إذا كان المستخدم قد شاهد الفيديو من قبل
  const alreadyViewed = this.viewedBy.some(view => view.user.equals(userId));
  
  if (!alreadyViewed) {
    this.views += 1;
    this.viewedBy.push({ user: userId });
    await this.save();
    return true; // تم تسجيل المشاهدة
  }
  return false; // المشاهدة مسجلة مسبقاً
};

const Video = mongoose.model('Video', videoSchema);

// نموذج المفضلة
const favoriteSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  video: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', required: true },
  createdAt: { type: Date, default: Date.now }
});

favoriteSchema.index({ user: 1, video: 1 }, { unique: true });

// Middleware لتحديث عدد المفضلات عند الحفظ
favoriteSchema.post('save', async function(doc) {
  await Video.findByIdAndUpdate(doc.video, { $inc: { favoritesCount: 1 } });
});

// Middleware لتحديث عدد المفضلات عند الحذف
favoriteSchema.post('remove', async function(doc) {
  await Video.findByIdAndUpdate(doc.video, { $inc: { favoritesCount: -1 } });
});

const Favorite = mongoose.model('Favorite', favoriteSchema);

const seriesSchema = new mongoose.Schema({ 
  title: { type: String, required: true, unique: true },
  description: { type: String },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  imageUrl: { type: String },
  episodes: [
    {
      title: { type: String, required: true },
      videoUrl: { type: String, required: true },
      uploadedAt: { type: Date, default: Date.now }
    }
  ],
  createdAt: { type: Date, default: Date.now }
});

seriesSchema.index({ 'episodes.title': 1, title: 1 }, { unique: true });

const Series = mongoose.model('Series', seriesSchema);

const complaintSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

const Complaint = mongoose.model('Complaint', complaintSchema);

module.exports = { Category, Video, Series, Complaint, Favorite };
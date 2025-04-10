const admin = require('firebase-admin');

// تحميل ملف خدمة Firebase JSON
const serviceAccount = require('./rest-d6cae-firebase-adminsdk-fbsvc-933dad5778.json');

// تهيئة Firebase Admin
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

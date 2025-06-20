const jwt = require("jsonwebtoken");
const activeTokens = new Map();  // حفظ التوكنات بناءً على الـ userId

module.exports = {
  generateToken: (user) => {
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    if (activeTokens.has(user._id)) {
      throw new Error("User is already logged in");
    }

    activeTokens.set(user._id, token);  // حفظ التوكن للمستخدم الحالي
    return token;
  },

  verifyToken: (token) => {
    try {
      // نقوم فقط بالتحقق من صلاحية التوكن من خلال فك التشفير
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      return decoded;
    } catch (error) {
      throw new Error("Token is invalid or expired");
    }
  },
  

  revokeToken: (token) => {
    const decoded = jwt.decode(token);
    if (decoded) {
      activeTokens.delete(decoded.userId);  // حذف التوكن عند تسجيل الخروج
    }
  },

  isTokenActive: (token) => {
    const decoded = jwt.decode(token);
    return decoded ? activeTokens.get(decoded.userId) === token : false;
  }
};

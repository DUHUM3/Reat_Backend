const jwt = require("jsonwebtoken");
const activeTokens = new Set();

module.exports = {
  generateToken: (user) => {
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    activeTokens.add(token); // تخزين التوكن نفسه بدلاً من البريد الإلكتروني
    return token;
  },

  verifyToken: (token) => {
    if (!activeTokens.has(token)) {
      throw new Error("Token not active");
    }
    return jwt.verify(token, process.env.JWT_SECRET);
  },

  revokeToken: (token) => {
    activeTokens.delete(token);
  },

  isTokenActive: (token) => {
    return activeTokens.has(token);
  }
};
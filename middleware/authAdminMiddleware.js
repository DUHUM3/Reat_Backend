const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
    const token = req.header("Authorization");
    if (!token) return res.status(401).json({ message: "Access Denied" });
    
    try {
        const verified = jwt.verify(token, "SECRET_KEY");
        req.admin = verified;
        next();
    } catch (error) {
        res.status(400).json({ message: "Invalid Token" });
    }
};

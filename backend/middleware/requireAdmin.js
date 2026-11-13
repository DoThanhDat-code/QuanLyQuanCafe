const authenticate = require("./authenticate");

function requireAdmin(req, res, next) {
    return authenticate(req, res, () => {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                error: "Chỉ Admin mới có quyền thực hiện."
            });
        }

        req.admin = req.user;
        return next();
    });
}

module.exports = requireAdmin;
const authenticate = require("./authenticate");

function authMiddleware(req, res, next) {
    return authenticate(req, res, () => {
        req.user.userId = req.user.user_id;
        return next();
    });
}

module.exports = authMiddleware;
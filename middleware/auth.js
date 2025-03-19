// Authentication middleware
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    
    // Check if it's an API request (expecting JSON)
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(401).json({
            success: false,
            message: 'Please login to continue'
        });
    }
    
    // For regular requests, redirect to login
    req.flash('error', 'Please login to continue');
    res.redirect('/auth/login');
};

// Role-based authorization middleware
exports.hasRole = (roles) => {
    return (req, res, next) => {
        if (!req.isAuthenticated()) {
            if (req.xhr || req.headers.accept.indexOf('json') > -1) {
                return res.status(401).json({ 
                    message: 'Please log in to access this resource' 
                });
            }
            req.flash('error', 'Please log in to access this page');
            return res.redirect('/auth/login');
        }

        if (!roles.includes(req.user.role)) {
            if (req.xhr || req.headers.accept.indexOf('json') > -1) {
                return res.status(403).json({ 
                    message: 'You are not authorized to access this resource' 
                });
            }
            req.flash('error', 'You are not authorized to access this page');
            return res.redirect('/dashboard');
        }

        next();
    };
};

// Profile completion check middleware
exports.isProfileComplete = (req, res, next) => {
    if (!req.isAuthenticated()) {
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(401).json({ 
                message: 'Please log in to access this resource' 
            });
        }
        req.flash('error', 'Please log in to access this page');
        return res.redirect('/auth/login');
    }

    if (!req.user.profileCompleted) {
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(403).json({ 
                message: 'Please complete your profile first' 
            });
        }
        req.flash('error', 'Please complete your profile first');
        return res.redirect('/dashboard/sponsor-registration');
    }

    next();
};

module.exports = {
    isAuthenticated
}; 
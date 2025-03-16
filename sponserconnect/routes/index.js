const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/dashboard');
    }
    res.render('home', { 
        messages: req.flash('error')
    });
});

module.exports = router;
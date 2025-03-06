const express = require('express');
const router = express.Router();
const passport = require('passport');
const User = require('../models/User');
const Listing = require('../models/Listing');
const bcrypt = require('bcryptjs');

// GET /auth/login
router.get('/login', (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/dashboard');
    }
    res.render('auth', { 
        mode: 'login', 
        messages: req.flash('error'),
        user: req.user
    });
});

// GET /auth/signup
router.get('/signup', (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/dashboard');
    }
    res.render('auth', { 
        mode: 'signup', 
        messages: req.flash('error'),
        user: req.user
    });
});

// POST /auth/login
router.post('/login', (req, res, next) => {
    const { email, password } = req.body;
    console.log('Login attempt for email:', email);
    
    // Basic validation
    if (!email || !password) {
        console.log('Login failed: Missing email or password');
        req.flash('error', 'Please provide both email and password');
        return res.redirect('/auth/login');
    }

    passport.authenticate('local', (err, user, info) => {
        if (err) {
            console.error('Login error:', err);
            req.flash('error', 'An error occurred during login');
            return res.redirect('/auth/login');
        }

        if (!user) {
            console.log('Login failed:', info.message);
            req.flash('error', info.message || 'Invalid email or password');
            return res.redirect('/auth/login');
        }

        req.logIn(user, (err) => {
            if (err) {
                console.error('Login error:', err);
                req.flash('error', 'An error occurred during login');
                return res.redirect('/auth/login');
            }
            console.log('User logged in successfully:', user.email);
            return res.redirect('/dashboard');
        });
    })(req, res, next);
});

// POST /auth/signup
router.post('/signup', async (req, res) => {
    console.log('Signup request received:', req.body);
    try {
        const { 
            fullName, 
            email, 
            password, 
            role, 
            companyName, 
            domain, 
            budget, 
            website, 
            amountNeeded, 
            eventDomain,
            description 
        } = req.body;

        // Basic validation
        if (!fullName || !email || !password || !role) {
            const missingFields = [];
            if (!fullName) missingFields.push('Full Name');
            if (!email) missingFields.push('Email');
            if (!password) missingFields.push('Password');
            if (!role) missingFields.push('Role');
            
            req.flash('error', `Missing required fields: ${missingFields.join(', ')}`);
            return res.redirect('/auth/signup');
        }

        // Password validation
        if (password.length < 6) {
            req.flash('error', 'Password must be at least 6 characters long');
            return res.redirect('/auth/signup');
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            req.flash('error', 'Please enter a valid email address');
            return res.redirect('/auth/signup');
        }

        // Check for existing user
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            req.flash('error', 'Email already in use. Please try logging in or use a different email');
            return res.redirect('/auth/signup');
        }

        // Role-specific validation
        if (role === 'sponsor') {
            if (!companyName || !domain || !budget) {
                const missingFields = [];
                if (!companyName) missingFields.push('Company Name');
                if (!domain) missingFields.push('Domain');
                if (!budget) missingFields.push('Budget');
                
                req.flash('error', `Missing sponsor fields: ${missingFields.join(', ')}`);
                return res.redirect('/auth/signup');
            }
            
            if (isNaN(budget) || Number(budget) <= 0) {
                req.flash('error', 'Budget must be a valid number greater than 0');
                return res.redirect('/auth/signup');
            }
        }

        if (role === 'sponsored') {
            if (!amountNeeded || !eventDomain || !description) {
                const missingFields = [];
                if (!amountNeeded) missingFields.push('Amount Needed');
                if (!eventDomain) missingFields.push('Event Domain');
                if (!description) missingFields.push('Description');
                
                req.flash('error', `Missing sponsored fields: ${missingFields.join(', ')}`);
                return res.redirect('/auth/signup');
            }
            
            if (isNaN(amountNeeded) || Number(amountNeeded) <= 0) {
                req.flash('error', 'Amount needed must be a valid number greater than 0');
                return res.redirect('/auth/signup');
            }
        }

        // Process domain field for sponsors
        let processedDomain;
        if (role === 'sponsor') {
            if (Array.isArray(domain)) {
                processedDomain = domain.filter(Boolean);
            } else if (typeof domain === 'string') {
                processedDomain = [domain.trim()];
            } else {
                processedDomain = [];
            }

            if (processedDomain.length === 0) {
                req.flash('error', 'At least one domain must be selected');
                return res.redirect('/auth/signup');
            }
        }

        // Create new user
        const newUser = new User({
            fullName: fullName.trim(),
            email: email.toLowerCase().trim(),
            password,
            role,
            // Sponsor fields
            companyName: role === 'sponsor' ? companyName.trim() : undefined,
            domain: role === 'sponsor' ? processedDomain : undefined,
            budget: role === 'sponsor' ? Math.abs(Number(budget)) : undefined,
            website: role === 'sponsor' && website ? website.trim() : undefined,
            // Sponsored fields
            amountNeeded: role === 'sponsored' ? Math.abs(Number(amountNeeded)) : undefined,
            eventDomain: role === 'sponsored' ? eventDomain : undefined,
            description: role === 'sponsored' ? description.trim() : undefined
        });

        // Save user to database
        const savedUser = await newUser.save();
        console.log('User saved successfully:', savedUser._id);

        // Create default listing based on user role
        const defaultListing = new Listing({
            user: savedUser._id,
            title: role === 'sponsor' ? 
                `${companyName || 'Company'} Sponsorship Opportunity` : 
                `${fullName}'s Sponsorship Request`,
            description: role === 'sponsor' ? 
                `${companyName || 'We'} are looking to sponsor talented individuals in ${processedDomain.join(', ')}` : 
                description || 'Looking for sponsorship opportunities',
            domain: role === 'sponsor' ? 
                processedDomain[0] : 
                eventDomain,
            amount: role === 'sponsor' ? 
                Math.abs(Number(budget)) : 
                Math.abs(Number(amountNeeded)),
            requirements: role === 'sponsor' ? 
                'Open to discussing requirements with potential candidates' : 
                'Looking for sponsorship support',
            status: 'active'
        });

        await defaultListing.save();
        console.log('Default listing created:', defaultListing._id);

        // Log the user in
        req.login(savedUser, (err) => {
            if (err) {
                console.error('Auto-login error:', err);
                req.flash('success', 'Account created successfully! Please log in.');
                return res.redirect('/auth/login');
            }
            console.log('User logged in automatically after signup');
            return res.redirect('/dashboard');
        });

    } catch (err) {
        console.error('Signup error:', err);
        if (err.code === 11000) {
            req.flash('error', 'Email already exists');
        } else {
            req.flash('error', 'Error creating account');
        }
        res.redirect('/auth/signup');
    }
});

// GET /auth/logout
router.get('/logout', (req, res, next) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/');
    }
    
    req.logout((err) => {
        if (err) { 
            console.error('Logout error:', err);
            return next(err); 
        }
        req.flash('success', 'Successfully logged out');
        res.redirect('/');
    });
});

module.exports = router;
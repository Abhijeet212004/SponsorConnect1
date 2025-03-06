const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Sponsorship = require('../models/Sponsorship');

// GET /dashboard
router.get('/', async (req, res) => {
    try {
        // Double-check authentication
        if (!req.isAuthenticated() || !req.user) {
            console.log('User not authenticated, redirecting to login');
            req.flash('error', 'Please log in to access the dashboard');
            return res.redirect('/auth/login');
        }

        console.log('Authenticated user accessing dashboard:', req.user.email);

        // Get users based on role
        let users;
        if (req.user.role === 'sponsor') {
            users = await User.find({ 
                role: 'sponsored',
                profileCompleted: true
            })
            .select('fullName eventDomain amountNeeded description')
            .sort('-createdAt');
        } else {
            users = await User.find({ 
                role: 'sponsor',
                profileCompleted: true
            })
            .select('fullName companyName budget domain website')
            .sort('-createdAt');
        }

        // Get sponsorships
        const [pending, active, history] = await Promise.all([
            Sponsorship.getPendingForUser(req.user._id),
            Sponsorship.getActiveForUser(req.user._id),
            Sponsorship.getHistoryForUser(req.user._id)
        ]);

        // Render dashboard with data
        res.render('dashboard', { 
            user: req.user,
            users,
            sponsorships: {
                pending,
                active,
                history
            },
            messages: req.flash()
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        req.flash('error', 'Error loading dashboard');
        res.redirect('/');
    }
});

// GET /dashboard/sponsor-registration
router.get('/sponsor-registration', async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== 'sponsor') {
        return res.redirect('/dashboard');
    }
    
    res.render('sponsor-registration', {
        user: req.user,
        messages: req.flash()
    });
});

// POST /dashboard/sponsor-registration
router.post('/sponsor-registration', async (req, res) => {
    try {
        if (!req.isAuthenticated() || req.user.role !== 'sponsor') {
            return res.redirect('/dashboard');
        }

        const { companyName, domain, budget, website } = req.body;

        // Validation
        if (!companyName || !domain || !budget) {
            req.flash('error', 'Please fill in all required fields');
            return res.redirect('/dashboard/sponsor-registration');
        }

        if (isNaN(budget) || Number(budget) <= 0) {
            req.flash('error', 'Budget must be a valid number greater than 0');
            return res.redirect('/dashboard/sponsor-registration');
        }

        // Update user profile
        await User.findByIdAndUpdate(req.user._id, {
            companyName: companyName.trim(),
            domain: Array.isArray(domain) ? domain : [domain],
            budget: Math.abs(Number(budget)),
            website: website ? website.trim() : undefined
        });

        req.flash('success', 'Sponsor profile updated successfully');
        res.redirect('/dashboard');
    } catch (err) {
        console.error('Sponsor registration error:', err);
        req.flash('error', 'Error updating sponsor profile');
        res.redirect('/dashboard/sponsor-registration');
    }
});

// POST /dashboard/sponsor
router.post('/sponsor', async (req, res) => {
    try {
        if (!req.isAuthenticated() || req.user.role !== 'sponsor') {
            return res.status(403).json({ 
                success: false, 
                message: 'Unauthorized' 
            });
        }

        const { sponsoredId, amount } = req.body;
        
        // Validate amount against sponsor's budget
        if (amount > req.user.budget) {
            req.flash('error', 'Amount exceeds your budget');
            return res.redirect('/dashboard');
        }

        // Get sponsored user
        const sponsored = await User.findById(sponsoredId);
        if (!sponsored || sponsored.role !== 'sponsored') {
            req.flash('error', 'Invalid sponsored user');
            return res.redirect('/dashboard');
        }

        // Create new sponsorship
        const sponsorship = new Sponsorship({
            sponsor: req.user._id,
            sponsored: sponsoredId,
            amount: amount,
            domain: sponsored.eventDomain,
            status: 'pending'
        });

        await sponsorship.save();

        req.flash('success', 'Sponsorship request sent successfully');
        res.redirect('/dashboard');
    } catch (err) {
        console.error('Sponsorship error:', err);
        req.flash('error', 'Error processing sponsorship request');
        res.redirect('/dashboard');
    }
});

// POST /dashboard/respond
router.post('/respond', async (req, res) => {
    try {
        const { sponsorshipId, action } = req.body;
        
        if (!['accept', 'reject'].includes(action)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid action' 
            });
        }

        const sponsorship = await Sponsorship.findById(sponsorshipId);
        if (!sponsorship) {
            return res.status(404).json({ 
                success: false, 
                message: 'Sponsorship not found' 
            });
        }

        sponsorship.status = action === 'accept' ? 'accepted' : 'rejected';
        await sponsorship.save();

        res.json({ success: true });
    } catch (err) {
        console.error('Response error:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Error processing response' 
        });
    }
});

module.exports = router;
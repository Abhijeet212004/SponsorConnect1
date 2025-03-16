const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/User');
const Sponsorship = require('../models/Sponsorship');
const Listing = require('../models/Listing');
const Notification = require('../models/Notification');

// Apply authentication middleware
router.use(isAuthenticated);

// GET /dashboard
router.get('/', async (req, res) => {
    try {
        // Fetch listings based on user role
        const listings = await Listing.aggregate([
            {
                $lookup: {
                    from: 'users',
                    localField: 'user',
                    foreignField: '_id',
                    as: 'userDetails'
                }
            },
            {
                $match: {
                    'userDetails.0._id': { $ne: req.user._id },
                    status: 'active',
                    $or: [
                        // If current user is sponsor, show only listings from users looking for sponsorship
                        {
                            $and: [
                                { 'userDetails.0.role': { $ne: 'sponsor' } },
                                { $expr: { $eq: ['sponsor', req.user.role] } }
                            ]
                        },
                        // If current user is seeking sponsorship, show only listings from sponsors
                        {
                            $and: [
                                { 'userDetails.0.role': 'sponsor' },
                                { $expr: { $ne: ['sponsor', req.user.role] } }
                            ]
                        }
                    ]
                }
            },
            {
                $sort: { createdAt: -1 }
            }
        ]);

        // Fetch user's own listings
        const userListings = await Listing.find({ 
            user: req.user._id,
            status: 'active'
        }).sort('-createdAt');

        // Get unique domains for filter
        const domains = [...new Set(listings.map(listing => listing.domain))];

        // Fetch pending notifications with payment details
        const notifications = await Notification.find({
            to: req.user._id,
            status: 'accepted',
            paymentStatus: { $ne: 'completed' },
            listingId: { $ne: null }
        })
        .populate('from', 'fullName email')
        .populate('listingId', 'title amount')
        .sort('-createdAt');

        // Filter out notifications with invalid listingId
        const validNotifications = notifications.filter(notification => 
            notification.listingId && notification.from
        );

        res.render('dashboard', {
            user: req.user,
            listings,
            userListings,
            domains,
            notifications: validNotifications,
            messages: {
                success: req.flash('success'),
                error: req.flash('error')
            }
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        req.flash('error', 'Error loading dashboard');
        res.redirect('/');
    }
});

// GET /dashboard/listings - Get filtered listings
router.get('/listings', async (req, res) => {
    try {
        const { domain, minAmount, maxAmount, sort } = req.query;
        
        // Build aggregation pipeline
        const pipeline = [
            {
                $lookup: {
                    from: 'users',
                    localField: 'user',
                    foreignField: '_id',
                    as: 'userDetails'
                }
            },
            {
                $match: {
                    'userDetails.0._id': { $ne: req.user._id },
                    status: 'active',
                    $or: [
                        // If current user is sponsor, show only listings from users looking for sponsorship
                        {
                            $and: [
                                { 'userDetails.0.role': { $ne: 'sponsor' } },
                                { $expr: { $eq: ['sponsor', req.user.role] } }
                            ]
                        },
                        // If current user is seeking sponsorship, show only listings from sponsors
                        {
                            $and: [
                                { 'userDetails.0.role': 'sponsor' },
                                { $expr: { $ne: ['sponsor', req.user.role] } }
                            ]
                        }
                    ]
                }
            }
        ];

        // Add domain filter if specified
        if (domain && domain !== 'all') {
            pipeline.push({
                $match: { domain: domain.toLowerCase() }
            });
        }

        // Add amount filter if specified
        if (minAmount || maxAmount) {
            const amountFilter = {};
            if (minAmount) amountFilter.$gte = Number(minAmount);
            if (maxAmount) amountFilter.$lte = Number(maxAmount);
            pipeline.push({
                $match: { amount: amountFilter }
            });
        }

        // Add sorting
        let sortStage = { $sort: { createdAt: -1 } };
        switch(sort) {
            case 'amount_asc':
                sortStage = { $sort: { amount: 1 } };
                break;
            case 'amount_desc':
                sortStage = { $sort: { amount: -1 } };
                break;
        }
        pipeline.push(sortStage);

        const listings = await Listing.aggregate(pipeline);

        res.json({ success: true, listings });
    } catch (err) {
        console.error('Filter listings error:', err);
        res.status(500).json({ success: false, message: 'Error filtering listings' });
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
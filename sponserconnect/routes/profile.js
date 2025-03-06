const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Sponsorship = require('../models/Sponsorship');
const Listing = require('../models/Listing');

// GET /profile
router.get('/', async (req, res) => {
    try {
        if (!req.isAuthenticated()) {
            req.flash('error', 'Please log in to view your profile');
            return res.redirect('/auth/login');
        }

        // Fetch user with populated history
        const user = await User.findById(req.user._id)
            .select('-password');

        // Fetch user's listings
        const listings = await Listing.find({ user: req.user._id })
            .sort('-createdAt');

        // Fetch all sponsorships where user is either sponsor or sponsored
        const sponsorships = await Sponsorship.find({
            $or: [
                { sponsor: req.user._id },
                { sponsored: req.user._id }
            ]
        })
        .populate('sponsor', 'fullName companyName')
        .populate('sponsored', 'fullName description')
        .sort('-createdAt');

        // Calculate total transactions
        const totalSponsored = sponsorships
            .filter(s => s.sponsor.toString() === req.user._id.toString() && s.status === 'accepted')
            .reduce((sum, s) => sum + s.amount, 0);

        const totalReceived = sponsorships
            .filter(s => s.sponsored.toString() === req.user._id.toString() && s.status === 'accepted')
            .reduce((sum, s) => sum + s.amount, 0);

        res.render('profile', {
            user,
            listings,
            sponsorships,
            totalSponsored,
            totalReceived,
            messages: req.flash()
        });
    } catch (err) {
        console.error('Profile error:', err);
        req.flash('error', 'Error loading profile');
        res.redirect('/');
    }
});

// GET /profile/seekers - Get available seekers for sponsors
router.get('/seekers', async (req, res) => {
    try {
        if (req.user.role !== 'sponsor') {
            return res.status(403).json({ message: 'Only sponsors can view seekers' });
        }

        const seekers = await User.find({
            role: 'sponsored',
            _id: { $ne: req.user._id }
        })
        .select('fullName eventDomain amountNeeded')
        .sort('-createdAt');

        res.json({ seekers });
    } catch (err) {
        console.error('Error fetching seekers:', err);
        res.status(500).json({ message: 'Error fetching seekers' });
    }
});

// POST /profile/listing - Create a new listing
router.post('/listing', async (req, res) => {
    try {
        const { title, description, domain, amount, requirements } = req.body;

        const listing = new Listing({
            user: req.user._id,
            title,
            description,
            domain,
            amount: Number(amount),
            requirements,
            status: 'active'
        });

        await listing.save();
        res.json({ success: true, listing, message: 'Listing created successfully' });
    } catch (err) {
        console.error('Create listing error:', err);
        res.status(500).json({ success: false, message: 'Error creating listing' });
    }
});

// PUT /profile/listing/:id - Update a listing
router.put('/listing/:id', async (req, res) => {
    try {
        const { title, description, domain, amount, requirements } = req.body;
        const listing = await Listing.findById(req.params.id);

        if (!listing) {
            return res.status(404).json({ success: false, message: 'Listing not found' });
        }

        if (listing.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized to edit this listing' });
        }

        listing.title = title;
        listing.description = description;
        listing.domain = domain;
        listing.amount = Number(amount);
        listing.requirements = requirements;

        await listing.save();
        res.json({ success: true, listing });
    } catch (err) {
        console.error('Update listing error:', err);
        res.status(500).json({ success: false, message: 'Error updating listing' });
    }
});

// DELETE /profile/listing/:id
router.delete('/listing/:id', async (req, res) => {
    try {
        const listing = await Listing.findById(req.params.id);
        
        if (!listing) {
            return res.status(404).json({ success: false, message: 'Listing not found' });
        }

        if (listing.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized to delete this listing' });
        }

        await Listing.deleteOne({ _id: req.params.id });
        res.json({ success: true, message: 'Listing deleted successfully' });
    } catch (err) {
        console.error('Delete listing error:', err);
        res.status(500).json({ success: false, message: 'Error deleting listing' });
    }
});

// POST /profile/update
router.post('/update', async (req, res) => {
    try {
        if (!req.user) {
            return res.redirect('/auth/login');
        }

        const { 
            fullName, 
            companyName, 
            domain, 
            budget, 
            website, 
            amountNeeded, 
            description 
        } = req.body;

        const user = await User.findById(req.user._id);
        if (!user) {
            req.flash('error', 'User not found');
            return res.redirect('/profile');
        }

        // Update basic info
        user.fullName = fullName || user.fullName;

        // Update role-specific profile
        if (user.role === 'sponsor') {
            user.companyName = companyName || user.companyName;
            user.budget = budget || user.budget;
            user.website = website || user.website;
        } else {
            user.amountNeeded = amountNeeded || user.amountNeeded;
            user.description = description || user.description;
        }

        // Update common profile fields
        user.eventDomain = domain || user.eventDomain;

        await user.save();
        req.flash('success', 'Profile updated successfully');
        res.redirect('/profile');
    } catch (err) {
        console.error('Profile update error:', err);
        req.flash('error', 'Error updating profile');
        res.redirect('/profile');
    }
});

module.exports = router;
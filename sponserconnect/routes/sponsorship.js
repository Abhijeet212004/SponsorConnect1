const express = require('express');
const router = express.Router();
const Sponsorship = require('../models/Sponsorship');
const User = require('../models/User');
const { isAuthenticated } = require('../middleware/auth');

// Get all sponsorship opportunities
router.get('/opportunities', isAuthenticated, async (req, res) => {
    try {
        const { domain } = req.query;
        let query = { role: 'sponsored', profileCompleted: true };
        
        if (domain) {
            query.eventDomain = domain;
        }
        
        const opportunities = await User.find(query)
            .select('fullName eventDomain amountNeeded description')
            .sort('-createdAt');
        
        res.json(opportunities);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching opportunities' });
    }
});

// Initiate a sponsorship
router.post('/initiate', isAuthenticated, async (req, res) => {
    try {
        const { sponsoredId, amount, message } = req.body;
        
        // Validate sponsor
        if (req.user.role !== 'sponsor') {
            return res.status(403).json({ message: 'Only sponsors can initiate sponsorships' });
        }
        
        if (!req.user.profileCompleted) {
            return res.status(403).json({ message: 'Please complete your profile before initiating sponsorships' });
        }
        
        // Validate sponsored user
        const sponsored = await User.findById(sponsoredId);
        if (!sponsored || sponsored.role !== 'sponsored') {
            return res.status(404).json({ message: 'Sponsored user not found' });
        }
        
        // Check if there's already a pending sponsorship
        const existingSponsorship = await Sponsorship.findOne({
            sponsor: req.user._id,
            sponsored: sponsoredId,
            status: 'pending'
        });
        
        if (existingSponsorship) {
            return res.status(400).json({ message: 'You already have a pending sponsorship with this user' });
        }
        
        // Create sponsorship
        const sponsorship = new Sponsorship({
            sponsor: req.user._id,
            sponsored: sponsoredId,
            amount,
            domain: sponsored.eventDomain,
            message
        });
        
        await sponsorship.save();
        
        res.status(201).json({
            message: 'Sponsorship request sent successfully',
            sponsorship: await sponsorship.populate('sponsor sponsored')
        });
    } catch (error) {
        res.status(500).json({ message: 'Error initiating sponsorship' });
    }
});

// Accept a sponsorship
router.post('/:id/accept', isAuthenticated, async (req, res) => {
    try {
        const sponsorship = await Sponsorship.findById(req.params.id);
        
        if (!sponsorship) {
            return res.status(404).json({ message: 'Sponsorship not found' });
        }
        
        if (sponsorship.sponsored.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }
        
        if (sponsorship.status !== 'pending') {
            return res.status(400).json({ message: 'Sponsorship is not pending' });
        }
        
        await sponsorship.accept();
        
        res.json({
            message: 'Sponsorship accepted successfully',
            sponsorship: await sponsorship.populate('sponsor sponsored')
        });
    } catch (error) {
        res.status(500).json({ message: 'Error accepting sponsorship' });
    }
});

// Reject a sponsorship
router.post('/:id/reject', isAuthenticated, async (req, res) => {
    try {
        const sponsorship = await Sponsorship.findById(req.params.id);
        
        if (!sponsorship) {
            return res.status(404).json({ message: 'Sponsorship not found' });
        }
        
        if (sponsorship.sponsored.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }
        
        if (sponsorship.status !== 'pending') {
            return res.status(400).json({ message: 'Sponsorship is not pending' });
        }
        
        await sponsorship.reject();
        
        res.json({
            message: 'Sponsorship rejected successfully',
            sponsorship: await sponsorship.populate('sponsor sponsored')
        });
    } catch (error) {
        res.status(500).json({ message: 'Error rejecting sponsorship' });
    }
});

// Complete a sponsorship
router.post('/:id/complete', isAuthenticated, async (req, res) => {
    try {
        const sponsorship = await Sponsorship.findById(req.params.id);
        
        if (!sponsorship) {
            return res.status(404).json({ message: 'Sponsorship not found' });
        }
        
        if (sponsorship.sponsor.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }
        
        if (sponsorship.status !== 'accepted') {
            return res.status(400).json({ message: 'Sponsorship must be accepted before completion' });
        }
        
        await sponsorship.complete();
        
        res.json({
            message: 'Sponsorship completed successfully',
            sponsorship: await sponsorship.populate('sponsor sponsored')
        });
    } catch (error) {
        res.status(500).json({ message: 'Error completing sponsorship' });
    }
});

// Get user's sponsorships
router.get('/my-sponsorships', isAuthenticated, async (req, res) => {
    try {
        const [pending, active, history] = await Promise.all([
            Sponsorship.getPendingForUser(req.user._id),
            Sponsorship.getActiveForUser(req.user._id),
            Sponsorship.getHistoryForUser(req.user._id)
        ]);
        
        res.json({
            pending,
            active,
            history
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching sponsorships' });
    }
});

module.exports = router; 
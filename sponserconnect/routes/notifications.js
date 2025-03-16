const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const Notification = require('../models/Notification');
const User = require('../models/User');
const Listing = require('../models/Listing');

// Apply authentication middleware to all routes
router.use(isAuthenticated);

// Get all notifications for the current user
router.get('/', async (req, res) => {
    try {
        const notifications = await Notification.find({ to: req.user._id })
            .populate('from', 'fullName email companyName role')
            .populate('listingId', 'title')
            .sort('-createdAt');

        res.json({ success: true, notifications });
    } catch (err) {
        console.error('Error fetching notifications:', err);
        res.status(500).json({ success: false, message: 'Error fetching notifications' });
    }
});

// Send connection request
router.post('/connect', async (req, res) => {
    try {
        const { userId, listingId, message } = req.body;

        // Validate the listing and user exist
        const [listing, toUser] = await Promise.all([
            Listing.findById(listingId),
            User.findById(userId)
        ]);

        if (!listing || !toUser) {
            return res.status(404).json({ 
                success: false, 
                message: 'Listing or user not found' 
            });
        }

        // Check if a pending request already exists
        const existingRequest = await Notification.findOne({
            from: req.user._id,
            to: userId,
            listingId,
            type: 'connection_request',
            status: 'pending'
        });

        if (existingRequest) {
            return res.status(400).json({
                success: false,
                message: 'A pending request already exists'
            });
        }

        // Create notification content
        const content = `${req.user.fullName} would like to connect regarding listing: ${listing.title}`;

        // Create new notification
        const notification = new Notification({
            type: 'connection_request',
            user: userId, // The user who will receive the notification
            from: req.user._id,
            to: userId,
            listingId,
            content,
            message: message || 'Interested in connecting regarding your listing.',
            status: 'pending'
        });

        await notification.save();

        res.json({
            success: true,
            message: 'Connection request sent successfully'
        });
    } catch (err) {
        console.error('Error sending connection request:', err);
        res.status(500).json({
            success: false,
            message: 'Error sending connection request'
        });
    }
});

// Respond to connection request
router.post('/respond', async (req, res) => {
    try {
        const { notificationId, action } = req.body;

        if (!['accepted', 'rejected'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid action'
            });
        }

        const notification = await Notification.findById(notificationId)
            .populate('from', 'fullName email')
            .populate('listingId', 'title');

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        if (notification.to.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }

        notification.status = action;
        await notification.save();

        if (action === 'accepted') {
            // Create acceptance notification for the sender
            const content = `${req.user.fullName} has accepted your connection request for "${notification.listingId.title}"`;
            
            const acceptanceNotification = new Notification({
                type: 'connection_accepted',
                user: notification.from._id, // The user who will receive this notification
                from: req.user._id,
                to: notification.from._id,
                listingId: notification.listingId._id,
                content: content,
                message: `You can now contact ${req.user.fullName} at ${req.user.email}`,
                status: 'accepted'
            });
            
            await acceptanceNotification.save();
        }

        res.json({
            success: true,
            message: `Connection request ${action}`
        });
    } catch (err) {
        console.error('Error responding to connection request:', err);
        res.status(500).json({
            success: false,
            message: 'Error responding to connection request'
        });
    }
});

// Mark notification as read
router.post('/read/:id', async (req, res) => {
    try {
        const notification = await Notification.findById(req.params.id);

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        if (notification.to.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }

        notification.read = true;
        await notification.save();

        res.json({
            success: true,
            message: 'Notification marked as read'
        });
    } catch (err) {
        console.error('Error marking notification as read:', err);
        res.status(500).json({
            success: false,
            message: 'Error marking notification as read'
        });
    }
});

module.exports = router; 
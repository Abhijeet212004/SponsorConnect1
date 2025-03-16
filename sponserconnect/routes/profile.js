const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/User');
const Sponsorship = require('../models/Sponsorship');
const Listing = require('../models/Listing');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Notification = require('../models/Notification');

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'public/uploads/profile-photos';
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'photo-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only image files are allowed!'));
    }
});

// Apply authentication middleware to all profile routes
router.use(isAuthenticated);

// GET /profile
router.get('/', async (req, res) => {
    try {
        // Fetch user's listings
        const listings = await Listing.find({ user: req.user._id }).sort('-createdAt');

        // Fetch user's sponsorships
        const sponsorships = await Sponsorship.find({
            $or: [
                { sponsor: req.user._id },
                { sponsored: req.user._id }
            ]
        })
        .populate('sponsor', 'fullName companyName')
        .populate('sponsored', 'fullName')
        .sort('-createdAt');

        // Calculate total amounts
        const totalSponsored = sponsorships
            .filter(s => s.sponsor.toString() === req.user._id.toString() && s.status === 'active')
            .reduce((sum, s) => sum + s.amount, 0);

        const totalReceived = sponsorships
            .filter(s => s.sponsored.toString() === req.user._id.toString() && s.status === 'active')
            .reduce((sum, s) => sum + s.amount, 0);

        // Fetch user with populated transactions
        const user = await User.findById(req.user._id)
            .populate('transactions.counterparty', 'fullName companyName role');

        // Fetch notifications
        const notifications = await Notification.find({ to: req.user._id })
            .populate('from', 'fullName email companyName role')
            .populate('listingId', 'title amount')
            .sort('-createdAt');

        res.render('profile', { 
            user: user, 
            listings,
            sponsorships,
            totalSponsored,
            totalReceived,
            notifications,
            messages: {
                success: req.flash('success'),
                error: req.flash('error')
            }
        });
    } catch (err) {
        console.error('Profile view error:', err);
        req.flash('error', 'Error loading profile');
        res.redirect('/dashboard');
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
        const { title, description, domain, amount } = req.body;

        // Validate required fields
        if (!title || !description || !domain || !amount) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        const listing = new Listing({
            user: req.user._id,
            title,
            description,
            domain: domain.toLowerCase(),
            amount: Number(amount),
            status: 'active'
        });

        const savedListing = await listing.save();
        res.json({
            success: true,
            listing: savedListing,
            message: 'Listing created successfully'
        });
    } catch (err) {
        console.error('Create listing error:', err);
        res.status(500).json({
            success: false,
            message: 'Error creating listing'
        });
    }
});

// PUT /profile/listing/:id - Update a listing
router.put('/listing/:id', async (req, res) => {
    try {
        const { title, description, domain, amount } = req.body;
        
        // Validate required fields
        if (!title || !description || !domain || !amount) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        const listing = await Listing.findById(req.params.id);

        if (!listing) {
            return res.status(404).json({
                success: false,
                message: 'Listing not found'
            });
        }

        if (listing.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to edit this listing'
            });
        }

        listing.title = title;
        listing.description = description;
        listing.domain = domain.toLowerCase();
        listing.amount = Number(amount);

        const updatedListing = await listing.save();
        res.json({
            success: true,
            listing: updatedListing,
            message: 'Listing updated successfully'
        });
    } catch (err) {
        console.error('Update listing error:', err);
        res.status(500).json({
            success: false,
            message: 'Error updating listing'
        });
    }
});

// DELETE /profile/listing/:id
router.delete('/listing/:id', async (req, res) => {
    try {
        const listing = await Listing.findById(req.params.id);
        
        if (!listing) {
            return res.status(404).json({
                success: false,
                message: 'Listing not found'
            });
        }

        if (listing.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete this listing'
            });
        }

        await Listing.deleteOne({ _id: req.params.id });
        res.json({
            success: true,
            message: 'Listing deleted successfully'
        });
    } catch (err) {
        console.error('Delete listing error:', err);
        res.status(500).json({
            success: false,
            message: 'Error deleting listing'
        });
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

// POST /profile/upload-photo
router.post('/upload-photo', upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            // Delete the uploaded file
            fs.unlinkSync(req.file.path);
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Delete old photo if it exists and is not the default
        if (user.photoUrl && user.photoUrl !== '/images/default-avatar.png') {
            const oldPhotoPath = path.join(__dirname, '..', 'public', user.photoUrl);
            if (fs.existsSync(oldPhotoPath)) {
                fs.unlinkSync(oldPhotoPath);
            }
        }

        // Update user's photo URL
        const photoUrl = '/uploads/profile-photos/' + req.file.filename;
        user.photoUrl = photoUrl;
        await user.save();

        res.json({
            success: true,
            photoUrl: photoUrl,
            message: 'Profile photo updated successfully'
        });
    } catch (err) {
        console.error('Photo upload error:', err);
        // Delete the uploaded file if there was an error
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({
            success: false,
            message: 'Error uploading photo'
        });
    }
});

module.exports = router;
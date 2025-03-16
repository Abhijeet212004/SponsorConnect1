const mongoose = require('mongoose');

const listingSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    domain: {
        type: String,
        required: true,
        trim: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    requirements: {
        type: String,
        trim: true
    },
    status: {
        type: String,
        enum: ['active', 'pending', 'closed'],
        default: 'active'
    }
}, {
    timestamps: true
});

// Add indexes for better query performance
listingSchema.index({ user: 1, status: 1 });
listingSchema.index({ domain: 1, status: 1 });
listingSchema.index({ createdAt: -1 });

const Listing = mongoose.model('Listing', listingSchema);

module.exports = Listing; 
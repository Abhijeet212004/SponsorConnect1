const mongoose = require('mongoose');

const sponsorshipSchema = new mongoose.Schema({
    sponsor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Sponsor is required']
    },
    sponsored: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Sponsored user is required']
    },
    amount: {
        type: Number,
        required: [true, 'Amount is required'],
        min: [1, 'Amount must be greater than 0']
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected', 'completed'],
        default: 'pending'
    },
    domain: {
        type: String,
        required: [true, 'Domain is required']
    },
    message: {
        type: String,
        trim: true
    },
    acceptedAt: {
        type: Date
    },
    completedAt: {
        type: Date
    }
}, {
    timestamps: true
});

// Indexes for better query performance
sponsorshipSchema.index({ sponsor: 1, status: 1 });
sponsorshipSchema.index({ sponsored: 1, status: 1 });
sponsorshipSchema.index({ domain: 1 });
sponsorshipSchema.index({ status: 1, createdAt: -1 });

// Virtual populate for sponsor and sponsored user details
sponsorshipSchema.virtual('sponsorDetails', {
    ref: 'User',
    localField: 'sponsor',
    foreignField: '_id',
    justOne: true
});

sponsorshipSchema.virtual('sponsoredDetails', {
    ref: 'User',
    localField: 'sponsored',
    foreignField: '_id',
    justOne: true
});

// Methods
sponsorshipSchema.methods.accept = async function() {
    this.status = 'accepted';
    this.acceptedAt = new Date();
    await this.save();
};

sponsorshipSchema.methods.reject = async function() {
    this.status = 'rejected';
    await this.save();
};

sponsorshipSchema.methods.complete = async function() {
    this.status = 'completed';
    this.completedAt = new Date();
    await this.save();
};

// Static methods
sponsorshipSchema.statics.getPendingForUser = async function(userId) {
    return this.find({
        $or: [
            { sponsor: userId, status: 'pending' },
            { sponsored: userId, status: 'pending' }
        ]
    }).populate('sponsor sponsored');
};

sponsorshipSchema.statics.getActiveForUser = async function(userId) {
    return this.find({
        $or: [
            { sponsor: userId, status: 'accepted' },
            { sponsored: userId, status: 'accepted' }
        ]
    }).populate('sponsor sponsored');
};

sponsorshipSchema.statics.getHistoryForUser = async function(userId) {
    return this.find({
        $or: [
            { sponsor: userId },
            { sponsored: userId }
        ],
        status: { $in: ['completed', 'rejected'] }
    }).sort({ updatedAt: -1 }).populate('sponsor sponsored');
};

const Sponsorship = mongoose.model('Sponsorship', sponsorshipSchema);

module.exports = Sponsorship;
const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    sponsorship: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Sponsorship',
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    currency: {
        type: String,
        default: 'usd'
    },
    stripePaymentIntentId: {
        type: String,
        required: true,
        unique: true
    },
    status: {
        type: String,
        enum: ['pending', 'succeeded', 'failed', 'refunded'],
        default: 'pending'
    },
    paymentMethod: {
        type: String,
        required: true
    },
    payer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    riskScore: {
        type: Number,
        min: 0,
        max: 100
    },
    verificationStatus: {
        type: String,
        enum: ['pending', 'verified', 'failed'],
        default: 'pending'
    },
    metadata: {
        ipAddress: String,
        userAgent: String,
        location: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Add indexes for better query performance
paymentSchema.index({ sponsorship: 1, status: 1 });
paymentSchema.index({ stripePaymentIntentId: 1 });
paymentSchema.index({ payer: 1, status: 1 });
paymentSchema.index({ recipient: 1, status: 1 });

// Update timestamp on save
paymentSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment; 